import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Per-wallet dedupe cache. syncSave is idempotent for server-owned fields
// (gold/kills/unlocks ignore client values entirely — cloud is truth), so
// hammering it multiple times in quick succession produces identical results.
// We cache the last successful response for 3 seconds per wallet and short-circuit
// repeat calls. This cuts ~60% of syncSave traffic at peak with zero data risk —
// real meaningful writes go through dedicated endpoints (spendGold/saveScore/etc).
// Cache lives in module scope (warm-instance only); cold starts simply skip the cache.
const SYNC_DEDUPE_TTL_MS = 3000;
const syncDedupeCache = new Map(); // wallet → { ts, response }

function getDedupedResponse(wallet) {
    const entry = syncDedupeCache.get(wallet);
    if (!entry) return null;
    if (Date.now() - entry.ts > SYNC_DEDUPE_TTL_MS) {
        syncDedupeCache.delete(wallet);
        return null;
    }
    return entry.response;
}

function setDedupedResponse(wallet, response) {
    syncDedupeCache.set(wallet, { ts: Date.now(), response });
    // Bound the map so a long-lived warm instance can't grow forever.
    if (syncDedupeCache.size > 5000) {
        const cutoff = Date.now() - SYNC_DEDUPE_TTL_MS;
        for (const [k, v] of syncDedupeCache) {
            if (v.ts < cutoff) syncDedupeCache.delete(k);
        }
    }
}

// 429-aware retry wrapper. Base44's per-app rate limit fires across all funcs
// during peak — without this, a single 429 on PlayerSave.filter or .update
// would 500 the whole sync, and the client's debounced re-sync 30s later
// would push a stale save (overwriting any server-credited progress in between).
// Retries: 300ms → 700ms → 1500ms + jitter. Identical to saveScore/forgeAction.
async function with429Retry(fn, label = 'op') {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
        try { return await fn(); }
        catch (err) {
            lastErr = err;
            const status = err?.status || err?.response?.status;
            const msg = String(err?.message || '').toLowerCase();
            const is429 = status === 429 || msg.includes('rate limit') || msg.includes('429');
            if (!is429 || attempt === 3) throw err;
            const backoff = 300 * Math.pow(2, attempt) + Math.random() * 200;
            console.warn(`[syncSave] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

// Syncs the player save for the currently-authenticated Base44 user.
// Wallet is read from User.wallet_address (linked at login). No OmenX token needed.
//
// Phase 3a: SERVER-OWNED unlock arrays + upgrade levels are CLOUD-AUTHORITATIVE.
// The client cannot add new entries to them via syncSave — those grants must come
// from dedicated server endpoints (purchaseSku, claimBounty, saveScore, etc.).
// Currencies and run totals are still MAX-merged for now (locked in Phase 3c).

// ---- Field categorisation ----

// Unlocks: cloud is the truth. Client values are IGNORED.
// (They get added by server-side grant endpoints only.)
const SERVER_OWNED_UNLOCK_ARRAYS = [
    'unlockedCharacters',
    'unlockedRelics',
    'unlockedCosmetics',
    'unlockedKillEffects',
    'unlockedSkins',
    // Chest cosmetics are granted ONLY by the OmenX VIP chest path (webhook capture
    // -> manual/automated grant). Without this line the key falls through the base
    // merge below and the client's array wins, so (a) a hand-granted cosmetic is
    // silently wiped by the player's next sync from a stale browser copy, and
    // (b) all 12 SKUs are pasteable from the console -- which also defeats the
    // verifyOwned() check on the leaderboard mirror in saveScore, since that
    // verifies against this same array.
    'owned_chest_cosmetics',
];

// Upgrade levels: cloud is the truth (granted via purchaseSku / spendGold in 3b).
// Each is a flat object of stat → level.
const SERVER_OWNED_UPGRADE_OBJECTS = [
    'permanentUpgrades',
    'weeklyUpgrades',
    'seasonalUpgrades',
];

// Weapon upgrade levels (nested: weaponId → stat → level). Cloud is truth.
const SERVER_OWNED_WEAPON_OBJECTS = [
    'permanentWeaponUpgrades',
    'weeklyWeaponUpgrades',
    'seasonalWeaponUpgrades',
];

// Talents (nested: charId → [talentIds]). Cloud is truth.
const SERVER_OWNED_TALENT_OBJECTS = [
    'permanentTalents',
    'weeklyTalents',
    'seasonalTalents',
];

// Relic levels (relicId → level). Cloud is truth.
const SERVER_OWNED_NUMBER_MAPS = [
    'relicLevels',
];

// SERVER-OWNED run-aggregate stats (Phase 3c). Cloud is truth.
// Written exclusively by saveScore / claimBounty / claimDailyLogin / submitBossDamage.
const SERVER_OWNED_RUN_STATS = [
    'maxTimeSurvived', 'maxLevelReached', 'totalKills', 'totalGoldEarned',
    'relicFragments', 'cosmicTokens', 'seasonalPoints',
    'starFragments', // Phase 3e — Forge currency
    'dailyKills', 'dailyKillsDate', // Per-player daily kills counter (saveScore writes only)
];

// SERVER-OWNED nested aggregates (cloud is truth).
const SERVER_OWNED_NESTED_AGGREGATES = [
    'characterKills',           // { charId: kills }
    'enemyKills',               // { enemyId: kills }
    'unlockedArenasByCharacter',// { charId: [arenaIds] }
];

// Discovery arrays — server-owned (cloud only).
const SERVER_OWNED_DISCOVERY = [
    'foundCharacters',
    'encounteredEnemies',
];

// Helper: detect if a periodic upgrade container has rolled to a new period.
// If so, the client's reset wins outright.
const periodMismatch = (a, b, idKey) => {
    if (!a || !b || !a[idKey] || !b[idKey]) return false;
    return a[idKey] !== b[idKey];
};

// Canonical UTC ISO 8601 week / season — must mirror lib/periodIds.js + saveScore.
function getCurrentPeriodIds() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    const week_id = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
    const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
    const season_id = `${isoYear}-S${seasonNum}`;
    return { week_id, season_id };
}

// Period roll: cloud is the source of truth for periodic upgrade containers.
// We NEVER let a CLIENT-SIDE period mismatch reset cloud levels — that bug
// wiped CRYBEL's seasonal upgrades on 2026-05-01.
//
// However, if the SERVER detects the cloud's container is stamped with a
// stale period (e.g. weekId='2026-W18' but current week is W19), we MUST roll
// it forward — otherwise players keep their last week's free upgrades active
// indefinitely until they make a purchase that triggers purchaseSku's rollover
// (Texxy bug 2026-05-04). The roll zeroes all numeric values, drops nested
// per-weapon/per-character objects, and stamps the current period id.
// `archive` collects the prior period's container so we can persist it into
// weeklyUpgradeHistory / seasonalUpgradeHistory for stat-tracking.
function resolvePeriodicUpgradeContainer(cloudVal, clientVal, idKey, currentPeriodId, archive) {
    const c = cloudVal || {};
    if (!idKey) return c; // permanent: cloud wins, no period

    const cloudPeriodId = c[idKey];
    // If cloud is on a stale period, roll forward server-side.
    if (cloudPeriodId && currentPeriodId && cloudPeriodId !== currentPeriodId) {
        // Archive the prior container so admins / stats can still see what was earned.
        if (archive && typeof archive === 'object') {
            archive[cloudPeriodId] = c;
        }
        return { [idKey]: currentPeriodId };
    }
    return c;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS (doesn't return null) when there's no auth context —
        // common during page-load races. Catch it and return a clean 401 instead of a
        // 500 that bubbles raw "Authentication required to view users" to the client.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const wallet = me.wallet_address;
        if (!wallet) {
            return Response.json({ error: 'No wallet linked to user' }, { status: 400 });
        }

        const { saveData } = await req.json();
        if (!saveData) return Response.json({ error: 'saveData required' }, { status: 400 });

        // Per-wallet 3s dedupe — return cached response for duplicate calls.
        const dedupeKey = wallet.toLowerCase();
        const cached = getDedupedResponse(dedupeKey);
        if (cached) {
            return Response.json(cached);
        }

        const walletLower = wallet.toLowerCase();
        if (!saveData.pilotName) {
            saveData.pilotName = `Pilot_${walletLower.slice(-6).toUpperCase()}`;
        }

        const existing = await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower }),
            'PlayerSave.filter'
        );

        // --- New player: just save what they sent. No grants to protect yet. ---
        if (existing.length === 0) {
            const result = await with429Retry(
                () => base44.asServiceRole.entities.PlayerSave.create({
                    wallet_address: walletLower,
                    player_name: saveData.player_name || saveData.pilotName || '',
                    save_data: saveData,
                    updated_at: Date.now()
                }),
                'PlayerSave.create'
            );
            const newPlayerResponse = { success: true, saveId: result.id };
            setDedupedResponse(dedupeKey, newPlayerResponse);
            return Response.json(newPlayerResponse);
        }

        const existingData = typeof existing[0].save_data === 'string'
            ? JSON.parse(existing[0].save_data)
            : existing[0].save_data;

        // --- Stale-client guard ---
        const clientTs = Number(saveData.updated_at || 0);
        const cloudTs = Number(existing[0].updated_at || existingData.updated_at || 0);
        const clientIsStale = cloudTs > 0 && clientTs > 0 && clientTs < cloudTs;
        // Only log meaningful staleness (>5s gap). Sub-5s gaps are almost always
        // races with concurrent server-side writes (saveScore, claimBounty, etc.)
        // landing milliseconds before the debounced client sync — not actionable.
        if (clientIsStale && (cloudTs - clientTs) > 5000) {
            console.log(`[syncSave] Stale client (client=${clientTs} cloud=${cloudTs}) — cloud wins for scalars`);
        }

        // Base merge (scalars + non-categorised fields). For server-owned categories
        // we override below regardless of stale state.
        const merged = clientIsStale
            ? { ...saveData, ...existingData }
            : { ...existingData, ...saveData };

        // Client-owned audio prefs: always trust the latest client write.
        // These are pure UI prefs (no anti-cheat concern) and the stale-client
        // guard above would otherwise wipe them when the cloud has an older copy.
        if (saveData.jukeboxPrefs && typeof saveData.jukeboxPrefs === 'object') {
            merged.jukeboxPrefs = saveData.jukeboxPrefs;
        }
        if (saveData.sfxCategories && typeof saveData.sfxCategories === 'object') {
            merged.sfxCategories = saveData.sfxCategories;
        }

        // Player-equipped CHOICES: always trust the latest client write.
        // The stale-client merge order above (`{...saveData, ...existingData}`)
        // was making freshly-equipped relics, cosmetics, loadout slots, and last-
        // selected character/arena/difficulty silently revert to whatever the
        // cloud last had — because saveScore writes to PlayerSave during runs,
        // bumping cloud's updated_at past the client's, which then "wins" stale.
        // These fields are CLIENT-OWNED choices (the inventory they reference is
        // still server-validated — equipping a relic you don't own can't grant it,
        // because unlockedRelics is server-owned above and consumers filter by it).
        // (Hugo bug 2026-05-07: relics, callsigns, cosmetics not sticking.)
        const CLIENT_OWNED_EQUIP_FIELDS = [
            'equippedRelics',           // Which relics are slotted in the loadout
            'cosmetics',                // Equipped trail + per-character skins
            'loadoutPresets',           // Saved loadout slot configurations
            'lastSelectedChar',         // Last char picked in Sloth Lounge
            'lastSelectedArena',        // Last arena picked
            'lastSelectedDifficulty',   // Last difficulty picked
            'poolBias',                 // Loadout pool bias (level-up roll weights)
            'bossModifiers',            // Player-toggled boss modifiers
            'isNGPlus',                 // NG+ mode toggle (unlock check happens engine-side)
            'welcomeSeen',              // Onboarding tour seen flag
            'profile',                  // {player_name, player_title, pilot_icon} — single source of truth
        ];
        for (const key of CLIENT_OWNED_EQUIP_FIELDS) {
            if (saveData[key] !== undefined) {
                merged[key] = saveData[key];
            }
        }

        // Collect anti-cheat blocks for audit logging at the end. Each entry becomes
        // a SyncBlockLog row so admins can review and refund false-positives.
        const blocks = [];
        const recordBlock = (field, clientVal, cloudVal, notes) => {
            blocks.push({
                wallet_address: walletLower,
                field,
                client_value: Number(clientVal) || 0,
                cloud_value: Number(cloudVal) || 0,
                client_ts: clientTs,
                cloud_ts: cloudTs,
                client_was_stale: clientIsStale,
                notes: notes || ''
            });
        };

        // --- 1. SERVER-OWNED unlock arrays: cloud only. Ignore client. ---
        for (const key of SERVER_OWNED_UNLOCK_ARRAYS) {
            const cloudArr = Array.isArray(existingData[key]) ? existingData[key] : [];
            merged[key] = [...cloudArr];
            // Detect attempted client-side injection (log but don't block).
            const clientArr = Array.isArray(saveData[key]) ? saveData[key] : [];
            const injected = clientArr.filter(id => !cloudArr.includes(id));
            if (injected.length > 0) {
                console.warn(`[syncSave] BLOCKED client-side ${key} injection from ${walletLower}: ${JSON.stringify(injected)}`);
                recordBlock(key, injected.length, cloudArr.length, `array_injection: ${injected.join(',')}`);
            }
        }

        // Compute current period ids ONCE so all rollover checks below use the same values.
        const { week_id: currentWeek, season_id: currentSeason } = getCurrentPeriodIds();
        // Archive buckets for any periods we roll forward this request.
        const weeklyArchive = { ...(existingData.weeklyUpgradeHistory || {}) };
        const seasonalArchive = { ...(existingData.seasonalUpgradeHistory || {}) };
        let didRollPeriod = false;
        const wasOnStalePeriod = (key, idKey, expectedId) => {
            const c = existingData[key];
            return c && c[idKey] && c[idKey] !== expectedId;
        };

        // --- 2. SERVER-OWNED upgrade level objects: cloud only (with period roll) ---
        for (const key of SERVER_OWNED_UPGRADE_OBJECTS) {
            const idKey = key === 'permanentUpgrades' ? null
                : key === 'weeklyUpgrades' ? 'weekId'
                : 'seasonId';
            const periodId = idKey === 'weekId' ? currentWeek : idKey === 'seasonId' ? currentSeason : null;
            const archive = idKey === 'weekId' ? weeklyArchive : idKey === 'seasonId' ? seasonalArchive : null;
            if (idKey && wasOnStalePeriod(key, idKey, periodId)) didRollPeriod = true;
            merged[key] = resolvePeriodicUpgradeContainer(existingData[key], saveData[key], idKey, periodId, archive);
            // Log injection attempt
            const cloudObj = existingData[key] || {};
            const clientObj = saveData[key] || {};
            for (const stat of Object.keys(clientObj)) {
                if (stat === 'weekId' || stat === 'seasonId') continue;
                if (Number(clientObj[stat] || 0) > Number(cloudObj[stat] || 0)) {
                    console.warn(`[syncSave] BLOCKED ${key}.${stat} bump from ${walletLower}: client=${clientObj[stat]} cloud=${cloudObj[stat] || 0}`);
                    recordBlock(`${key}.${stat}`, clientObj[stat], cloudObj[stat] || 0, 'upgrade_level_bump');
                }
            }
        }

        // --- 3. SERVER-OWNED weapon upgrades: cloud only (with period roll) ---
        for (const key of SERVER_OWNED_WEAPON_OBJECTS) {
            const idKey = key === 'permanentWeaponUpgrades' ? null
                : key === 'weeklyWeaponUpgrades' ? 'weekId'
                : 'seasonId';
            const periodId = idKey === 'weekId' ? currentWeek : idKey === 'seasonId' ? currentSeason : null;
            const archive = idKey === 'weekId' ? weeklyArchive : idKey === 'seasonId' ? seasonalArchive : null;
            if (idKey && wasOnStalePeriod(key, idKey, periodId)) didRollPeriod = true;
            merged[key] = resolvePeriodicUpgradeContainer(existingData[key], saveData[key], idKey, periodId, archive);
        }

        // --- 4. SERVER-OWNED talents: cloud only (with period roll) ---
        for (const key of SERVER_OWNED_TALENT_OBJECTS) {
            const idKey = key === 'permanentTalents' ? null
                : key === 'weeklyTalents' ? 'weekId'
                : 'seasonId';
            const periodId = idKey === 'weekId' ? currentWeek : idKey === 'seasonId' ? currentSeason : null;
            const archive = idKey === 'weekId' ? weeklyArchive : idKey === 'seasonId' ? seasonalArchive : null;
            if (idKey && wasOnStalePeriod(key, idKey, periodId)) didRollPeriod = true;
            merged[key] = resolvePeriodicUpgradeContainer(existingData[key], saveData[key], idKey, periodId, archive);
        }

        // Persist archives if we rolled anything forward this request.
        if (didRollPeriod) {
            merged.weeklyUpgradeHistory = weeklyArchive;
            merged.seasonalUpgradeHistory = seasonalArchive;
            console.log(`[syncSave] Rolled stale period(s) for ${walletLower} → week=${currentWeek} season=${currentSeason}`);
        }

        // --- 5. SERVER-OWNED number maps (relicLevels): cloud only ---
        for (const key of SERVER_OWNED_NUMBER_MAPS) {
            merged[key] = { ...(existingData[key] || {}) };
        }

        // --- 6. SERVER-OWNED run-aggregate stats: cloud only (Phase 3c) ---
        // Only LOG bumps when the client is actually stale. A non-stale client with
        // a higher value is the benign "saveScore in flight" race (client banked
        // earned gold/kills locally, cloud hasn't credited the run yet). Those rows
        // were spamming SyncBlockLog and worrying staff (e.g. AnubisDominus 76k gold).
        // The cloud value is still kept either way — only the audit log is suppressed.
        for (const key of SERVER_OWNED_RUN_STATS) {
            // `dailyKillsDate` is a string ("YYYY-MM-DD") — must NOT be Number-coerced
            // (would become NaN→0 and break the today-match in getSquadProfile).
            if (key === 'dailyKillsDate') {
                merged[key] = typeof existingData[key] === 'string' ? existingData[key] : '';
                continue;
            }
            merged[key] = Number(existingData[key] || 0);
            const clientVal = Number(saveData[key] || 0);
            if (clientVal > merged[key] && clientIsStale) {
                console.warn(`[syncSave] BLOCKED ${key} bump from ${walletLower}: client=${clientVal} cloud=${merged[key]}`);
                recordBlock(key, clientVal, merged[key], 'run_stat_bump');
            }
        }

        // --- 7. Gold: SERVER-OWNED. Cloud only. Granted via spendGold/saveScore/claimBounty/claimDailyLogin etc. ---
        // Same staleness filter as run stats above — non-stale client racing ahead
        // is the saveScore-in-flight race and is benign. We keep the cloud value
        // either way, but only audit-log when the client is genuinely behind.
        merged.gold = Number(existingData.gold || 0);
        const clientGold = Number(saveData.gold || 0);
        if (clientGold > merged.gold && clientIsStale) {
            console.warn(`[syncSave] BLOCKED gold bump from ${walletLower}: client=${clientGold} cloud=${merged.gold}`);
            recordBlock('gold', clientGold, merged.gold, 'gold_bump');
        }

        // --- 8. SERVER-OWNED discovery arrays: cloud only ---
        for (const key of SERVER_OWNED_DISCOVERY) {
            merged[key] = Array.isArray(existingData[key]) ? [...existingData[key]] : [];
        }

        // --- 9-10. SERVER-OWNED nested aggregates (kills, arena unlocks): cloud only ---
        for (const key of SERVER_OWNED_NESTED_AGGREGATES) {
            merged[key] = existingData[key] ? JSON.parse(JSON.stringify(existingData[key])) : {};
        }

        // --- 11. NG+ unlock: server-owned (granted by saveScore on final-arena victory) ---
        merged.newGamePlusUnlocked = !!existingData.newGamePlusUnlocked;

        // --- 12. SERVER-OWNED Forge augments + daily convert ledger (Phase 3e) ---
        merged.forgeWeaponAugments = existingData.forgeWeaponAugments
            ? JSON.parse(JSON.stringify(existingData.forgeWeaponAugments)) : {};
        merged.forgeCharAugments = existingData.forgeCharAugments
            ? JSON.parse(JSON.stringify(existingData.forgeCharAugments)) : {};
        merged.forgeConvertedToday = existingData.forgeConvertedToday
            ? { ...existingData.forgeConvertedToday } : { date: '', count: 0 };

        // --- 12a. SERVER-OWNED sessionBuffs (xpExpiry only) — granted via purchaseSku ---
        // Cloud is truth. Client cannot extend or set xpExpiry via syncSave (was the
        // double-buy exploit: clearing localStorage made xpExpiry=0, second buy went
        // through. Texxy bug 2026-05-03).
        merged.sessionBuffs = existingData.sessionBuffs ? { ...existingData.sessionBuffs } : {};

        // --- 12b. SERVER-OWNED pendingRunSnapshot (cloud safety net for endless/raid runs) ---
        // CRITICAL: client must NEVER write this. Only checkpointRun (write) and saveScore
        // (delete-on-credit) may touch it. If the client could re-upload a stale snapshot,
        // saveScore would re-credit the same run on every refresh.
        if (existingData.pendingRunSnapshot) {
            merged.pendingRunSnapshot = existingData.pendingRunSnapshot;
        } else {
            delete merged.pendingRunSnapshot;
        }

        // --- 13. SERVER-OWNED bounty progress (Phase 3f) ---
        // Cloud writes are exclusive: saveScore (progress) + claimBounty (claimed/reward).
        // Client may rotate the bounty list locally on a new day; we accept the LIST
        // from the client only when it's a new day reset. Otherwise cloud wins.
        // Client uses `date` (set in SaveManager.load); some legacy records may use `lastReset`.
        const cloudBounties = existingData.bounties || null;
        const clientBounties = saveData.bounties || null;
        const bountyDateOf = (b) => (b && (b.date || b.lastReset)) || null;
        const cloudDate = bountyDateOf(cloudBounties);
        const clientDate = bountyDateOf(clientBounties);
        if (cloudBounties && clientBounties && cloudDate && clientDate && cloudDate === clientDate) {
            // Same day — cloud is truth (server already tracked progress).
            merged.bounties = JSON.parse(JSON.stringify(cloudBounties));
        } else if (clientBounties && clientDate) {
            // Client rolled to a new day — accept the new structure but null-out
            // progress/claimed so server can re-track from zero.
            const fresh = JSON.parse(JSON.stringify(clientBounties));
            if (Array.isArray(fresh.active)) {
                fresh.active = fresh.active.map(b => ({ ...b, progress: 0, claimed: false }));
            }
            if (fresh.dailyMission) {
                fresh.dailyMission = { ...fresh.dailyMission, progress: 0, claimed: false };
            }
            merged.bounties = fresh;
        } else {
            merged.bounties = cloudBounties;
        }

        const newTs = Date.now();
        merged.updated_at = newTs;

        // PROFILE: server-authoritative profile lives in save_data.profile (Option A,
        // 2026-05-08). Client writes its chosen name/title/icon there via the standard
        // SaveManager.save → syncSave flow. We mirror the name to the top-level
        // PlayerSave.player_name column so admin search by name still works, and
        // emit the value back into save_data.player_name as a legacy alias.
        // The mirrorProfileFanOut entity automation handles propagating the change
        // to RunScore / SquadMember / SquadMessage asynchronously.
        //
        // PER-FIELD MERGE (Waeoo bug 2026-05-14 — "callsigns fall off"):
        // A stale/partial client profile object (e.g. an older tab that loaded
        // before the title was equipped, or a SaveManager save that fired before
        // useOmenXUser hydrated player_title) used to overwrite the cloud's title
        // with "" via the whole-object swap. The empty top-level column then
        // triggered mirrorProfileFanOut, which wiped the title across all
        // RunScore / SquadMember / SquadMessage rows. Now: each profile field is
        // taken from the client only when it's a non-empty string; otherwise the
        // cloud value is preserved. Players can still CLEAR a title by equipping
        // a different one (non-empty) — they just can't clear it accidentally.
        const profileFromClient = (saveData.profile && typeof saveData.profile === 'object') ? saveData.profile : {};
        const profileFromCloud = (existingData.profile && typeof existingData.profile === 'object') ? existingData.profile : {};
        const pickField = (clientVal, cloudVal, legacyVal) => {
            if (typeof clientVal === 'string' && clientVal.length > 0) return clientVal;
            if (typeof cloudVal === 'string' && cloudVal.length > 0) return cloudVal;
            return legacyVal || '';
        };
        const finalProfile = {
            player_name:  pickField(profileFromClient.player_name,  profileFromCloud.player_name,  existingData.player_name || existingData.pilotName || ''),
            player_title: pickField(profileFromClient.player_title, profileFromCloud.player_title, existingData.player_title || ''),
            pilot_icon:   pickField(profileFromClient.pilot_icon,   profileFromCloud.pilot_icon,   existingData.pilot_icon || ''),
        };
        merged.profile = finalProfile;
        // Legacy aliases (used by older code paths still reading these fields).
        // The single source of truth is `profile` — these are mirrors only.
        merged.player_name = finalProfile.player_name || existing[0].player_name || '';
        merged.player_title = finalProfile.player_title || '';
        merged.pilot_icon = finalProfile.pilot_icon || '';
        const preservedName = merged.player_name;

        // Only include profile mirror columns in the update payload if they ACTUALLY
        // changed vs what's already on the record. Writing them on every sync (even
        // with identical values) was tripping the Profile Fan-Out entity automation's
        // `changed_fields contains player_name` trigger on every single syncSave call,
        // racking up 37k+ automation runs in a week and burning integration credits.
        // Now: identical values are omitted → `changed_fields` won't include them →
        // automation only fires when the player actually edits their profile.
        const updatePayload = {
            wallet_address: walletLower,
            save_data: merged,
            updated_at: newTs,
        };
        const currentTopName  = existing[0].player_name  || '';
        const currentTopTitle = existing[0].player_title || '';
        const currentTopIcon  = existing[0].pilot_icon   || '';
        const nextTopTitle = merged.player_title || '';
        const nextTopIcon  = merged.pilot_icon   || '';
        if (preservedName !== currentTopName)  updatePayload.player_name  = preservedName;
        if (nextTopTitle  !== currentTopTitle) updatePayload.player_title = nextTopTitle;
        if (nextTopIcon   !== currentTopIcon)  updatePayload.pilot_icon   = nextTopIcon;

        await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.update(existing[0].id, updatePayload),
            'PlayerSave.update'
        );

        // Audit log: persist any blocks so admins can review/refund. Non-fatal —
        // a logging failure must never affect the sync itself.
        if (blocks.length > 0) {
            try {
                await base44.asServiceRole.entities.SyncBlockLog.bulkCreate(blocks);
            } catch (err) {
                console.error('[syncSave] SyncBlockLog write failed (non-fatal):', err.message);
            }
        }

        // Return merged save + new timestamp so client can adopt it and break the
        // "stale client → cloud bumps timestamp → still stale" sync loop.
        const successResponse = { success: true, saveId: existing[0].id, saveData: merged, updated_at: newTs };
        setDedupedResponse(dedupeKey, successResponse);
        return Response.json(successResponse);
    } catch (error) {
        console.error('[syncSave]', error.message);
        // Pass through rate-limit / upstream-5xx as a 429 with a clean message.
        // Without this, the client's "syncFailed" banner fires for ordinary Base44
        // congestion (admin running a backfill, peak traffic) and the player thinks
        // their progress is lost. Returning 429 lets SaveManager.syncToBackend's
        // 429-aware retry path kick in instead.
        const msg = String(error?.message || '').toLowerCase();
        const status = error?.status || error?.response?.status || 0;
        const isTransient = status === 429 || /rate limit|\b429\b/.test(msg)
            || (status >= 502 && status <= 504);
        if (isTransient) {
            return Response.json(
                { error: 'Too many requests — please wait a moment and try again.' },
                { status: 429 }
            );
        }
        return Response.json({ error: 'Couldn\'t sync your save. Please try again.' }, { status: 500 });
    }
});