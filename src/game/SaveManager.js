import moment from 'moment';
import { BOUNTIES_POOL, DAILY_MISSIONS_POOL } from './Constants';
import { getOmenXUser } from '@/lib/omenxUser';
import { getAuthFromIndexedDB } from '@/lib/indexedDbAuth';
import { NFTPerkManager } from './NFTPerks';

let syncTimeout = null;
let pendingSync = false;
let syncRetries = 0;
const MAX_SYNC_RETRIES = 3;
let cloudSyncComplete = false;
let syncInFlight = false;          // prevents concurrent sync races
let queuedSyncWhileInFlight = false; // if save() fires during a sync, run one more after
let visibilityListenerAttached = false;

export const SaveManager = {
  _walletAddress: null,
  _accessToken: null,
  _initialized: false,

  initialize: async () => {
    if (SaveManager._initialized) return;
    SaveManager._initialized = true;
    console.log('[SaveManager] Initialize called');

    // ---- One-time profile migration (Option A, 2026-05-08) ----
    // Lift legacy profile fields (player_name / player_title / pilot_icon) out of
    // omenx_auth_data into save.profile so the new code path has a single
    // canonical store. Idempotent — if save.profile already exists, do nothing.
    try {
      const auth = JSON.parse(localStorage.getItem('omenx_auth_data') || 'null');
      const save = JSON.parse(localStorage.getItem('cosmic_sloth_save') || 'null');
      if (auth && save && (!save.profile || typeof save.profile !== 'object')) {
        const lifted = {
          player_name: auth.player_name || save.player_name || '',
          player_title: auth.player_title || save.player_title || '',
          pilot_icon: auth.pilot_icon || save.pilot_icon || '🦥',
        };
        if (lifted.player_name || lifted.player_title || lifted.pilot_icon) {
          save.profile = lifted;
          save.updated_at = Date.now();
          localStorage.setItem('cosmic_sloth_save', JSON.stringify(save));
          console.log('[SaveManager] Migrated profile fields to save.profile:', lifted);
        }
        // Strip from auth — pure OAuth from now on. Safe even if the migration above didn't run
        // (auth may already be clean); .delete is idempotent.
        delete auth.player_name;
        delete auth.player_title;
        delete auth.pilot_icon;
        delete auth.pilotName;
        delete auth._titlePendingSync;
        localStorage.setItem('omenx_auth_data', JSON.stringify(auth));
      }
    } catch (e) {
      console.warn('[SaveManager] profile migration skipped:', e.message);
    }

    // Global visibility-change listener — fires on tab hide, mobile background,
    // navigation away. Browser keeps the page alive long enough for the async
    // fetch to complete (unlike beforeunload). One listener covers all pages.
    if (!visibilityListenerAttached && typeof document !== 'undefined') {
      visibilityListenerAttached = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && SaveManager._walletAddress) {
          SaveManager.syncToBackendImmediate();
        }
      });

      // After Base44AuthLinker successfully links a wallet, re-run the cloud
      // load so users who signed in AFTER app boot get their save without a
      // page refresh.
      window.addEventListener('walletLinked', () => {
        console.log('[SaveManager] walletLinked event — reloading cloud save');
        SaveManager._initialized = false;
        SaveManager.initialize();
      });
    }
    try {
      // Use localStorage immediately (fastest) — no async wait needed
      const omenxAuth = (() => { try { return JSON.parse(localStorage.getItem('omenx_auth_data')); } catch { return null; } })();
      let walletAddress = omenxAuth?.walletAddress;
      let accessToken = omenxAuth?.accessToken;

      // In parallel, warm up IndexedDB auth (don't block on it)
      if (!walletAddress) {
        try {
          const idbAuth = await getAuthFromIndexedDB();
          if (idbAuth?.walletAddress) {
            walletAddress = idbAuth.walletAddress;
            accessToken = idbAuth.accessToken;
            // Sync back to localStorage so next time is instant
            localStorage.setItem('omenx_auth_data', JSON.stringify(idbAuth));
          }
        } catch (e) {
          console.log('[SaveManager] IndexedDB auth not available:', e.message);
        }
      }
      
      if (!walletAddress) {
        console.log('[SaveManager] No wallet authenticated, using local storage only');
        return;
      }

      SaveManager._walletAddress = walletAddress;
      SaveManager._accessToken = accessToken; // kept for reference; not required by backend anymore
      
      // Load cloud save on init via Base44 SDK (uses Base44 session — no token needed)
      const hasLocalSave = !!localStorage.getItem('cosmic_sloth_save');
      // Signal first-time setup is in progress only when there's no local save
      // (otherwise the user can play with local data while cloud syncs in background).
      if (!hasLocalSave) {
        window.dispatchEvent(new CustomEvent('firstTimeSetupStart'));
      }
      try {
        const { base44 } = await import('@/api/base44Client');

        const expectedWallet = walletAddress.toLowerCase();

        // Skip the auth poll if we've already verified this wallet is linked
        // earlier this session (huge speed-up on page reloads / route changes).
        const cachedLinkedWallet = sessionStorage.getItem('walletLinkedToBase44');
        let walletLinked = cachedLinkedWallet === expectedWallet;

        // CRITICAL: Wait for the Base44 user record to have wallet_address linked
        // before loading. Otherwise loadSave returns null (no wallet linked yet),
        // we treat user as new, and empty local save eventually overwrites cloud.
        // If the user is NOT signed into Base44 (anonymous browsing), skip silently —
        // never trigger the login modal here. They'll get cloud sync once they Sign In.
        if (!walletLinked) {
          let isAuthed = false;
          try { isAuthed = await base44.auth.isAuthenticated(); } catch { isAuthed = false; }
          if (!isAuthed) {
            console.log('[SaveManager] Not signed into Base44 — skipping cloud load (local-only mode)');
            window.dispatchEvent(new CustomEvent('firstTimeSetupEnd'));
            return;
          }
          for (let attempt = 0; attempt < 8; attempt++) { // ~4s max (8 × 500ms)
            try {
              const me = await base44.auth.me();
              if (me?.wallet_address?.toLowerCase() === expectedWallet) {
                walletLinked = true;
                sessionStorage.setItem('walletLinkedToBase44', expectedWallet);
                break;
              }
            } catch (_) { /* keep polling */ }
            await new Promise(r => setTimeout(r, 500));
          }
        }
        if (!walletLinked) {
          console.warn('[SaveManager] Wallet not linked to Base44 user after 4s — skipping cloud load to avoid overwriting cloud save with empty local');
          window.dispatchEvent(new CustomEvent('firstTimeSetupEnd'));
          return;
        }

        // loadSave can briefly 404 during the app-redeploy routing-table swap
        // window or when a Deno isolate cold-start fails. Without a retry, a
        // single transient 404 here leaves the player on local-only data for
        // the entire session (very bad — they don't see their cloud progress).
        // Mirrors the retry policy used in lib/maintenanceStatus.js.
        let res;
        {
            const retryDelays = [400, 900, 1800];
            let lastErr = null;
            for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
                try {
                    res = await base44.functions.invoke('loadSave', {});
                    lastErr = null;
                    break;
                } catch (err) {
                    lastErr = err;
                    const status = err?.status || err?.response?.status;
                    const msg = String(err?.message || '').toLowerCase();
                    const isTransient = status === 404 || status === 429
                        || (status >= 502 && status <= 504)
                        || msg.includes('rate limit') || msg.includes('not found');
                    if (!isTransient || attempt === retryDelays.length) throw err;
                    console.warn(`[SaveManager] loadSave transient ${status || msg} — retry ${attempt + 1}/${retryDelays.length}`);
                    await new Promise(r => setTimeout(r, retryDelays[attempt] + Math.random() * 200));
                }
            }
            if (lastErr) throw lastErr;
        }
        const response = res.data;

        // ---- Wipe-epoch check ----
        // The server bumps a global "wipe_epoch" timestamp every time
        // resetAllPlayerData / fullWipeIncludingUsers runs. If the cloud's epoch is
        // newer than what we last saw, the cloud was reset since this client's
        // localStorage was written. We MUST clear local caches before merging,
        // otherwise stale pre-wipe aggregates get re-uploaded by the next syncSave
        // and re-poison the fresh database (every reset would silently bring back
        // returning players' old gold/kills/unlocks).
        try {
            const cloudEpoch = Number(response?.wipeEpoch || 0);
            const localEpoch = Number(localStorage.getItem('wipe_epoch_seen') || 0);
            if (cloudEpoch > 0 && cloudEpoch > localEpoch) {
                console.warn(`[SaveManager] WIPE EPOCH bump detected (cloud=${cloudEpoch} local=${localEpoch}) — clearing stale local caches`);
                // Drop the stale local save and any queued runs from before the wipe.
                localStorage.removeItem('cosmic_sloth_save');
                localStorage.removeItem('pending_score_saves');
                localStorage.removeItem('cosmic_sloth_run_snapshot');
                // Also reset cached profile fields on omenx_auth_data (player_title /
                // player_name / pilot_icon) — these would otherwise stick around
                // even though the cloud has no record of them.
                try {
                    const auth = JSON.parse(localStorage.getItem('omenx_auth_data') || 'null');
                    if (auth && typeof auth === 'object') {
                        delete auth.player_title;
                        delete auth.player_name;
                        delete auth.pilot_icon;
                        localStorage.setItem('omenx_auth_data', JSON.stringify(auth));
                    }
                } catch {}
                localStorage.setItem('wipe_epoch_seen', String(cloudEpoch));
            } else if (cloudEpoch > 0 && localEpoch === 0) {
                // First time we've seen any epoch — record it without wiping.
                localStorage.setItem('wipe_epoch_seen', String(cloudEpoch));
            }
        } catch (e) {
            console.error('[SaveManager] wipe-epoch check failed (non-fatal):', e.message);
        }

        if (response?.saveData) {
          const cloudSave = response.saveData;
          const localSave = localStorage.getItem('cosmic_sloth_save');
          const cloudData = typeof cloudSave === 'string' ? JSON.parse(cloudSave) : cloudSave;

          // Profile fields now live in cloudData.profile (Option A). They flow into
          // localStorage.cosmic_sloth_save via the merge below — no separate restore
          // needed. omenx_auth_data is OAuth-only from this point forward.
          
          // Apply cloud-synced audio preferences (jukebox + SFX categories) so they
          // follow the user across devices/browsers. Local edits stream back via the
          // save() flow, so we always prefer cloud truth here on first load.
          try {
            if (cloudData.jukeboxPrefs) {
              const { applyCloudJukeboxPrefs } = await import('./SoundManager');
              applyCloudJukeboxPrefs(cloudData.jukeboxPrefs);
            }
            if (cloudData.sfxCategories) {
              const { SFXManager } = await import('./SFXManager');
              SFXManager.applyCloudCategories(cloudData.sfxCategories);
            }
          } catch (e) { console.warn('[SaveManager] Audio prefs apply failed:', e.message); }

          if (localSave) {
            const localData = JSON.parse(localSave);
            // CRITICAL: Deep merge upgrades by taking MAX values (never lose paid upgrades)
            const mergeUpgrades = (local, cloud) => {
              const result = { ...cloud };
              if (local) {
                for (const [key, val] of Object.entries(local)) {
                  if (typeof val === 'number' && typeof result[key] === 'number') {
                    result[key] = Math.max(val, result[key]); // Never lose paid upgrades
                  }
                }
              }
              return result;
            };
            const mergeNestedUpgrades = (local, cloud) => {
              const result = { ...cloud };
              if (local) {
                for (const [weaponId, upgrades] of Object.entries(local)) {
                  if (typeof upgrades === 'object' && upgrades !== null) {
                    result[weaponId] = mergeUpgrades(upgrades, cloud[weaponId] || {});
                  }
                }
              }
              return result;
            };
            const merged = {
              ...localData,
              ...cloudData,
              permanentUpgrades: mergeUpgrades(localData.permanentUpgrades, cloudData.permanentUpgrades || {}),
              permanentWeaponUpgrades: mergeNestedUpgrades(localData.permanentWeaponUpgrades, cloudData.permanentWeaponUpgrades || {}),
              permanentTalents: { ...localData.permanentTalents, ...cloudData.permanentTalents },
              weeklyUpgrades: mergeUpgrades(localData.weeklyUpgrades, cloudData.weeklyUpgrades || {}),
              seasonalUpgrades: mergeUpgrades(localData.seasonalUpgrades, cloudData.seasonalUpgrades || {}),
              unlockedRelics: [...new Set([...(localData.unlockedRelics || []), ...(cloudData.unlockedRelics || [])])],
              equippedRelics: cloudData.equippedRelics || localData.equippedRelics || [],
              // Adopt the freshest known timestamp so subsequent syncSave calls don't
              // immediately get flagged "stale" against this same cloudData.
              updated_at: Math.max(Number(localData.updated_at || 0), Number(cloudData.updated_at || 0)) || Date.now()
            };
            localStorage.setItem('cosmic_sloth_save', JSON.stringify(merged));
            window.dispatchEvent(new CustomEvent('saveUpdated', { detail: merged }));
            console.log('[SaveManager] Deep merged upgrades (never losing paid upgrades)');
          } else {
            const seeded = { ...cloudData, updated_at: Number(cloudData.updated_at) || Date.now() };
            localStorage.setItem('cosmic_sloth_save', JSON.stringify(seeded));
            window.dispatchEvent(new CustomEvent('saveUpdated', { detail: seeded }));
            console.log('[SaveManager] Loaded cloud save');
          }
        }
      } catch (e) {
        console.warn('[SaveManager] Cloud load failed, continuing with local:', e.message);
      }
      
      console.log('[SaveManager] Initialized');
    } catch (e) {
      console.error('[SaveManager] Init error:', e.message);
    } finally {
      cloudSyncComplete = true;
      window.dispatchEvent(new CustomEvent('firstTimeSetupEnd'));
    }
  },

  syncToBackend: async () => {
  // Mutex: if a sync is already running, mark that another is needed and bail.
  // The in-flight one will trigger one more pass when it finishes — coalesces
  // burst calls (e.g. rapid purchases) into at most 2 requests instead of N.
  if (syncInFlight) {
    queuedSyncWhileInFlight = true;
    return;
  }
  window.dispatchEvent(new CustomEvent('saveSyncStart'));

    // Always fetch fresh wallet from localStorage (may have been set after initialize).
    // Backend reads wallet from the Base44 session (linked at first login) — no token needed.
    let walletAddress = SaveManager._walletAddress;

    if (!walletAddress) {
      const omenxAuth = (() => { try { return JSON.parse(localStorage.getItem('omenx_auth_data')); } catch { return null; } })();
      walletAddress = omenxAuth?.walletAddress;
    }

    if (!walletAddress) return;

    syncInFlight = true;
    try {
      const localSave = localStorage.getItem('cosmic_sloth_save');
      if (!localSave) return;

      // Strip SERVER-OWNED fields from the payload before sending. syncSave
      // ignores them anyway and logs a SyncBlockLog row for each one — which
      // produced thousands of noise rows when the engine wrote `this.save` mid-run
      // (engine snapshot was loaded pre-run, so its run-aggregates are stale
      // relative to whatever saveScore just credited). Stripping client-side
      // makes the wire payload smaller AND keeps SyncBlockLog clean for real
      // anti-cheat signals.
      const parsed = JSON.parse(localSave);
      const SERVER_OWNED = [
        'gold', 'totalKills', 'totalGoldEarned', 'maxTimeSurvived', 'maxLevelReached',
        'relicFragments', 'cosmicTokens', 'seasonalPoints', 'starFragments',
        'unlockedCharacters', 'unlockedRelics', 'unlockedCosmetics',
        'unlockedKillEffects', 'unlockedSkins',
        'foundCharacters', 'encounteredEnemies',
        'characterKills', 'enemyKills', 'unlockedArenasByCharacter',
        'newGamePlusUnlocked', 'pendingRunSnapshot',
        'forgeWeaponAugments', 'forgeCharAugments', 'forgeConvertedToday',
        'permanentUpgrades', 'weeklyUpgrades', 'seasonalUpgrades',
        'permanentWeaponUpgrades', 'weeklyWeaponUpgrades', 'seasonalWeaponUpgrades',
        'permanentTalents', 'weeklyTalents', 'seasonalTalents',
        'relicLevels',
        'sessionBuffs', // server-owned: xp_buff grant via purchaseSku is the only writer
        'owned_chest_cosmetics', // server-owned: OmenX VIP chest grants are the only writer
      ];
      const payload = { ...parsed };
      for (const k of SERVER_OWNED) delete payload[k];

      const { base44 } = await import('@/api/base44Client');
      // Transient-aware retry: 429 (rate limit), 404 (function temporarily
      // unreachable during app redeploy / isolate cold-start), and 502-504
      // (upstream hiccup) all back off and retry. Previously only 429 was
      // handled, so a single 404 during a deploy window would count toward the
      // 3-strike syncFailed counter and flash a "sync failed" banner at the
      // player even though the function code itself is fine. Backoff matches
      // maintenanceStatus / syncSave server-side: 400/900/1800ms + jitter.
      let res;
      {
        const retryDelays = [400, 900, 1800];
        let lastErr = null;
        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
          try {
            res = await base44.functions.invoke('syncSave', { saveData: payload });
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            const status = err?.status || err?.response?.status;
            const msg = String(err?.message || '').toLowerCase();
            const isTransient = status === 404 || status === 429
              || (status >= 502 && status <= 504)
              || msg.includes('rate limit') || msg.includes('not found');
            if (!isTransient || attempt === retryDelays.length) throw err;
            console.warn(`[SaveManager] syncSave transient ${status || msg} — retry ${attempt + 1}/${retryDelays.length}`);
            await new Promise(r => setTimeout(r, retryDelays[attempt] + Math.random() * 200));
          }
        }
        if (lastErr) throw lastErr;
      }
      if (res.data?.error) {
        console.warn('[SaveManager] Sync failed:', res.data.error);
        syncRetries++;
        if (syncRetries >= MAX_SYNC_RETRIES) {
          console.error('[SaveManager] Sync failed after', MAX_SYNC_RETRIES, 'retries. User data may be out of sync.');
          window.dispatchEvent(new CustomEvent('syncFailed', { detail: { reason: 'max_retries' } }));
          syncRetries = 0; // Reset for next batch
        }
      } else {
        // Adopt server-merged save + new timestamp so we don't keep looking "stale"
        // on subsequent syncs (was causing infinite sync loop pre-fix).
        if (res.data?.saveData && res.data?.updated_at) {
          // CRITICAL: re-read local just before clobbering. While the sync was
          // in flight (debounced ~3s + network ~500ms), the user may have made
          // more local edits (cosmetic swap, settings change, audio prefs). If
          // the local copy is NEWER than the payload we sent, those edits would
          // be silently lost when we overwrite with the server's older view.
          // Instead, layer the cloud-owned fields on top of the freshest local
          // state so player-owned edits survive the rebound.
          let freshLocal = null;
          try { freshLocal = JSON.parse(localStorage.getItem('cosmic_sloth_save') || 'null'); } catch {}
          const localTs = Number(freshLocal?.updated_at || 0);
          const sentTs = Number(parsed.updated_at || 0);
          let merged;
          if (freshLocal && localTs > sentTs) {
            // Local moved on after we sent — keep local as base, only adopt
            // server-owned fields from cloud. Bump timestamp to cloud's so the
            // next sync isn't flagged stale.
            merged = { ...freshLocal, ...res.data.saveData, updated_at: res.data.updated_at };
          } else {
            merged = { ...res.data.saveData, updated_at: res.data.updated_at };
          }
          // CRITICAL: client-owned UI prefs must always win over the cloud copy
          // returned by syncSave. Even when the round-trip lands AFTER the user
          // just toggled a jukebox track / SFX category / equipped relic, the
          // server's response carries the OLDER value (it was generated before
          // the toggle). Without this guard, the cloud value silently overwrites
          // the fresh local toggle and the setting "doesn't stick" (Hugo bug
          // 2026-05-07: jukebox prefs reverting). syncSave already accepts the
          // client value server-side, so freshLocal is the truth here.
          const CLIENT_OWNED_OVERRIDES = [
            'jukeboxPrefs', 'sfxCategories',
            'equippedRelics', 'cosmetics', 'loadoutPresets',
            'lastSelectedChar', 'lastSelectedArena', 'lastSelectedDifficulty', 'lastSelectedWeapon',
            'poolBias', 'bossModifiers', 'isNGPlus', 'welcomeSeen',
          ];
          if (freshLocal) {
            for (const key of CLIENT_OWNED_OVERRIDES) {
              if (freshLocal[key] !== undefined) {
                merged[key] = freshLocal[key];
              }
            }
          }
          localStorage.setItem('cosmic_sloth_save', JSON.stringify(merged));
          window.dispatchEvent(new CustomEvent('saveUpdated', { detail: merged }));
        }
        console.log('[SaveManager] Cloud sync');
        syncRetries = 0; // Reset on success
        window.dispatchEvent(new CustomEvent('saveSyncSuccess'));
      }
    } catch (e) {
      console.warn('[SaveManager] Sync failed:', e.message);
      syncRetries++;
      if (syncRetries >= MAX_SYNC_RETRIES) {
        console.error('[SaveManager] Sync failed after', MAX_SYNC_RETRIES, 'retries. User data may be out of sync.');
        window.dispatchEvent(new CustomEvent('syncFailed', { detail: { reason: 'network_error' } }));
        syncRetries = 0;
      }
    } finally {
      syncInFlight = false;
      // If a save() came in while we were syncing, run one more pass so the
      // newest state reaches the cloud. Single follow-up — won't loop.
      if (queuedSyncWhileInFlight) {
        queuedSyncWhileInFlight = false;
        SaveManager.syncToBackend();
      }
    }
  },

  syncToBackendImmediate: async () => {
    // Emergency sync for critical events (game end) — skip debounce
    if (syncTimeout) clearTimeout(syncTimeout);
    pendingSync = false;
    syncRetries = 0; // Reset retry count for critical syncs
    await SaveManager.syncToBackend();
  },

  _cloudSyncComplete: cloudSyncComplete,
  
  load: () => {
    // NOTE: We intentionally do NOT trigger a background re-sync here.
    // load() runs constantly during UI re-renders, and pushing a stale local
    // save up just to be told "cloud is newer" wasted a request and spammed
    // the syncSave logs with "Stale client" warnings every few minutes.
    // Cloud truth is loaded on initialize() and on walletLinked events.

    // Canonical UTC ISO 8601 week (Mon-start, Sun 23:59 UTC end). Must mirror lib/periodIds.js.
    // Old `getUTCDay() + 1` formula treated Sun as start-of-week → week_id rolled over a day early.
    const { week_id: currentWeek, season_id: currentSeason } = (() => {
        const now = new Date();
        const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const dayNum = tmp.getUTCDay() || 7;
        tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
        const isoYear = tmp.getUTCFullYear();
        const yearStart = new Date(Date.UTC(isoYear, 0, 1));
        const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
        return { week_id: `${isoYear}-W${String(isoWeek).padStart(2, '0')}`, season_id: `${isoYear}-S${Math.floor((isoWeek - 1) / 4) + 1}` };
    })();

    const defaultChars = ['neobyte'];

    const defaultSave = {
      gold: 0,
      relicFragments: 0,
      unlockedCharacters: [...defaultChars],
      foundCharacters: [],
      unlockedArenasByCharacter: {},
      unlockedTalents: {},
      permanentUpgrades: { damage: 0, health: 0, speed: 0, magnet: 0, regen: 0, cooldown: 0, luck: 0 },
      weeklyUpgrades: { weekId: currentWeek, damage: 0, health: 0, speed: 0, magnet: 0, regen: 0, cooldown: 0, luck: 0 },
      seasonalUpgrades: { seasonId: currentSeason, damage: 0, health: 0, speed: 0, magnet: 0, regen: 0, cooldown: 0, luck: 0 },
      permanentWeaponUpgrades: {},
      weeklyWeaponUpgrades: { weekId: currentWeek },
      seasonalWeaponUpgrades: { seasonId: currentSeason },
      permanentTalents: {},
      weeklyTalents: { weekId: currentWeek },
      seasonalTalents: { seasonId: currentSeason },
      cosmetics: { trail: 'default' },
      unlockedCosmetics: ['default'],
      maxTimeSurvived: 0,
      totalKills: 0,
      totalGoldEarned: 0,
      maxLevelReached: 0,
      bounties: { date: '', active: [], dailyMission: null },
      seasonalPoints: 0,
      encounteredEnemies: [],
      enemyKills: {},
      bossModifiers: {},
      newGamePlusUnlocked: false,
      isNGPlus: false,
      unlockedRelics: [],
      equippedRelics: []
    };

    try {
      const data = localStorage.getItem('cosmic_sloth_save');
      if (data) {
        const parsed = JSON.parse(data);
        if (!parsed.foundCharacters) parsed.foundCharacters = [];
        
        if (!parsed.unlockedCharacters) {
            parsed.unlockedCharacters = [...defaultChars];
        }

        if (!parsed.unlockedArenasByCharacter) {
            parsed.unlockedArenasByCharacter = {};
        }
        parsed.unlockedCharacters.forEach(c => {
            if (!parsed.unlockedArenasByCharacter[c]) {
                parsed.unlockedArenasByCharacter[c] = parsed.unlockedArenas || ['station'];
            }
        });

        if (!parsed.permanentUpgrades) parsed.permanentUpgrades = { damage: 0, health: 0, speed: 0, magnet: 0, regen: 0, cooldown: 0, luck: 0 };
        // Archive old weekly upgrades instead of losing them
        if (parsed.weeklyUpgrades && parsed.weeklyUpgrades.weekId && parsed.weeklyUpgrades.weekId !== currentWeek) {
            if (!parsed.weeklyUpgradeHistory) parsed.weeklyUpgradeHistory = {};
            parsed.weeklyUpgradeHistory[parsed.weeklyUpgrades.weekId] = parsed.weeklyUpgrades;
            parsed.weeklyUpgrades = { weekId: currentWeek, damage: 0, health: 0, speed: 0, magnet: 0, regen: 0, cooldown: 0, luck: 0 };
            // Mark that archive needs syncing
            parsed._needsArchiveSync = true;
        } else if (!parsed.weeklyUpgrades) {
            parsed.weeklyUpgrades = { weekId: currentWeek, damage: 0, health: 0, speed: 0, magnet: 0, regen: 0, cooldown: 0, luck: 0 };
        }
        // Archive old seasonal upgrades instead of losing them
        if (parsed.seasonalUpgrades && parsed.seasonalUpgrades.seasonId && parsed.seasonalUpgrades.seasonId !== currentSeason) {
            if (!parsed.seasonalUpgradeHistory) parsed.seasonalUpgradeHistory = {};
            parsed.seasonalUpgradeHistory[parsed.seasonalUpgrades.seasonId] = parsed.seasonalUpgrades;
            parsed.seasonalUpgrades = { seasonId: currentSeason, damage: 0, health: 0, speed: 0, magnet: 0, regen: 0, cooldown: 0, luck: 0 };
            parsed._needsArchiveSync = true;
        } else if (!parsed.seasonalUpgrades) {
            parsed.seasonalUpgrades = { seasonId: currentSeason, damage: 0, health: 0, speed: 0, magnet: 0, regen: 0, cooldown: 0, luck: 0 };
        }
        
        if (!parsed.permanentWeaponUpgrades) parsed.permanentWeaponUpgrades = parsed.weaponUpgrades || {};
        if (!parsed.weeklyWeaponUpgrades || parsed.weeklyWeaponUpgrades.weekId !== currentWeek) {
            parsed.weeklyWeaponUpgrades = { weekId: currentWeek };
        }
        if (!parsed.seasonalWeaponUpgrades || parsed.seasonalWeaponUpgrades.seasonId !== currentSeason) {
            parsed.seasonalWeaponUpgrades = { seasonId: currentSeason };
        }
        
        if (!parsed.permanentTalents) parsed.permanentTalents = parsed.unlockedTalents || {};
        if (!parsed.weeklyTalents || parsed.weeklyTalents.weekId !== currentWeek) {
            parsed.weeklyTalents = { weekId: currentWeek };
        }
        if (!parsed.seasonalTalents || parsed.seasonalTalents.seasonId !== currentSeason) {
            parsed.seasonalTalents = { seasonId: currentSeason };
        }
        // Persist the period rollover ONCE so subsequent load() calls don't keep
        // re-doing the in-memory rollover work, and so the next syncSave doesn't
        // race against a stale updated_at. Triggered by _needsArchiveSync flag
        // set in the weekly/seasonal blocks above. Safe — only runs the first
        // time load() detects a period mismatch in this browser session.
        if (parsed._needsArchiveSync) {
            try {
                parsed.updated_at = Date.now();
                localStorage.setItem('cosmic_sloth_save', JSON.stringify(parsed));
            } catch (e) {
                console.error('[SaveManager] Failed to persist period rollover:', e.message);
            }
        }
        if (!parsed.cosmetics) parsed.cosmetics = { trail: 'default' };
        if (!parsed.unlockedCosmetics) parsed.unlockedCosmetics = ['default'];
        if (parsed.maxTimeSurvived === undefined) parsed.maxTimeSurvived = 0;
        if (parsed.totalKills === undefined) parsed.totalKills = 0;
        if (parsed.totalGoldEarned === undefined) parsed.totalGoldEarned = 0;
        if (parsed.maxLevelReached === undefined) parsed.maxLevelReached = 0;
        if (!parsed.foundCharacters) parsed.foundCharacters = [];
        
        if (!parsed.bounties) {
            parsed.bounties = { date: '', active: [], dailyMission: null };
        }
        if (parsed.seasonalPoints === undefined) parsed.seasonalPoints = 0;
        if (!parsed.encounteredEnemies) parsed.encounteredEnemies = [];
        if (!parsed.enemyKills) parsed.enemyKills = {};
        if (!parsed.bossModifiers) parsed.bossModifiers = {};
        if (!parsed.unlockedRelics) parsed.unlockedRelics = [];
        if (!parsed.equippedRelics) parsed.equippedRelics = [];
        
        // Use UTC to match server (claimDailyLogin uses UTC) — otherwise daily
        // login can flip to a new day before bounties/missions rotate locally,
        // causing "day 2 streak claimable but day 2 bounties not".
        const today = moment.utc().format('YYYY-MM-DD');
        if (parsed.bounties.date !== today) {
            try {
                const shuffled = [...BOUNTIES_POOL].sort(() => 0.5 - Math.random());
                const shuffledMissions = [...DAILY_MISSIONS_POOL].sort(() => 0.5 - Math.random());
                parsed.bounties = {
                    date: today,
                    active: shuffled.slice(0, 3).map(b => ({ ...b, progress: 0, claimed: false })),
                    dailyMission: { ...shuffledMissions[0], progress: 0, claimed: false }
                };
                // Bump timestamp so this local mutation isn't flagged as "stale" by syncSave.
                // Without this, every load() rewrites localStorage with an old updated_at,
                // which made syncSave repeatedly choose cloud over fresh local edits
                // (the root cause of "name not sticking, gold disappearing").
                parsed.updated_at = Date.now();
                localStorage.setItem('cosmic_sloth_save', JSON.stringify(parsed));
            } catch (e) {
                console.error('[SaveManager] Failed to reset daily bounties:', e.message);
                // Keep old bounties if reset fails
            }
        } else if (!parsed.bounties.dailyMission) {
            try {
                const shuffledMissions = [...DAILY_MISSIONS_POOL].sort(() => 0.5 - Math.random());
                parsed.bounties.dailyMission = { ...shuffledMissions[0], progress: 0, claimed: false };
                parsed.updated_at = Date.now();
                localStorage.setItem('cosmic_sloth_save', JSON.stringify(parsed));
            } catch (e) {
                console.error('[SaveManager] Failed to initialize daily mission:', e.message);
            }
        }
        
        if (parsed.rerollTokens !== undefined) {
            parsed.relicFragments = (parsed.relicFragments || 0) + parsed.rerollTokens;
            delete parsed.rerollTokens;
            parsed.updated_at = Date.now();
            localStorage.setItem('cosmic_sloth_save', JSON.stringify(parsed));
        }
        
        return { ...defaultSave, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load save', e);
    }
    return defaultSave;
  },
  save: (data) => {
    try {
      data.updated_at = Date.now();
      const serialized = JSON.stringify(data);
      localStorage.setItem('cosmic_sloth_save', serialized);
      window.dispatchEvent(new CustomEvent('saveUpdated', { detail: data }));
      // Only sync once a wallet is linked (Base44 session handles auth server-side)
      if (SaveManager._walletAddress) {
        pendingSync = true;
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
          if (pendingSync) {
            SaveManager.syncToBackend();
            pendingSync = false;
          }
        }, 8000); // Debounce to 8 seconds — coalesces bursts of in-game saves (gold pickups, kills) into one network call. visibilitychange + game-end paths still force an immediate sync, so nothing is lost on tab close.
      }
    } catch (e) {
      console.error('[SaveManager] Save error:', e.message);
    }
  }
};