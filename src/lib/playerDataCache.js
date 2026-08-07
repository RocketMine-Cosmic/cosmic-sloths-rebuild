import { base44 } from '@/api/base44Client';

// ─────────────────────────────────────────────────────────
// Player data cache. Three independent data streams:
//   • BALANCE — live OMENX balance, 15min auto-refresh + post-purchase forced refresh.
//   • VIP     — VIP level. Rarely changes & never decreases. Fetched ONCE on
//                wallet-link, then cached indefinitely. User refreshes manually
//                via Profile button (24h cooldown).
//   • NFTs    — NFT inventory. Manual refresh only via NFT Dashboard
//                button (24h cooldown).
// VIP and NFT have SEPARATE cooldowns so users can refresh either independently.
// ─────────────────────────────────────────────────────────

const BALANCE_TTL = 5 * 60 * 1000;           // 5 min — refetched only while tab is visible
const VIP_COOLDOWN = 24 * 60 * 60 * 1000;    // 24 h
const NFT_COOLDOWN = 60 * 1000;              // 60s — short enough for users who just bought/sold NFTs to keep retrying while upstream indexes the transaction

// ── Persistence helpers ──────────────────────────────────
function loadJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const persistedBalance = loadJSON('omenx_balance_cache');
const persistedVip     = loadJSON('omenx_vip_cache');
const persistedNfts    = loadJSON('omenx_nft_cache');

// ── State ────────────────────────────────────────────────
let cachedData = null; // { balance, vipLevel, nfts, user }
const listeners = new Set();
let inFlightBalance = null;
let inFlightVip = null;
let inFlightNfts = null;
let lastBalanceFetchAt = persistedBalance?.timestamp || 0;
let lastVipFetchAt     = persistedVip?.timestamp || 0;
let lastNftFetchAt     = persistedNfts?.timestamp || 0;
let scheduledBalanceTimer = null;
let refreshBalanceTimer = null;
let userFetched = false;
// Set once the Omen developer API has refused this wallet (404 PLAYER_NOT_FOUND).
// Until a fresh session is minted there is nothing to gain from polling — every
// call is another guaranteed 404 in the API log. Cleared on wallet re-link.
let sessionStale = false;

// Seed from persisted caches immediately (no flicker)
if (persistedBalance || persistedVip || persistedNfts) {
    cachedData = {
        balance: persistedBalance?.balance ?? 0,
        vipLevel: persistedVip?.vipLevel ?? 0,
        nfts: persistedNfts?.nfts ?? [],
    };
    // Mirror NFTs to legacy localStorage key consumed by NFTPerks at game-start.
    if (persistedNfts?.nfts) saveJSON('omenx_nft_data', persistedNfts.nfts);
}

function getAuthData() {
    // Only walletAddress is required — backend functions authenticate via the
    // Base44 session and read the wallet from the linked User record. accessToken
    // is no longer needed (and won't exist for users who came in via Base44 login
    // without going through the OmenX OAuth flow).
    try {
        const stored = localStorage.getItem('omenx_auth_data');
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        return parsed?.walletAddress ? parsed : null;
    } catch { return null; }
}

// GET /v1/players/:wallet returns 404 PLAYER_NOT_FOUND on every balance key for
// a handful of wallets — but those SAME wallets settle purchases and receive
// reward transfers normally (verified 2026-07-31: two of the three affected
// players bought OMENX on Jul 28 and all three took payouts with tx ids on
// Jul 27). So the wallet is valid and this is a read-side gap on that one
// endpoint, NOT a dead account and NOT a stale session.
//
// Therefore: never force a logout (re-auth cannot fix an endpoint gap and only
// loops the player through pointless sign-outs), and never tell them purchases
// are broken — they aren't. Just stop the polling (every poll is a guaranteed
// 404) and show a quiet "balance may be out of date" notice.
function markWalletUnrecognized(source) {
    if (sessionStale) return;
    sessionStale = true;
    stopPolling();
    console.warn(`[playerDataCache] Omen has no user record for this wallet (${source}) — pausing balance polling.`);
    try {
        localStorage.setItem('omen_reauth_notice', JSON.stringify({ kind: 'unrecognized', at: Date.now() }));
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'omen_reauth_notice',
            storageArea: localStorage,
        }));
    } catch {}
}

function notify() { listeners.forEach(fn => fn(cachedData)); }
function applyData(patch) {
    cachedData = { ...(cachedData || { balance: 0, vipLevel: 0, nfts: [] }), ...patch };
    notify();
}

// ── Balance fetch (frequent) ─────────────────────────────
async function fetchBalance(force = false) {
    if (inFlightBalance) return inFlightBalance;
    if (sessionStale) return;
    if (!force && Date.now() - lastBalanceFetchAt < BALANCE_TTL) return;

    const auth = getAuthData();
    if (!auth?.walletAddress) { applyData({ balance: 0 }); return; }

    inFlightBalance = (async () => {
        try {
            const res = await base44.functions.invoke('getPlayerBalance', {});
            // Server signals fetch-failure via ok:false. When that happens, we MUST
            // NOT overwrite the cached balance with a phantom 0 — that's how players
            // with real OMENX would briefly see "0 OMENX" during a transient OmenX
            // API blip, click Buy, and get hit with an "insufficient" error. Keep
            // the previous cached balance and let the next poll heal it.
            const ok = res.data?.ok !== false; // treat missing field as success (legacy)
            if (!ok) {
                // http_404 = the Omen developer API refuses this wallet (PLAYER_NOT_FOUND)
                // because it has no recorded session in the last 30 days. Waiting for the
                // weekly rollover would leave the player broken until Monday, so bounce
                // them straight to Connect Wallet — that mints a fresh session and heals
                // balance, purchases and NFT custody in one go.
                if (res.data?.reason === 'http_404') {
                    // PLAYER_NOT_FOUND on ALL keys = Omen has no user record for this
                    // wallet at all. Proven 2026-07-31: players who log in daily through
                    // our OAuth flow still 404 — so forcing a re-login can NOT heal this
                    // and only loops them through pointless sign-outs. Latch off the
                    // polling and show a notice instead; gameplay and saves still work.
                    markWalletUnrecognized('balance');
                    return;
                }
                console.warn('[playerDataCache] balance fetch returned ok=false — keeping cached balance');
                return;
            }
            const balance = res.data?.balance ?? 0;
            lastBalanceFetchAt = Date.now();
            saveJSON('omenx_balance_cache', { balance, timestamp: lastBalanceFetchAt });
            applyData({ balance });
        } catch (e) {
            console.error('[playerDataCache] balance fetch failed:', e?.message);
        } finally {
            inFlightBalance = null;
        }
    })();
    return inFlightBalance;
}

// ── VIP fetch (manual, 24h cooldown) ─────────────────────
async function fetchVip() {
    if (inFlightVip) return inFlightVip;
    const auth = getAuthData();
    if (!auth?.walletAddress) return;

    inFlightVip = (async () => {
        try {
            const res = await base44.functions.invoke('getVipLevel', {});
            const vipLevel = res.data?.vipLevel ?? 0;
            // Don't burn the 24h cooldown on a zero result — usually means the
            // wallet wasn't fully linked yet or the upstream API blipped.
            // Auto-retry on next page load instead of locking users out.
            if (vipLevel > 0) {
                lastVipFetchAt = Date.now();
                saveJSON('omenx_vip_cache', { vipLevel, timestamp: lastVipFetchAt });
                saveJSON('omenx_vip_cache_wallet', auth.walletAddress.toLowerCase());
            }
            applyData({ vipLevel });
        } catch (e) {
            console.error('[playerDataCache] vip fetch failed:', e?.message);
        } finally {
            inFlightVip = null;
        }
    })();
    return inFlightVip;
}

// ── NFT fetch (manual, 24h cooldown) ─────────────────────
async function fetchNfts() {
    if (inFlightNfts) return inFlightNfts;
    const auth = getAuthData();
    if (!auth?.walletAddress) return;

    inFlightNfts = (async () => {
        try {
            const res = await base44.functions.invoke('getNFTs', {});
            // Backend returns nfts: null when the upstream API failed — don't wipe
            // cached NFTs in that case, otherwise NFT-unlocked characters would
            // momentarily disappear from the UI.
            if (res.data?.nfts == null) {
                // Same stale-session case as the balance path — a 404 here means Omen
                // has no recorded session for this wallet, so bounce to Connect Wallet
                // instead of silently serving stale NFT-gated unlocks forever.
                if (res.data?.reason === 'http_404') {
                    // Same unrecognized-wallet case as the balance path — latch, notify,
                    // never force a logout (re-auth can't fix a missing Omen user record).
                    markWalletUnrecognized('nfts');
                    return;
                }
                console.warn('[playerDataCache] nft fetch returned null (upstream error) — keeping cache');
                return;
            }
            const nfts = res.data.nfts;
            // Persist whatever the upstream returned — including an empty array.
            // An empty array is a VALID state (player sold all their NFTs); if we
            // skipped the cache write, the stale persisted NFTs would rehydrate on
            // next page load and the user would still see NFTs they no longer own.
            // (The null branch above already guards against upstream errors.)
            if (Array.isArray(nfts)) {
                lastNftFetchAt = Date.now();
                saveJSON('omenx_nft_cache', { nfts, timestamp: lastNftFetchAt });
                saveJSON('omenx_nft_data', nfts);
                saveJSON('omenx_nft_cache_wallet', auth.walletAddress.toLowerCase());
            }
            applyData({ nfts });
        } catch (e) {
            console.error('[playerDataCache] nft fetch failed:', e?.message);
        } finally {
            inFlightNfts = null;
        }
    })();
    return inFlightNfts;
}

// User profile — local-only (read from omenx_auth_data) — no network.
// `force=true` re-reads localStorage even if already loaded — used when
// SaveManager merges cloud profile fields back into omenx_auth_data after
// boot, so the cached user reflects the freshly-restored title/name/icon.
function loadUserDataLocal(force = false) {
    if (userFetched && !force) return;
    try {
        const stored = localStorage.getItem('omenx_auth_data');
        if (!stored) return;
        const parsed = JSON.parse(stored);
        const user = {
            walletAddress: parsed.walletAddress,
            username: parsed.username || '',
            full_name: parsed.player_name || parsed.username || 'Player',
            player_name: parsed.player_name || parsed.username || 'Player',
            pilot_icon: parsed.pilot_icon || '🦥',
            data: {
                player_name: parsed.player_name || parsed.username || 'Player',
                player_title: parsed.player_title || '',
                pilot_icon: parsed.pilot_icon || '🦥',
            },
        };
        applyData({ user });
    } catch {}
    userFetched = true;
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

export function fetchPlayerData(force = false) {
    // Initial / general-purpose load: balance only.
    // VIP and NFTs are deferred — they only fetch when the user opens
    // Profile / NFT Dashboard (via ensureVipFetched / ensureNftsFetched)
    // or when the user hits the manual refresh button.
    if (force) {
        if (scheduledBalanceTimer) { clearTimeout(scheduledBalanceTimer); scheduledBalanceTimer = null; }
        lastBalanceFetchAt = 0;
        fetchBalance(true);
        return;
    }
    // Honour TTL — fetchBalance() will no-op if cache is fresh.
    fetchBalance();
}

// ── Visible-tab-only polling loop ────────────────────────
// While the tab is visible, refetch balance every BALANCE_TTL.
// When hidden, stop polling. When it becomes visible again,
// fetch immediately (if cache is stale) and resume the loop.
let pollTimer = null;
function startPolling() {
    if (pollTimer || sessionStale) return;
    pollTimer = setInterval(() => fetchBalance(), BALANCE_TTL);
}
function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
let visibilityListenerAttached = false;
function attachVisibilityListener() {
    if (visibilityListenerAttached) return;
    visibilityListenerAttached = true;
    const onVisibility = () => {
        if (document.visibilityState === 'visible') {
            fetchBalance(); // TTL-gated — only fetches if stale
            startPolling();
        } else {
            stopPolling();
        }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') startPolling();
}

// Lazy fetchers — call on demand from pages that actually need this data.
// VIP is fetched once on wallet-link, then cached indefinitely (rarely changes,
// never decreases). Kept here for backwards compat (no-op if cached).
export function ensureVipFetched() {
    if (lastVipFetchAt === 0) fetchVip();
}
// NFTs are fetched once per wallet (on wallet-link) and then cached. Refresh
// is manual only via the Refresh button on the NFT Dashboard. Avoids hammering
// the OmenX API every time someone opens the page.
export function ensureNftsFetched() {
    if (lastNftFetchAt === 0) fetchNfts();
}

let storageListenerAttached = false;

// Admin-triggered NFT cache invalidation. When an admin force-refreshes a player's
// NFTs server-side, the player's PlayerSave gets stamped with `_nftRefreshNonce`.
// On next save load (cloud merge), this nonce ends up in localStorage. Compare
// against the last-seen marker — if it differs, wipe the NFT cache + cooldown
// so the very next page that reads NFTs pulls fresh data from OmenX.
function checkNftRefreshNonce() {
    try {
        const save = JSON.parse(localStorage.getItem('cosmic_sloth_save') || 'null');
        const cloudNonce = save?._nftRefreshNonce;
        if (!cloudNonce) return;
        const lastSeen = Number(loadJSON('omenx_nft_refresh_nonce_seen') || 0);
        if (cloudNonce > lastSeen) {
            console.log(`[playerDataCache] NFT refresh nonce bumped (${lastSeen} → ${cloudNonce}) — wiping local NFT cache`);
            lastNftFetchAt = 0;
            try {
                localStorage.removeItem('omenx_nft_cache');
                localStorage.removeItem('omenx_nft_data');
                localStorage.removeItem('omenx_nft_cache_wallet');
            } catch {}
            saveJSON('omenx_nft_refresh_nonce_seen', cloudNonce);
            // Trigger an immediate fresh fetch so the cache rehydrates with current data.
            fetchNfts();
        }
    } catch {}
}

export function subscribePlayerData(fn) {
    listeners.add(fn);
    if (cachedData !== null) fn(cachedData);

    if (listeners.size === 1) {
        loadUserDataLocal();
        checkNftRefreshNonce();   // pick up admin-triggered refreshes from cloud save
        fetchPlayerData();        // TTL-gated initial fetch
        attachVisibilityListener(); // 5-min loop while tab is visible
    }

    if (!storageListenerAttached) {
        storageListenerAttached = true;
        const onAuthChange = () => {
            // New login — clear balance & user caches and re-fetch.
            // VIP and NFT caches are preserved across logins of the SAME wallet
            // (rarely change); cleared only when the wallet itself changes.
            lastBalanceFetchAt = 0;
            userFetched = false;
            // Fresh auth landed — the wallet has a recorded Omen session again.
            sessionStale = false;
            startPolling();

            // Detect wallet change → wipe VIP + NFT caches.
            const auth = getAuthData();
            const newWallet = auth?.walletAddress?.toLowerCase() || null;
            const cachedVipWallet = loadJSON('omenx_vip_cache_wallet');
            if (newWallet && cachedVipWallet && cachedVipWallet !== newWallet) {
                lastVipFetchAt = 0;
                try { localStorage.removeItem('omenx_vip_cache'); } catch {}
            }
            const cachedNftWallet = loadJSON('omenx_nft_cache_wallet');
            if (newWallet && cachedNftWallet && cachedNftWallet !== newWallet) {
                lastNftFetchAt = 0;
                try {
                    localStorage.removeItem('omenx_nft_cache');
                    localStorage.removeItem('omenx_nft_data');
                } catch {}
            }

            const freshVip = loadJSON('omenx_vip_cache');
            const freshNfts = loadJSON('omenx_nft_cache');
            cachedData = {
                balance: 0,
                vipLevel: freshVip?.vipLevel ?? 0,
                nfts: freshNfts?.nfts ?? [],
            };
            try {
                localStorage.removeItem('omenx_balance_cache');
            } catch {}
            if (scheduledBalanceTimer) { clearTimeout(scheduledBalanceTimer); scheduledBalanceTimer = null; }
            loadUserDataLocal();
            fetchBalance(true);
            // Auto-fetch VIP + NFTs once per wallet (no-op if already cached for this wallet).
            // Critical for users arriving pre-authed from the Omen website — without
            // this, VIP-gated and NFT-gated features (character unlocks, perks) would
            // be missing on first visit until they manually opened those pages.
            if (lastVipFetchAt === 0 && newWallet) fetchVip();
            if (lastNftFetchAt === 0 && newWallet) fetchNfts();
        };
        // Cross-tab login (real storage event) — has storageArea set
        window.addEventListener('storage', (e) => {
            if (e.key === 'omenx_auth_data' && e.storageArea === localStorage) {
                onAuthChange();
            }
        });
        // Same-tab synthesized auth (e.g. Base44 user with linked wallet) —
        // OmenXAuthContext dispatches a StorageEvent but its storageArea is null.
        // Listen on walletLinked CustomEvent instead, which fires reliably.
        window.addEventListener('walletLinked', onAuthChange);

        // Profile edits (title/name/icon) update omenx_auth_data and dispatch this.
        // Re-read localStorage so the cached user object reflects the change for
        // any subsequent page that subscribes (otherwise they get stale data
        // from cachedData.user that was set at boot).
        window.addEventListener('omenxUserUpdated', () => loadUserDataLocal(true));

        // Whenever SaveManager merges in fresh cloud save data, check for an
        // admin-triggered NFT refresh nonce. This catches the case where the
        // player is actively in-app when an admin force-refreshes their NFTs.
        window.addEventListener('saveUpdated', () => checkNftRefreshNonce());

    }

    return () => { listeners.delete(fn); };
}

// Force a balance refresh (used after purchases). Debounced 6s — coalesces
// rapid-fire purchase bursts (player buying 5 upgrades in 10s was firing 5
// separate forced fetches, blowing past the 5-min TTL and contributing to
// 429s on the upstream OMENX balance API + Base44 SDK).
export function refreshBalance() {
    if (refreshBalanceTimer) return;
    refreshBalanceTimer = setTimeout(() => {
        refreshBalanceTimer = null;
        fetchBalance(true);
    }, 6000);
}

// Manual VIP refresh — Profile page button. Returns next cooldown end.
export async function refreshVipLevel() {
    const cooldownEnd = lastVipFetchAt + VIP_COOLDOWN;
    if (Date.now() < cooldownEnd) return { ok: false, cooldownEnd };
    await fetchVip();
    return { ok: true, cooldownEnd: lastVipFetchAt + VIP_COOLDOWN };
}
export function getVipCooldownEnd() { return lastVipFetchAt + VIP_COOLDOWN; }

// Manual NFT refresh — NFT Dashboard button. Returns next cooldown end.
export async function refreshNFTs() {
    const cooldownEnd = lastNftFetchAt + NFT_COOLDOWN;
    if (Date.now() < cooldownEnd) return { ok: false, cooldownEnd };
    await fetchNfts();
    return { ok: true, cooldownEnd: lastNftFetchAt + NFT_COOLDOWN };
}
export function getNFTCooldownEnd() { return lastNftFetchAt + NFT_COOLDOWN; }