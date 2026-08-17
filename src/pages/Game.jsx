import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GameEngine } from '../game/GameEngine';
import { SaveManager } from '../game/SaveManager';
import UIOverlay from '../components/game/UIOverlay';
import LevelUpModal from '../components/game/LevelUpModal';
import { ARENAS, SKIN_COSMETICS } from '../game/Constants';
import GameOverModal from '../components/game/GameOverModal';
import VictoryModal from '../components/game/VictoryModal';
import VirtualJoystick from '../components/game/VirtualJoystick';
import PauseModal from '../components/game/PauseModal';
import OmenXConfirmation from '../components/game/OmenXConfirmation';
// 043: `cs` is the second export of the same seam — the calls that have no
// base44 NAME and therefore no invoke() route. cs_start_run is the first of
// them the game has ever needed: base44 had no run-start call to port.
import { base44, cs } from '@/api/base44Client';
import moment from 'moment';
import { IN_GAME_SKUS } from '@/lib/skuMap';
import { getReviveForRun } from '@/lib/reviveTiers';
import SandboxBanner from '../components/game/SandboxBanner';
import SandboxDevPanel from '../components/game/SandboxDevPanel';
import { SoundManager } from '../game/SoundManager';
import { useCurrency } from '@/lib/CurrencyContext';
import { getOmenXUserSync } from '@/lib/omenxUser';
import { getCurrentPeriodIds } from '@/lib/periodIds';
import { useOmenXConfirmation } from '@/hooks/useOmenXConfirmation';
import { getAuthData } from '@/lib/getAuthData';
import { SpritePreloader } from '../game/SpritePreloader';
import { refreshBalance } from '@/lib/playerDataCache';
import { flushPendingScores } from '@/lib/flushPendingScores';
import CharacterAbilityMeter from '../components/game/CharacterAbilityMeter';
import GameLoadingScreen from '../components/game/GameLoadingScreen';
import HideHudButton from '../components/game/HideHudButton';
import SynergyBanner from '../components/game/SynergyBanner';
import SessionExpiredBanner from '../components/game/SessionExpiredBanner';
import { useSessionKeepAlive } from '@/hooks/useSessionKeepAlive';
import { useOmenXPurchasesDisabled } from '@/hooks/useOmenXPurchasesDisabled';

export default function Game() {
    const canvasRef = useRef(null);
    const engineRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();
    const { omenxBalance } = useCurrency();
    
    const [gameState, setGameState] = useState({
        hp: 100, maxHp: 100,
        time: 0, duration: 300, level: 1,
        xp: 0, xpRequired: 10,
        gold: 0, relicFragments: 0
    });
    
    const [levelUpChoices, setLevelUpChoices] = useState(null);
    const [gameOverStats, setGameOverStats] = useState(null);
    const [victoryStats, setVictoryStats] = useState(null);
    const [isPaused, setIsPaused] = useState(false);
    const [showRevivePrompt, setShowRevivePrompt] = useState(false);
    const [banishCount, setBanishCount] = useState(0); // resets per run (component remounts on new game)
    const [isInitializing, setIsInitializing] = useState(true);
    const [hudHidden, setHudHidden] = useState(false);
    const saveScoreRef = useRef(null);
    // Internal restart counter. The initGame effect ONLY re-runs when this
    // counter bumps (via handleRestart). Listening to location.state for
    // restart used to silently tear down the engine whenever popstate fired
    // (back-gesture trap) — React ran the cleanup BEFORE the body's guard
    // could short-circuit, leaving a destroyed engine + no UI to show it
    // (Texxy bug 2026-05-21).
    const [runId, setRunId] = useState(0);
    // Captured on first render so a popstate-mutated location.state
    // (e.g. {gameTrap: true} from the trap) can't poison a later restart.
    const runConfigRef = useRef(location.state);

    // External restart bridge: "Try Again" / "Next Sector" buttons in the
    // game-over / victory modals navigate to /game with a fresh _retry
    // timestamp. Mirror that into runConfigRef + bump runId so the init
    // effect tears down and rebuilds. Ignored when _retry is missing
    // (e.g. the popstate trap's {gameTrap:true} push) — that's the whole
    // point of gating on _retry specifically (Lucifer/Anubis bug 2026-05-21).
    useEffect(() => {
        const retry = location.state?._retry;
        if (!retry) return;
        if (runConfigRef.current?._retry === retry) return;
        runConfigRef.current = location.state;
        setRunId(id => id + 1);
    }, [location.state?._retry]);
    // Tracks the _retry timestamp from the last external restart navigation
    // (GameOverModal 'Try Again', VictoryModal 'Next Sector'). When this
    // changes we refresh runConfigRef and bump runId so the engine rebuilds
    // with the new arena/character. Without this, post-run modal buttons
    // were no-ops because navigate() updates location.state but the init
    // effect only listens to runId (Anubis/Lucifer bug 2026-05-21).
    const lastExternalRetryRef = useRef(location.state?._retry);
    const { pending, setPending, confirm: confirmPurchase } = useOmenXConfirmation('game-run');
    // Global kill-switch — when admins disable OMENX purchases, every in-run
    // button (reroll / banish / revive / XP buff / squad ultimate) bails before
    // opening the confirmation modal AND renders in a visibly-disabled state.
    const { disabled: omenxPurchasesDisabled } = useOmenXPurchasesDisabled();

    // Banish tier: 3 uses at 2 OMENX, 3 uses at 4 OMENX, then 6 OMENX onwards.
    // SKU is 2 OMENX consumable → fire `cost / 2` separate charges per banish.
    const getBanishCost = (count) => {
        if (count < 3) return 2;
        if (count < 6) return 4;
        return 6;
    };
    const banishCost = getBanishCost(banishCount);
    const nextBanishCost = getBanishCost(banishCount + 1);

    // Endless runs only: ping base44.auth.me() every 10 min to keep the Base44
    // session warm. Without this, runs over ~1hr expire and saveScore fails
    // with 401 at run-end. Disabled outside endless to avoid pointless traffic
    // on short fixed-duration arenas.
    const isEndlessRun = !!location.state?.isEndless;
    // S8 Sandbox — practice runs. Server rejects any run-mutation with
    // is_sandbox=true, so this flag propagates from carousel/Hub → engine → server.
    const isSandbox = !!location.state?.sandbox;
    useSessionKeepAlive(isEndlessRun && !gameOverStats && !victoryStats);

    // Android tab-kill safety: when the page is being torn down (phone lock,
    // app switch, low memory eviction), dump the current run stats to localStorage
    // synchronously so flushPendingScores can recover them on next launch.
    // `pagehide` is more reliable than `beforeunload` on mobile browsers.
    useEffect(() => {
        const onPageHide = () => {
            const engine = engineRef.current;
            if (!engine || engine.isGameOver || engine.isVictory) return;
            const arena = engine.arena?.id;
            if (arena !== 'endless' && arena !== 'world_boss_arena') return;
            try {
                const stats = engine._runStats();
                if ((stats.kills || 0) >= 5 && (stats.time || 0) >= 30) {
                    localStorage.setItem('pending_run_snapshot', JSON.stringify({ stats, takenAt: Date.now() }));
                }
            } catch {}
        };
        window.addEventListener('pagehide', onPageHide);
        return () => window.removeEventListener('pagehide', onPageHide);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('orientationchange', resizeCanvas);
        resizeCanvas();

        // Reset modal/state from any previous run so the new game starts clean
        setGameOverStats(null);
        setVictoryStats(null);
        setLevelUpChoices(null);
        setShowRevivePrompt(false);
        setIsPaused(false);
        // Reset per-run banish counter so "Try Again" doesn't carry over the
        // previous run's tier-up cost (Hugo bug 2026-04-30).
        setBanishCount(0);

        // 2026-08-07 — initGame awaits several things (SaveManager.initialize, the
        // boss fetch, 5 dynamic imports) BEFORE the engine is constructed. If the
        // component unmounted or runId bumped during those awaits (quitting fast,
        // double-tapping Try Again, a slow cloud load), the effect's cleanup ran
        // against the OLD engine and then this function went on to build a brand
        // new engine whose requestAnimationFrame loop nobody owned — it kept
        // ticking and drawing to a detached canvas for the rest of the session,
        // stealing frames from the real run, and stacking one more loop each time.
        let cancelled = false;

        const initGame = async () => {
            const { characterId, arenaId, difficultyId, isEndless, worldBossId, worldBossName, startingWeaponId, meteorAttackId } = runConfigRef.current || { characterId: 'neobyte', arenaId: 'station', difficultyId: 'normal', isEndless: false };
            // NG+ removed — ignore any legacy isNGPlus state passed via navigation.
            
            // CRITICAL: Initialize SaveManager first to load cloud save + merge upgrades
            await SaveManager.initialize();
            // Try to flush any runs queued from a previous failed save (background, non-blocking)
            flushPendingScores().catch(() => {});
            
            const save = SaveManager.load();

            // Increment daily raid-run counter when a raid run starts (covers Try Again
            // and any other entry path that bypasses GlobalRaid's launch handler).
            if (arenaId === 'world_boss_arena') {
                const todayDate = new Date().toISOString().split('T')[0];
                if (!save.raidRuns) save.raidRuns = {};
                save.raidRuns[todayDate] = (save.raidRuns[todayDate] || 0) + 1;
                SaveManager.save(save);
            }

        // 043: this run's server-side identity, set by cs_start_run below and
        // captured by the saveScore closure. Held HERE rather than read from
        // localStorage at submit time: flushPendingScores() fires on launch, on
        // tab focus and on `walletLinked`, so `openRunUuid()` at run end can be a
        // different run's key. The uuid of the run you played is the uuid you
        // were given when you started it.
        let clientRunUuid = null;

        const saveScore = async (stats, isVictory) => {
            const user = getOmenXUserSync();
            // 043: same reason as the name guard below — a null return resolves
            // the promise and the modal spins forever. `omenx_auth_data` missing
            // means there is no signed-in identity at all, which is worth saying.
            if (!user) throw new Error('[saveScore] No signed-in identity (omenx_auth_data absent) — run not submitted.');
            const displayName = user.player_name || user.full_name;

            if (!displayName || displayName.includes('@') || displayName.includes('0x') || displayName.trim() === '') {
                // 043: THROW rather than return null. A null resolves the promise,
                // so `if (res?.success)` simply skipped and the modal span its
                // spinner for a run nobody was ever going to submit — with a
                // console.warn as the only trace. The modal's .catch already
                // renders _saveFailed, so a refusal with a reason costs nothing.
                // ⚠️ The name is no longer part of the submission: save_score takes
                // no name and reads the call sign from `players` itself (D-155).
                // This guard is now only about not scoring a run for an identity
                // the client cannot name at all.
                throw new Error('[saveScore] No proper pilot name — run not submitted.');
            }

            // 🔴🔴 THE ENGINE'S OWN STATS, NOT base44's scoreData — 043, D-184.
            //
            // scoreData was a strict SUBSET and the adapter refuses it with a 400
            // that names this line, because the three fields it drops are the
            // three save_score cannot do without:
            //
            //   bossesKilled  — bounds boss gold at kills × 3000 and derives boss
            //                   fragments from the modifiers recorded at start
            //   elitesKilled  — never sent at all; base44's server recomputed it
            //   bossGold /
            //   bossFragments — the SPLIT. The engine folds the boss auto-credit
            //                   into `gold` and `runFragments` for the HUD, so
            //                   sending the totals as the pickup figures
            //                   DOUBLE-PAYS fragments and bypasses the gold bound
            //                   (D-78/D-182). The adapter refuses rather than
            //                   guess, which is why it must be handed `stats`.
            //
            // ⚠️ EVERY OTHER FIELD scoreData CARRIED IS NOW SERVER-OWNED, not
            // dropped: player_name / player_title / pilot_icon come from `players`
            // (D-155 reads the call sign AT RUN START and freezes it), arena_id,
            // character_id, difficulty and is_sandbox come from the run row
            // cs_start_run wrote and cs_run_params_immutable() will not let this
            // call change. Passing them again would be an invitation to disagree.
            //
            // ⚠️ squadStats IS GONE, and that is D-126/D-127, not an oversight:
            // the weekly squad-kills board is being rebuilt FROM `run_scores`
            // rather than from a client-reported counter, because a player opening
            // the Squad page zeroed base44's. save_score takes no squad argument.
            const payload = {
                stats,
                isVictory: !!isVictory,
                // The uuid of the run that was actually played — see the note at
                // its declaration. Absent means cs_start_run never succeeded, and
                // the adapter's 409 says exactly that instead of scoring a
                // different run.
                clientRunUuid,
            };

            // Retry with tight backoff. Most saves succeed on the first attempt
            // (logs show 1-3s end-to-end). When 429s hit, we want to retry quickly
            // — not stretch to 10s+ waits that blow past the modal's 25s timeout.
            // 4 attempts: 250ms, 500ms, 1s, 2s = ~3.75s total waits + ~2s exec each
            // = worst case ~12s, comfortably under the modal timeout.
            // EXCEPTION: 401 (auth expired — long endless runs outlive the session)
            // bails out immediately and queues the run, since retrying won't fix auth.
            const delays = [250, 500, 1000, 2000];
            let lastErr = null;
            let authExpired = false;
            for (let attempt = 0; attempt < delays.length; attempt++) {
                try {
                    const res = await base44.functions.invoke('saveScore', payload);
                    return res?.data || null;
                } catch (e) {
                    lastErr = e;
                    const status = e?.response?.status || e?.status;
                    const msg = (e?.message || '').toLowerCase();
                    // Detect expired Base44 session — happens on long runs (>1hr endless).
                    if (status === 401 || msg.includes('authentication required') || msg.includes('unauthorized')) {
                        authExpired = true;
                        console.warn('[saveScore] Session expired during run — queueing for next launch.');
                        break; // skip remaining retries
                    }
                    console.warn(`[saveScore] attempt ${attempt + 1}/${delays.length} failed:`, e?.message || e);
                    if (attempt < delays.length - 1) {
                        await new Promise(r => setTimeout(r, delays[attempt]));
                    }
                }
            }

            // All retries failed (or auth expired) — queue the run locally so we can retry on next launch.
            try {
                const queue = JSON.parse(localStorage.getItem('pending_score_saves') || '[]');
                queue.push({ payload, queuedAt: Date.now(), reason: authExpired ? 'auth_expired' : 'network' });
                // Keep queue bounded — 20 most recent runs is plenty.
                while (queue.length > 20) queue.shift();
                localStorage.setItem('pending_score_saves', JSON.stringify(queue));
                console.warn('[saveScore] Run queued for later retry.', authExpired ? '(auth expired)' : '');
            } catch (qErr) {
                console.error('[saveScore] Failed to queue run:', qErr);
            }
            console.error('[saveScore] FAILED:', lastErr?.message || lastErr);
            // Tag error so the UI can show a more specific message.
            if (lastErr) lastErr._authExpired = authExpired;
            throw lastErr;
        };
        // Expose to handleQuit so it can await the save before unmounting.
        saveScoreRef.current = saveScore;

        // Inject skin color override into save so GameEngine can read it
        const equippedSkinId = save.cosmetics?.skins?.[characterId];
        if (equippedSkinId) {
            const skin = SKIN_COSMETICS.find(s => s.id === equippedSkinId);
            if (skin) {
                save.skinColorOverride = skin.color;
            }
        }

        // Inject live OMENX balance so GameEngine can gate the revive prompt correctly
        save.omenxBalance = omenxBalance ?? 0;

        // S8 Sandbox — engine reads save.isSandbox to skip cloud writes (checkpointRun)
        // and _runStats mirrors it into stats.is_sandbox so server functions reject.
        save.isSandbox = isSandbox;

        // For Global Raid runs: fetch the cloud boss's current HP/max HP so the
        // in-game HP bar reflects the current global state (not a hardcoded value).
        // Other players' damage will be polled in via the live sync below.
        if (arenaId === 'world_boss_arena') {
            try {
                const { getCurrentPeriodIds } = await import('@/lib/periodIds');
                const { week_id } = getCurrentPeriodIds();
                const bosses = await base44.entities.GlobalBoss.filter({ week_id });
                if (bosses.length > 0) {
                    save.worldBossCloudMaxHp = bosses[0].max_hp;
                    save.worldBossCloudCurrentHp = bosses[0].current_hp;
                    save.worldBossCloudLevel = bosses[0].level || 1;
                }
            } catch (e) {
                console.warn('[Game] Failed to fetch global boss state:', e);
            }
        }

        // Inject equipped title buff so GameEngine can apply it as small permanent bonus
        try {
            const u = getOmenXUserSync();
            const equippedTitle = u?.data?.player_title;
            if (equippedTitle) {
                const { getTitleBuff } = await import('@/lib/playerTitles');
                save.titleBuff = getTitleBuff(equippedTitle);
            }
        } catch (e) {
            // No buff applied — title registry unavailable
        }

        // Tiny perk for staff/admins — +2% to base stats. Client-side, cached per session.
        try {
            const { getAdminBuff } = await import('@/lib/adminBuff');
            const adminBuff = await getAdminBuff();
            if (adminBuff) save.adminBuff = adminBuff;
        } catch (e) {
            // Not an admin or check failed — no buff applied
        }

        // Squad Meteor buffs — apply to EVERY arena run for squad members
        // ("Buffs apply to every squad member's runs" per getSquadMeteorState).
        // Cached by SquadMeteorPanel whenever the player visits the Squads page.
        try {
            const cached = localStorage.getItem('squad_meteor_buffs');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed?.buffs && parsed.buffs.applied_level > 0) {
                    save.squadMeteorBuffs = parsed.buffs;
                }
            }
        } catch (e) {
            // Cache read failed — skip buff (fail-open).
        }

        // Global XP buff — admin-set "make-good" multiplier (e.g. 2× XP for 24h
        // when OMENX settlement is down). Read from the SHARED maintenance cache
        // so we don't fire a fresh getMaintenanceMode call on every run start.
        try {
            const { getStatus: getMaintStatus } = await import('@/lib/maintenanceStatus');
            const buff = getMaintStatus()?.globalXpBuff;
            if (buff && buff.multiplier > 1 && buff.expiresAt > Date.now()) {
                save.globalXpBuff = { multiplier: Number(buff.multiplier), expiresAt: Number(buff.expiresAt) };
            }
        } catch (e) {
            // Cache read failed — skip buff (fail-open).
        }

        // Inject NFT multipliers from playerDataCache so GameEngine can apply them
        try {
            const { fetchPlayerData } = await import('@/lib/playerDataCache');
            const playerDataModule = await import('@/lib/playerDataCache');
            // Read cached NFT data synchronously from cache
            const cachedNftData = (() => { try { return JSON.parse(localStorage.getItem('omenx_nft_data')); } catch { return null; } })();
            if (cachedNftData && Array.isArray(cachedNftData) && cachedNftData.length > 0) {
                const { NFTPerkManager } = await import('../game/NFTPerks');
                NFTPerkManager.applyNFTPerks(cachedNftData);
                const charPerks = NFTPerkManager.getCharacterPerks(characterId, cachedNftData);
                save.nftGoldMultiplier = charPerks.goldMultiplier;
                save.nftRelicMultiplier = charPerks.relicFragmentMultiplier;
            }
        } catch (e) {
            // NFT data unavailable — no bonus applied
        }

        // 🔴🔴 START THE RUN SERVER-SIDE BEFORE THE ENGINE EXISTS — 043.
        //
        // base44 created its RunScore row at run END, so there was no call here
        // to port and none was ever written: `startRun` existed in the adapter
        // and in the whole shipped bundle it was referenced exactly once, by its
        // own export. The rebuild records the run's PARAMETERS first — arena,
        // character, difficulty, boss modifiers, sandbox flag —
        // cs_run_params_immutable() then refuses to let save_score change any of
        // them, and that is where H-7, H-8 and half of D-78 are closed. With no
        // started run, buildScoreArgs throws 409 and the run cannot be submitted
        // at all, so this is not optional and it cannot move below the engine.
        //
        // 🔴 THE ARENA ID IS THE ONE save_score WILL SCORE BY, and an endless run
        // does NOT carry 'endless' in runConfig — it keeps its SECTOR id and
        // GameEngine only makes the duration Infinite (GameEngine.js:287).
        // Sending the sector id would have the server score an endless run as a
        // sector run: HEAT applied where the engine has no dynamic difficulty, a
        // boss cap of `sector_index % 2` instead of `duration/180 + 1`, victory
        // reachable, and the whole endless gold rule inverted. base44's scoreData
        // mapped it the same way at :200 — this is that mapping, moved earlier.
        // 'endless' is a row in `arenas` and one of the three ids cs_start_run
        // leaves ungated, alongside world_boss_arena and quantum_meteor.
        let runStartError = null;
        try {
            clientRunUuid = await cs.startRun({
                arenaId: isEndless ? 'endless' : arenaId,
                characterId,
                difficulty: difficultyId || 'normal',
                // The engine reads the same object at GameEngine.js:544, so the
                // recorded modifiers and the played ones are one source.
                bossModifiers: save.bossModifiers || {},
                isSandbox,
            });
        } catch (e) {
            // NOT fatal to the launch, and deliberately so: a refusal here means
            // a character that is not unlocked, an arena that is not, or a
            // dropped connection, and leaving the player at a dead canvas fixes
            // none of them. The run plays; saveScore then throws its own 409
            // naming the missing run, which the modal already surfaces as
            // _saveFailed. Loud at both ends rather than a silent unscored run.
            runStartError = e;
            console.error(
                '[startRun] cs_start_run FAILED — this run cannot be scored. ' +
                    'Everything below still runs; the run-end save will refuse and say why:',
                e?.message || e
            );
        }
        if (cancelled) return;

        const engine = new GameEngine(canvas, characterId, arenaId, difficultyId, save, {
            // PERF 2026-08-07 — these three used to call setGameState directly.
            // onHpChange fires on every hit taken and every regen tick, onGoldChange
            // on every single gold pickup, and each one re-rendered the whole in-game
            // React tree (UIOverlay + its weapon/passive lists, DD pill, ability
            // meter) on the same main thread as the canvas loop. In a swarm that was
            // dozens of reconciles per second, scaling with combat intensity —
            // i.e. worst exactly when frames matter most.
            // The 100ms poll below already reads hp/maxHp/gold/time straight off the
            // engine, so these are now no-ops. HUD numbers land up to 100ms later,
            // which is imperceptible.
            onHpChange: () => {},
            onTimeChange: () => {},
            onGoldChange: () => {},
            onLevelUp: (choices) => {
                setGameState(s => ({ ...s, level: engine.level, xp: engine.xp, xpRequired: engine.xpRequired }));
                setLevelUpChoices(choices);
            },
            onFragmentFound: (amount) => {
                // Per-run pickup display only. The server credits PlayerSave.relicFragments
                // at run end (saveScore validates engine.runFragments and bumps the cloud).
                // Do NOT write relicFragments to localStorage here — syncSave treats it as
                // server-owned and blocks any client bump.
                setGameState(s => ({ ...s, relicFragments: (s.relicFragments || 0) + amount }));
            },
            onTokenFound: () => {
                const save = localStorage.getItem('cosmic_sloth_save') ? JSON.parse(localStorage.getItem('cosmic_sloth_save')) : SaveManager.load();
                save.cosmicTokens = (save.cosmicTokens || 0) + 1;
                SaveManager.save(save);
                setGameState(s => ({ ...s, cosmicTokens: save.cosmicTokens }));
            },
            onDeathPrompt: () => {
                // Defensive — clear any pending level-up choices so the LevelUp
                // modal can't render behind the revive prompt (Tijckers bug
                // 2026-05-14 — death triggered mid-reroll left the level-up
                // modal visible underneath). The level-up XP is still on the
                // engine, so if the player revives, levelUp() fires again on
                // the next tick and re-opens the modal cleanly.
                setLevelUpChoices(null);
                // Sandbox: never show the revive prompt (no OMENX charges). Let
                // the engine complete its game-over flow — practice runs die free.
                if (isSandbox) {
                    if (engineRef.current) {
                        engineRef.current.player.hasRevivedWithTokens = true;
                        engineRef.current.isPaused = false;
                        engineRef.current.gameOver();
                    }
                    return;
                }
                setShowRevivePrompt(true);
            },
            onCharacterFound: (charId) => {
                const save = localStorage.getItem('cosmic_sloth_save') ? JSON.parse(localStorage.getItem('cosmic_sloth_save')) : SaveManager.load();
                if (!save.foundCharacters.includes(charId)) {
                    save.foundCharacters.push(charId);
                    if (!save.unlockedCharacters.includes(charId)) {
                        save.unlockedCharacters.push(charId);
                    }
                    SaveManager.save(save);
                }
            },
            onGameOver: (stats) => {
                stats.difficultyId = difficultyId;
                stats.isEndless = isEndless;
                stats.startingWeaponId = startingWeaponId;
                stats.worldBossId = worldBossId;
                stats.worldBossName = worldBossName;
                // Server is the SOLE source of truth for credited gold/kills/fragments/score.
                // We DO NOT pre-fill these on the modal — instead the modal shows a spinner
                // for those rows until the server response lands (or shows "queued for retry"
                // if it times out). This prevents the historical bug where the modal showed
                // "+3528 gold (capped)" but the save had timed out and the actual credited
                // amount was unknown. Time/Level/Kills/Damage are unambiguous (just what
                // happened in the run, no server caps apply) and remain visible immediately.
                stats.score = null;
                setGameOverStats(stats);
                // Server validates run, applies aggregates to PlayerSave, returns updated save.
                saveScore(stats, false).then((res) => {
                    if (res?.success) {
                        // Server confirmed — safe to clear the local recovery snapshot.
                        // (Engine.gameOver() no longer clears it preemptively — see fix
                        // 2026-05-07 for Anubis's lost endless run.)
                        try { localStorage.removeItem('pending_run_snapshot'); } catch {}
                        // Apply server-truthful save (includes gold/kills/bounty progress + relicFragments).
                        // Preserve client-owned fields that saveScore doesn't touch — otherwise the
                        // server response would wipe any UI prefs / cosmetics the player edited
                        // between their last sync and this run (e.g. jukebox toggles, SFX categories,
                        // selected character/arena, equipped cosmetics).
                        if (res.saveData) {
                            const localSave = SaveManager.load();
                            const merged = {
                                ...res.saveData,
                                cosmicTokens: Math.max(Number(res.saveData.cosmicTokens || 0), Number(localSave?.cosmicTokens || 0)),
                                // Client-owned UI prefs — never overwrite with cloud's older copy.
                                jukeboxPrefs: localSave?.jukeboxPrefs ?? res.saveData.jukeboxPrefs,
                                sfxCategories: localSave?.sfxCategories ?? res.saveData.sfxCategories,
                                cosmetics: localSave?.cosmetics ?? res.saveData.cosmetics,
                                lastSelectedChar: localSave?.lastSelectedChar ?? res.saveData.lastSelectedChar,
                                lastSelectedArena: localSave?.lastSelectedArena ?? res.saveData.lastSelectedArena,
                                lastSelectedDifficulty: localSave?.lastSelectedDifficulty ?? res.saveData.lastSelectedDifficulty,
                                lastSelectedWeapon: localSave?.lastSelectedWeapon ?? res.saveData.lastSelectedWeapon,
                                equippedRelics: localSave?.equippedRelics ?? res.saveData.equippedRelics,
                                poolBias: localSave?.poolBias ?? res.saveData.poolBias,
                            };
                            SaveManager.save(merged);
                        }
                        setGameOverStats(s => ({
                            ...s,
                            _serverConfirmed: true,
                            score: res.score,
                            unlockedCharacter: res.grantedCharacter || null,
                            // Server-credited values are now authoritative.
                            gold: res.goldCredited ?? 0,
                            kills: res.killsCredited ?? s.kills,
                            fragments: res.fragmentsCredited ?? s.fragments,
                            // Adopt the server's validated time so the modal matches the
                            // leaderboard exactly (server may clamp to arena duration on S5).
                            time: res.timeSurvived ?? s.time,
                            endlessGoldCapped: res.endlessGoldCapped,
                            endlessKillsCapped: res.endlessKillsCapped,
                            fragmentsCapped: res.fragmentsCapped,
                        }));
                    }
                }).catch(err => {
                    console.error('[Game] saveScore failed:', err);
                    // Unblock the modal so the player can continue. Do NOT fill in
                    // gold/fragments/score — the modal will show "queued for retry"
                    // for those rows instead of fake numbers.
                    setGameOverStats(s => ({ ...s, _saveFailed: true, _authExpired: !!err?._authExpired }));
                });
                
                if (stats.worldBossDamage > 0 && !isSandbox) {
                    // Server reads the trusted pilot name from PlayerSave — don't send it
                    // from the client (fix 2026-05-13: client fallback to full_name was
                    // causing legit pilots to show as Pilot_XXXXXX in the raid feed).
                    // Sandbox runs skip boss damage entirely (server would reject anyway,
                    // but no point in the round-trip).
                    base44.functions.invoke('submitBossDamage', { damage: stats.worldBossDamage })
                        .catch(err => console.error('Failed to submit boss damage', err));
                }
                // Squad Meteor: submit damage against the squad's shared meteor.
                // Attempt was already consumed at launch via mode='start' — passing
                // attackId here UPDATES the reserved row rather than charging again.
                // Capture the response so we can surface a level-up celebration on
                // the run-end modal (purely cosmetic — the level itself is already
                // applied server-side regardless of whether we read the response).
                if (arenaId === 'quantum_meteor' && (stats.meteorDamage || 0) > 0 && !isSandbox) {
                    // FAST LAUNCH: attackId may have been reserved AFTER navigation.
                    // Pull the latest value from sessionStorage if location.state didn't carry one.
                    let resolvedAttackId = meteorAttackId || null;
                    if (!resolvedAttackId) {
                        try {
                            const raw = sessionStorage.getItem('squad_meteor_pending_attack');
                            if (raw) {
                                const p = JSON.parse(raw);
                                if (p?.status === 'ready' && p.attackId) resolvedAttackId = p.attackId;
                            }
                        } catch {}
                    }
                    base44.functions.invoke('submitSquadMeteorDamage', {
                        mode: 'finish',
                        attackId: resolvedAttackId,
                        damage: stats.meteorDamage,
                    }).then(res => {
                        if (res?.data?.leveled_up) {
                            setGameOverStats(s => ({
                                ...s,
                                meteorLevelUp: {
                                    leveled_up: true,
                                    levels_gained: res.data.levels_gained || [],
                                    new_level: res.data.meteor?.level,
                                },
                            }));
                        }
                    }).catch(err => console.error('[Game] submitSquadMeteorDamage failed:', err?.message));
                }
            },
            onVictory: (stats) => {
                stats.difficultyId = difficultyId;
                stats.isEndless = isEndless;
                stats.startingWeaponId = startingWeaponId;
                stats.worldBossId = worldBossId;
                stats.worldBossName = worldBossName;
                // Same as game-over — server is sole source of truth for credited
                // gold/kills/fragments/score. Modal shows spinner for those rows
                // until response lands.
                stats.score = null;
                setVictoryStats(stats);
                // Server validates run, applies aggregates + arena unlock + char milestone, returns updated save.
                saveScore(stats, true).then((res) => {
                    if (res?.success) {
                        // Server confirmed — safe to clear the local recovery snapshot.
                        try { localStorage.removeItem('pending_run_snapshot'); } catch {}
                        // Server now credits relicFragments — preserve only cosmicTokens + client-owned UI prefs.
                        // (Same protection as the game-over path — see comment there.)
                        if (res.saveData) {
                            const localSave = SaveManager.load();
                            const merged = {
                                ...res.saveData,
                                cosmicTokens: Math.max(Number(res.saveData.cosmicTokens || 0), Number(localSave?.cosmicTokens || 0)),
                                jukeboxPrefs: localSave?.jukeboxPrefs ?? res.saveData.jukeboxPrefs,
                                sfxCategories: localSave?.sfxCategories ?? res.saveData.sfxCategories,
                                cosmetics: localSave?.cosmetics ?? res.saveData.cosmetics,
                                lastSelectedChar: localSave?.lastSelectedChar ?? res.saveData.lastSelectedChar,
                                lastSelectedArena: localSave?.lastSelectedArena ?? res.saveData.lastSelectedArena,
                                lastSelectedDifficulty: localSave?.lastSelectedDifficulty ?? res.saveData.lastSelectedDifficulty,
                                lastSelectedWeapon: localSave?.lastSelectedWeapon ?? res.saveData.lastSelectedWeapon,
                                equippedRelics: localSave?.equippedRelics ?? res.saveData.equippedRelics,
                                poolBias: localSave?.poolBias ?? res.saveData.poolBias,
                            };
                            SaveManager.save(merged);
                        }
                        setVictoryStats(s => ({
                            ...s,
                            _serverConfirmed: true,
                            score: res.score,
                            unlockedCharacter: res.grantedCharacter || null,
                            gold: res.goldCredited ?? 0,
                            kills: res.killsCredited ?? s.kills,
                            fragments: res.fragmentsCredited ?? s.fragments,
                            // Adopt the server's validated time so the modal matches the
                            // leaderboard exactly (server may clamp to arena duration on S5).
                            time: res.timeSurvived ?? s.time,
                            endlessGoldCapped: res.endlessGoldCapped,
                            endlessKillsCapped: res.endlessKillsCapped,
                            fragmentsCapped: res.fragmentsCapped,
                        }));
                    }
                }).catch(err => {
                    console.error('[Game] saveScore failed:', err);
                    setVictoryStats(s => ({ ...s, _saveFailed: true, _authExpired: !!err?._authExpired }));
                });
                
                if (stats.worldBossDamage > 0 && !isSandbox) {
                    // Server reads the trusted pilot name from PlayerSave (see onGameOver).
                    base44.functions.invoke('submitBossDamage', { damage: stats.worldBossDamage })
                        .catch(err => console.error('Failed to submit boss damage', err));
                }
                // Squad Meteor — same flow as onGameOver above.
                if (arenaId === 'quantum_meteor' && (stats.meteorDamage || 0) > 0 && !isSandbox) {
                    let resolvedAttackId = meteorAttackId || null;
                    if (!resolvedAttackId) {
                        try {
                            const raw = sessionStorage.getItem('squad_meteor_pending_attack');
                            if (raw) {
                                const p = JSON.parse(raw);
                                if (p?.status === 'ready' && p.attackId) resolvedAttackId = p.attackId;
                            }
                        } catch {}
                    }
                    base44.functions.invoke('submitSquadMeteorDamage', {
                        mode: 'finish',
                        attackId: resolvedAttackId,
                        damage: stats.meteorDamage,
                    }).then(res => {
                        if (res?.data?.leveled_up) {
                            setVictoryStats(s => ({
                                ...s,
                                meteorLevelUp: {
                                    leveled_up: true,
                                    levels_gained: res.data.levels_gained || [],
                                    new_level: res.data.meteor?.level,
                                },
                            }));
                        }
                    }).catch(err => console.error('[Game] submitSquadMeteorDamage failed:', err?.message));
                }
            }
        }, isEndless, worldBossId, worldBossName, startingWeaponId);

        // Lost the race — tear this engine down immediately instead of leaking it.
        if (cancelled) {
            engine.cleanup();
            return;
        }

        engineRef.current = engine;

        // Sandbox — pre-fire N starter level-ups so the player picks their build
        // before mobs spawn. Same pattern as squad meteor's pendingStarterLevelUps
        // chain: each pick opens LevelUpModal and applyUpgrade queues the next.
        const startLevel = Number(runConfigRef.current?.sandboxStartLevel || 1);
        if (isSandbox && startLevel > 1) {
            engine.pendingStarterLevelUps = startLevel - 1;
        }

        setGameState({
            hp: engine.player.hp, maxHp: engine.player.maxHp,
            time: 0, duration: engine.arena.duration, level: engine.level, xp: engine.xp, xpRequired: engine.xpRequired, gold: 0,
            relicFragments: save.relicFragments || 0,
            cosmicTokens: save.cosmicTokens || 0,
            score: 0
        });
        
        SoundManager.init();
        SoundManager.setContext('game');
        SoundManager.playBGM();
        
        // Preload all character sprites in background (non-blocking)
        SpritePreloader.preload();

        setIsInitializing(false);
        };
        
        initGame();
        
        return () => {
            cancelled = true;
            window.removeEventListener('resize', resizeCanvas);
            window.removeEventListener('orientationchange', resizeCanvas);
            if (engineRef.current) {
                engineRef.current.cleanup();
            }
            SoundManager.stopBGM();
            SoundManager.setContext('menu');
        };
        // Deps: ONLY the internal restart counter. Popstate-triggered location
        // changes (back-gesture trap) won't re-run this effect — which is what
        // we want, otherwise the cleanup tears down the live engine.
    }, [runId]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (engineRef.current && !engineRef.current.isPaused) {
                const engine = engineRef.current;
                // Mirror the server's score formula EXACTLY (functions/saveScore.js).
                // Any divergence here causes the HUD to show one number and the leaderboard
                // to record a different one — Hugo bug 2026-04-30 (bullet_hell mismatch),
                // raid-arena 2× mismatch 2026-05-04 (HUD treated raid as endless via the
                // duration===Infinity check — server gave it 1.0×).
                // Hardcoded list MUST match saveScore.js ARENA_ORDER exactly.
                const ARENA_ORDER = ['station', 'asteroid', 'nebula', 'void', 'plasma', 'crystal', 'moon', 'blackhole', 'mothership', 'dimension'];
                const arenaId = engine.arena?.id;
                let arenaMultiplier;
                if (arenaId === 'endless') {
                    arenaMultiplier = 2.0;
                } else {
                    const idx = ARENA_ORDER.indexOf(arenaId);
                    arenaMultiplier = 1.0 + (Math.max(0, idx) * 0.2);
                }
                // Endless caps — must mirror saveScore.js (ENDLESS_GOLD_PER_SEC=12,
                // ENDLESS_KILLS_PER_SEC=4, hard ceilings 10000/6000, floors 1000/600).
                // The caps apply to PlayerSave aggregation (ledger), NOT to score.
                // The server's score formula uses RAW kills+gold, so the HUD must too —
                // otherwise the HUD score under-reports vs the end-of-run modal.
                // (Capped values are still used for the displayed kill/gold tiles via
                // UIOverlay.displayGold and `kills: killsForScore` below — those are
                // the wallet-credited numbers and must stay capped.)
                const isEndlessHud = arenaId === 'endless';
                const killsForScore = engine.kills; // RAW for score formula
                const goldForScore = engine.gold;   // RAW for score formula
                let killsForDisplay = engine.kills;
                // S5 only: clamp displayed kills to the server's endless ledger cap so
                // the HUD shows what'll actually be banked. S6 removed the cap entirely
                // — display the raw value (matches the no-MAX-pip behavior in UIOverlay).
                const _hudIsS5 = getCurrentPeriodIds().season_id === '2026-S5';
                if (_hudIsS5 && isEndlessHud) {
                    const t = engine.time || 0;
                    killsForDisplay = Math.min(engine.kills, Math.min(6000, Math.max(600, Math.floor(t * 4))));
                }
                // Server also adds +5000 victory bonus, but is_victory only fires at the
                // very final tick — the modal shows the server's authoritative value, so
                // omitting it from the live HUD is intentional (less than 1s of skew).
                //
                // CRITICAL: gold's contribution to the score is capped at kills×150 by
                // the server (see saveScore.js goldScoreCap). Without mirroring that cap
                // here, whales with stacked gold mults see a wildly inflated HUD score
                // that gets clipped on submit — players reasonably interpret the gap as
                // "the game stole my points". Mirror the cap so HUD = server.
                // S6+ drops gold from the score entirely (server logic auto-flips at the
                // season boundary). Mirror that too via period detection so the HUD
                // doesn't keep showing gold contribution after the rollover.
                const { season_id: hudSeasonId } = getCurrentPeriodIds();
                const isS6OrLater = hudSeasonId !== '2026-S5';
                let goldScoreContribution;
                if (isS6OrLater) {
                    goldScoreContribution = 0;
                } else {
                    // S5 gold cap: 200g/kill × 1.5 (mirror saveScore.js).
                    const goldScoreCap = killsForScore * 200;
                    goldScoreContribution = Math.min(goldForScore, goldScoreCap) * 1.5;
                }
                // Mid-S5 hotfix v4 (2026-05-07): kills ×45, level² ×15. Mirrors saveScore.js.
                // Victory bonus is omitted from the live HUD (only added on final tick by server).
                const baseScore = killsForScore * 45 + engine.level * engine.level * 15 + engine.time * 5 + goldScoreContribution;
                // Server also enforces a 2.5M hard ceiling — mirror it so the HUD never
                // shows a score the leaderboard will refuse to record.
                const SCORE_HARD_CEILING = 2_500_000;
                const liveScore = Math.min(SCORE_HARD_CEILING, Math.floor(baseScore * arenaMultiplier));

                // Rolling 10s window so post-boss/late upgrades show up in the HUD immediately.
                const dps = engine.getRollingDps ? Math.floor(engine.getRollingDps()) : 0;

                // Find active boss for off-screen HP bar
                let boss = null;
                if (engine.isBossActive && engine.enemies) {
                    const b = engine.enemies.find(e => e && e.isBoss && e.hp > 0);
                    if (b) boss = { name: b.name, hp: b.hp, maxHp: b.maxHp };
                }

                // Dynamic Difficulty multiplier — surfaced to the HUD pill so players
                // can SEE when their performance has pushed the spawn rate into
                // FRENZY / IN THE ZONE thresholds. Read-only — no engine mutation.
                const ddMultForHud = engine.dynamicDifficulty?.spawnRateMult ?? 1.0;

                setGameState(s => ({
                    ...s,
                    // Polled here instead of pushed from engine callbacks (see the
                    // onHpChange / onGoldChange comment in the init effect).
                    hp: engine.player.hp,
                    maxHp: engine.player.maxHp,
                    gold: engine.gold,
                    time: Math.floor(engine.time),
                    level: engine.level,
                    xp: engine.xp,
                    xpRequired: engine.xpRequired,
                    weapons: engine.player.weapons || [],
                    passives: engine.player.passives || [],
                    score: liveScore,
                    dps,
                    boss,
                    // Display the capped (wallet-credited) kill count — score formula
                    // uses RAW kills above; this tile shows what gets banked.
                    kills: killsForDisplay || 0,
                    // S5 only — S6 server doesn't cap kills, so suppress the badge trigger.
                    killsCapped: _hudIsS5 && isEndlessHud && engine.kills > killsForDisplay,
                    totalDamage: Math.floor(engine.totalDamageDealt || 0),
                    xpBuffActive: !!engine.player?.xpBuffActive,
                    xpBuffExpiry: engine.xpBuffExpiry || 0,
                    ddMult: ddMultForHud,
                }));
            }
        }, 100);
        return () => clearInterval(interval);
    }, []);

    // Keep the engine's view of omenxBalance in sync with the live cached value.
    // Must depend on omenxBalance so it re-syncs every time the cache updates
    // (e.g. after refreshBalance() following a purchase).
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.save.omenxBalance = omenxBalance ?? 0;
        }
    }, [omenxBalance]);

    const purchaseSku = async (skuId, quantity = 1, grantInfo = null) => {
        if (!skuId) return;
        const user = getOmenXUserSync();
        const playerName = user?.player_name || user?.full_name || 'Pilot';
        return base44.functions.invoke('purchaseSku', { skuId, quantity, playerName, grantInfo })
            .then(r => r.data)
            .catch(e => console.error('[Game purchaseSku] failed:', e?.message));
    };

    // Pause-menu handler — buys a 60-minute +50% XP session buff and applies the
    // expiry to the running engine so the multiplier flips back on immediately.
    // Server is the source of truth for the timestamp (clock skew safety).
    const handleXpBuff = () => {
        const XP_COST = 10;
        const engine = engineRef.current;
        if (!engine) return;
        const buffActive = engine.xpBuffExpiry > Date.now();
        if (buffActive) return; // server also rejects, but no point firing the modal
        if ((omenxBalance ?? 0) < XP_COST) return;
        if (omenxPurchasesDisabled) return;
        confirmPurchase(XP_COST, '+50% XP Buff (1 hour)', () => {
            // Optimistic apply — engine flips to 1.5× XP immediately so the rest
            // of the run benefits while the OMENX charge settles in the background.
            const optimisticExpiry = Date.now() + 60 * 60 * 1000;
            engine.xpBuffExpiry = optimisticExpiry;
            engine.player.xpBuffActive = true;
            engine.player.xpMult = engine._xpMultBase * 1.5;
            // Reconcile with server timestamp once the purchase confirms.
            purchaseSku(IN_GAME_SKUS.xpSession, 1, { type: 'xp_buff' }).then(res => {
                if (res?.saveData?.sessionBuffs?.xpExpiry) {
                    engine.xpBuffExpiry = Number(res.saveData.sessionBuffs.xpExpiry);
                    SaveManager.save({ ...SaveManager.load(), sessionBuffs: res.saveData.sessionBuffs });
                }
            });
            refreshBalance();
        });
    };

    const handleUpgradeSelect = (upgrade) => {
        const engine = engineRef.current;
        if (!engine) { setLevelUpChoices(null); return; }
        engine.applyUpgrade(upgrade);
        // If applyUpgrade caused another level-up (XP overflow OR the squad-meteor
        // starter stack queued the next one), fire the NEXT levelUp() IMMEDIATELY
        // so the engine never ticks a frame between modals. applyUpgrade unpauses
        // unconditionally, so we have to call levelUp() here (which re-pauses and
        // generates fresh choices) — without this call, the engine was getting
        // soft-locked: isPaused=true, modal closed, and nothing to reopen it
        // (Thom bug 2026-05-15 raid runs stuck at 0/0/0; Tijckers bug 2026-05-14
        // mobs killing the player between back-to-back level-ups).
        //
        // For squad meteor, applyUpgrade itself already chains to levelUp() via
        // pendingStarterLevelUps, so we just keep isPaused=true and return — the
        // new choices are already queued by the time we get here.
        if (engine.pendingStarterLevelUps > 0 && !engine.isGameOver && !engine.isVictory) {
            engine.isPaused = true;
            return;
        }
        if (engine.xp >= engine.xpRequired && !engine.isGameOver && !engine.isVictory) {
            // Don't close the modal yet — engine.levelUp() will replace its
            // contents via the onLevelUp callback (setLevelUpChoices(newChoices)),
            // so closing here would just cause a single-frame flicker. Just hand
            // off to the engine and let React render the next set.
            engine.levelUp();
            return;
        }
        // Resume immediately, but grant a generous invulnerability window so
        // players who get ambushed mid-modal don't die instantly. 2.5s is enough
        // to reposition out of a swarm, dodge an overlapping boss telegraph, or
        // walk through camping mobs without taking fatal contact damage.
        // (Tijckers bug 2026-05-14 — players were dying inside the iFrames
        // window with mobs camping them at 1 HP. Period — no death on the
        // level-up modal regardless of whether a reroll happened.)
        // Bumped 2.0 → 2.5s on 2026-05-22 (Simon/Texxy/RocketMine Discord feedback)
        // — phone users were still taking unavoidable hits closing the modal on
        // top of a swarm; BuffAuraRenderer now also draws a cyan shield ring so
        // players can SEE the protection while it lasts.
        engine.lastTime = performance.now();
        engine.player.iFrames = Math.max(engine.player.iFrames || 0, 2.5);
        engine.player.invincibleTimer = Math.max(engine.player.invincibleTimer || 0, 2.5);
        engine.isPaused = false;
        setLevelUpChoices(null);
    };

    const handleReroll = () => {
        const REROLL_COST = 2;
        if (omenxPurchasesDisabled) return;
        if ((omenxBalance ?? 0) >= REROLL_COST) {
            confirmPurchase(REROLL_COST, 'Reroll Upgrades', () => {
                // Grant immediately, pay in background (fire-and-forget)
                if (engineRef.current) engineRef.current.rerollChoices();
                purchaseSku(IN_GAME_SKUS.reroll); // no await
                refreshBalance(); // no await
            });
        }
    };

    const handleBanish = (choice) => {
        const cost = banishCost;
        if (omenxPurchasesDisabled) return;
        if ((omenxBalance ?? 0) >= cost) {
            const tierLabel = cost === 1 ? 'Tier 1' : cost === 2 ? 'Tier 2' : 'Tier 3';
            confirmPurchase(cost, `Banish Upgrade (${tierLabel})`, () => {
                // Grant immediately, pay in background (fire-and-forget)
                if (engineRef.current) {
                    engineRef.current.banishUpgrade(choice.id);
                    engineRef.current.rerollChoices();
                }
                // Pick the right tiered SKU — T1 (2), T2 (4), or T3 (6 OMENX). Single charge per banish.
                const banishSku = cost === 2 ? IN_GAME_SKUS.banish
                                : cost === 4 ? IN_GAME_SKUS.banishT2
                                : IN_GAME_SKUS.banishT3;
                purchaseSku(banishSku);
                refreshBalance(); // no await
                setBanishCount(c => c + 1);
            });
        }
    };

    const handleJoystickChange = (pos) => {
        if (engineRef.current) {
            engineRef.current.joystick = pos;
        }
    };

    const handleSquadUltimate = (tier = 'full') => {
        const cost = tier === 'lite' ? 5 : 10;
        const itemName = tier === 'lite' ? 'Squad Lite (capped power)' : 'Squad Ultimate (full power)';
        const skuId = tier === 'lite' ? IN_GAME_SKUS.squadUltimateLite : IN_GAME_SKUS.squadUltimateFull;
        if (omenxPurchasesDisabled) return;
        // NOTE: ULT buttons now live inside PauseModal — engine IS paused when
        // this fires. PauseModal no longer calls onResume() itself, so the game
        // stays cleanly paused while the OMENX confirm prompt is up (Anubis bug
        // 2026-06-18 — game was running in background behind the confirm popup).
        if ((omenxBalance ?? 0) >= cost && engineRef.current) {
            // No `force` — the "don't show for 24h" skip is now respected so
            // repeat ULT presses don't get spammed with the confirm modal.
            confirmPurchase(cost, itemName, () => {
                // Grant immediately, pay in background
                engineRef.current.triggerSquadUltimate(tier);
                purchaseSku(skuId);
                refreshBalance();
                // Drop the player straight back into the run with their ULT live.
                handleResume();
            });
        }
    };

    const handlePause = () => {
        if (engineRef.current && !engineRef.current.isGameOver && !engineRef.current.isVictory && !levelUpChoices) {
            engineRef.current.isPaused = true;
            setIsPaused(true);
        }
    };

    const handleResume = () => {
        if (engineRef.current) {
            // Close the modal immediately, but keep the engine paused for 1.5s
            // so the player has a beat to grab their joystick before action resumes.
            setIsPaused(false);
            setTimeout(() => {
                if (engineRef.current && !engineRef.current.isGameOver && !engineRef.current.isVictory) {
                    engineRef.current.lastTime = performance.now(); // prevent dt spike
                    engineRef.current.isPaused = false;
                }
            }, 1500);
        }
    };

    const handleRestart = () => {
        const engine = engineRef.current;
        if (!engine) return;
        // Bump the internal counter — effect re-runs, cleanup tears down the
        // current engine, init builds a fresh one using runConfigRef.current.
        // No navigation needed (and avoids interfering with the back-gesture trap).
        setRunId(id => id + 1);
    };

    const [isQuitting, setIsQuitting] = useState(false);
    const handleQuit = async () => {
        const engine = engineRef.current;
        const isRaid = engine?.arena?.id === 'world_boss_arena';
        const isMeteor = engine?.arena?.id === 'quantum_meteor';
        // Meteor runs return to the Squads page (slide 5) so the player sees their
        // updated meteor HP / activity feed immediately.
        const target = isRaid ? '/?slide=11' : (isMeteor ? '/?slide=5' : '/');
        const navState = { state: { slide: isRaid ? 11 : (isMeteor ? 5 : 1) } };

        if (!engine || engine.isGameOver || engine.isVictory) {
            navigate(target, navState);
            return;
        }

        // Squad Meteor quit: instead of suppressing the modal, trigger the engine's
        // natural victory flow so the player sees the VictoryModal with their
        // damage stats + level-up banner (and the existing onVictory callback
        // saves the run + submits meteor damage). The modal's "Return to Lounge"
        // button handles navigation back to the Squads page.
        if (isMeteor) {
            // Resume in case the player quit from the pause menu — victory() needs
            // an unpaused engine to fire its callback cleanly.
            engine.isPaused = false;
            engine.victory();
            return;
        }
        // Endless / abandoned runs: must await saveScore before navigating away,
        // otherwise unmount cancels the in-flight fetch and progress is lost.
        setIsQuitting(true);
        engine.isPaused = false;
        engine.isGameOver = true;
        const stats = {
            time: Math.floor(engine.time),
            level: engine.level,
            kills: engine.kills,
            gold: engine.gold,
            fragments: engine.runFragments || 0,
            characterId: engine.characterId,
            arenaId: engine.arena?.id,
            encountered: Array.from(engine.encounteredEnemies),
            enemyKills: engine.enemyKills,
            worldBossDamage: engine.worldBossDamage || 0,
            _suppressModal: true,
        };
        try {
            // Quit is a "clean" exit — clear any safety snapshot SYNCHRONOUSLY
            // BEFORE saveScore so a hot-reload/refresh mid-save can't re-queue it.
            try { localStorage.removeItem('pending_run_snapshot'); } catch {}
            // Mirrors onGameOver's saveScore call but awaited so it survives unmount.
            await saveScoreRef.current?.(stats, false);
            // Also await boss damage submission so raid contributions aren't dropped
            // when the navigate() unmounts the component mid-flight.
            if (stats.worldBossDamage > 0) {
                // Server reads the trusted pilot name from PlayerSave (see onGameOver).
                try {
                    await base44.functions.invoke('submitBossDamage', { damage: stats.worldBossDamage });
                } catch (bossErr) {
                    console.warn('[Game] submitBossDamage on quit failed:', bossErr?.message);
                }
            }
            // Squad meteor quit — submit whatever damage was dealt before bailing
            // (attempt was already consumed at launch, so the row is updated rather
            // than created). Pulled directly from the engine since `stats` may not
            // include meteorDamage for the early-quit path.
            if (engine?.arena?.id === 'quantum_meteor') {
                const quitMeteorDamage = Math.floor(engine?.runMeteorDamage || 0);
                // Resolve attackId: prefer the value from location.state, fall back
                // to sessionStorage (FAST LAUNCH path where reservation lands after nav).
                let quitMeteorAttackId = location.state?.meteorAttackId || null;
                if (!quitMeteorAttackId) {
                    try {
                        const raw = sessionStorage.getItem('squad_meteor_pending_attack');
                        if (raw) {
                            const p = JSON.parse(raw);
                            if (p?.status === 'ready' && p.attackId) quitMeteorAttackId = p.attackId;
                        }
                    } catch {}
                }
                let submitError = null;
                if (quitMeteorDamage > 0) {
                    try {
                        await base44.functions.invoke('submitSquadMeteorDamage', {
                            mode: 'finish',
                            attackId: quitMeteorAttackId || null,
                            damage: quitMeteorDamage,
                        });
                    } catch (mErr) {
                        submitError = mErr?.message || 'Submit failed';
                        console.warn('[Game] submitSquadMeteorDamage on quit failed:', mErr?.message);
                    }
                }
                // Drop a toast payload for SquadMeteorPanel to display on mount.
                try {
                    sessionStorage.setItem('squad_meteor_quit_toast', JSON.stringify({
                        damage: quitMeteorDamage,
                        error: submitError,
                    }));
                    sessionStorage.removeItem('squad_meteor_pending_attack');
                } catch {}
            }
        } catch (e) {
            console.error('[Game] handleQuit save failed:', e);
        } finally {
            navigate(target, navState);
        }
    };

    // S8 revive escalation. Tier is picked from run time + arena; pre-S8 falls
    // back to the flat 4-OMENX SKU inside getReviveForRun so nothing changes
    // for the in-flight S7 leaderboard experience.
    const reviveEngine = engineRef.current;
    const reviveInfo = getReviveForRun(reviveEngine?.time || 0, reviveEngine?.arena?.id || '');

    const handleRevive = () => {
        if (omenxPurchasesDisabled) return;
        if (isSandbox) return; // no OMENX charges in sandbox — buttons are hidden anyway
        const { skuId, cost } = reviveInfo;
        if ((omenxBalance ?? 0) < cost) return;
        confirmPurchase(cost, 'Emergency Revive', () => {
            // Grant immediately, pay in background
            if (engineRef.current) {
                engineRef.current.player.hp = engineRef.current.player.maxHp * 0.5;
                engineRef.current.player.iFrames = 3.0;
                engineRef.current.player.invincibleTimer = 3.0;
                engineRef.current.player.hasRevivedWithTokens = true;
                engineRef.current.isPaused = false;
                setShowRevivePrompt(false);
            }
            // S8+ passes grantInfo so the server can validate the tier matches the
            // run time it saw. Pre-S8 sends no grantInfo (legacy flat-price path).
            const grantInfo = skuId === 'ingame-revive' ? null : {
                type: 'revive',
                runTime: engineRef.current?.time || 0,
                arenaId: engineRef.current?.arena?.id || '',
            };
            purchaseSku(skuId, 1, grantInfo);
            refreshBalance();
        });
    };

    // In sandbox mode, the death prompt should just skip the revive UI and go
    // straight to game-over (no OMENX charges in sandbox). Belt-and-braces:
    // engine also short-circuits below in onDeathPrompt if isSandbox is set.
    const handleDeclineRevive = () => {
        setShowRevivePrompt(false);
        // Player chose death — clear any pending level-up so it can't render
        // briefly during the death animation / game-over transition.
        setLevelUpChoices(null);
        if (engineRef.current) {
            engineRef.current.isPaused = false;
            engineRef.current.player.hasRevivedWithTokens = true;
            engineRef.current.particleManager.createExplosion(engineRef.current.player.x, engineRef.current.player.y, engineRef.current.player.color, 3, engineRef.current.characterId);
            engineRef.current.gameOver();
        }
    };

    React.useEffect(() => {
        // Block pull-down refresh AND iOS/Android swipe-back-gesture during gameplay.
        // Two-pronged: CSS overscroll-behavior + JS touch handlers that intercept
        // ANY gesture starting near the top edge (pull-to-refresh) or left/right
        // edges (browser swipe-back / forward navigation).
        // Texxy/JackM bug 2026-05-20 — accidental refresh during level-up modal
        // touches, and left-edge swipes occasionally triggering history back nav.
        const root = document.querySelector('[style*="overscrollBehavior"]');
        if (root) {
            root.style.overscrollBehavior = 'none';
            root.style.overscrollBehaviorY = 'none';
        }
        // Also lock html/body — Android Chrome uses these as the scroll container
        // for pull-to-refresh detection, not the visible app root.
        const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
        const prevBodyOverscroll = document.body.style.overscrollBehavior;
        const prevHtmlTouch = document.documentElement.style.touchAction;
        const prevBodyTouch = document.body.style.touchAction;
        document.documentElement.style.overscrollBehavior = 'none';
        document.body.style.overscrollBehavior = 'none';
        // touch-action:none disables all native browser gestures (PTR + swipe-nav).
        document.documentElement.style.touchAction = 'none';
        document.body.style.touchAction = 'none';

        // Track the initial touch position so we can identify edge-originating gestures.
        let startX = 0;
        let startY = 0;

        const onTouchStart = (e) => {
            if (!e.touches || e.touches.length === 0) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            // Opt-out for buttons inside the edge guard zones (e.g. HideHudButton
            // sits in top-right corner and was getting its tap eaten on Android,
            // softlocking players who hid the HUD — Texxy/Crybel bug 2026-06-06).
            if (e.target?.closest?.('[data-allow-edge-touch]')) return;
            // Pre-emptively block touches that START in browser-gesture zones:
            //   - top 60px → pull-to-refresh
            //   - leftmost 25px → iOS Safari swipe-back / Android edge-swipe
            //   - rightmost 25px → swipe-forward / Android edge-swipe
            const w = window.innerWidth;
            if (startY < 60 || startX < 25 || startX > w - 25) {
                if (e.cancelable) e.preventDefault();
            }
        };

        const onTouchMove = (e) => {
            if (!e.touches || e.touches.length === 0) return;
            // Same opt-out as onTouchStart — without it the move handler would
            // still preventDefault the gesture started on the button.
            if (e.target?.closest?.('[data-allow-edge-touch]')) return;
            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;
            const dx = x - startX;
            const dy = y - startY;
            const w = window.innerWidth;
            // Block any downward swipe that started near the top edge (pull-to-refresh).
            if (startY < 80 && dy > 5) {
                if (e.cancelable) e.preventDefault();
                return;
            }
            // Block any horizontal swipe that started near a side edge (swipe-back/forward).
            if ((startX < 30 && dx > 5) || (startX > w - 30 && dx < -5)) {
                if (e.cancelable) e.preventDefault();
                return;
            }
            // Belt-and-suspenders: if window somehow scrolled to top, block any downward drag.
            if (window.scrollY === 0 && dy > 0 && startY < 100) {
                if (e.cancelable) e.preventDefault();
            }
        };

        document.addEventListener('touchstart', onTouchStart, { passive: false });
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        return () => {
            document.removeEventListener('touchstart', onTouchStart);
            document.removeEventListener('touchmove', onTouchMove);
            document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
            document.body.style.overscrollBehavior = prevBodyOverscroll;
            document.documentElement.style.touchAction = prevHtmlTouch;
            document.body.style.touchAction = prevBodyTouch;
        };
    }, []);

    // Back-button / back-gesture trap. On mount we push a sentinel history
    // entry so the FIRST back press during a run fires `popstate` instead of
    // navigating off /game. We re-push immediately and open the existing
    // Pause modal — the player can choose Quit (which awaits saveScore) or
    // Resume. After game-over/victory we let the back press through normally.
    // Texxy/JackM 2026-05-20: accidental back gestures were silently ending runs.
    React.useEffect(() => {
        window.history.pushState({ gameTrap: true }, '');
        const onPopState = () => {
            const engine = engineRef.current;
            // Re-arm the trap for the next back press.
            window.history.pushState({ gameTrap: true }, '');
            // Run finished — don't interfere with normal navigation.
            if (!engine || engine.isGameOver || engine.isVictory) return;
            // Don't interrupt the critical revive prompt (player needs to decide).
            if (showRevivePromptRef.current) return;
            // Already in pause modal — ignore repeat swipes.
            if (isPausedRef.current) return;
            // ALWAYS open pause modal on swipe-back, even if a level-up modal is
            // up. PauseModal is rendered AFTER LevelUpModal in JSX so it stacks
            // on top. When the player resumes, the level-up modal is still in
            // state and remains visible for them to pick (Texxy/JackM bug
            // 2026-05-21 — swipe back during level-up appeared to "summon" the
            // level-up modal because pause was being skipped).
            engine.isPaused = true;
            setIsPaused(true);
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    // External-restart watcher. GameOverModal / VictoryModal navigate to
    // /game with a fresh `_retry` timestamp — detect that here and convert
    // it into a runId bump (which is what the init effect actually listens to).
    React.useEffect(() => {
        const retry = location.state?._retry;
        if (retry && retry !== lastExternalRetryRef.current) {
            lastExternalRetryRef.current = retry;
            runConfigRef.current = location.state;
            setRunId(id => id + 1);
        }
    }, [location.state?._retry]);

    // Refs that mirror level-up / revive state so the popstate listener (which
    // only binds once on mount) can read the LATEST values without re-binding.
    const levelUpChoicesRef = React.useRef(null);
    const showRevivePromptRef = React.useRef(false);
    const isPausedRef = React.useRef(false);
    React.useEffect(() => { levelUpChoicesRef.current = levelUpChoices; }, [levelUpChoices]);
    React.useEffect(() => { showRevivePromptRef.current = showRevivePrompt; }, [showRevivePrompt]);
    React.useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    // Stuck-state watchdog. If the engine ends up paused with NO modal/UI reason
    // to be paused (no level-up, no revive, no pause menu, no game-over/victory,
    // and the tab is visible), force-resume after a short grace period. This is
    // the programmatic equivalent of Texxy's "pause→resume" workaround and
    // catches every soft-lock path regardless of root cause (Thom/Tijckers/
    // Texxy bugs 2026-05-14/15 — regular runs occasionally stuck after a
    // level-up modal dismissed, with no other state visible).
    //
    // 1.5s grace = long enough to never fire during normal animation/transition
    // gaps (modal close → React re-render → engine.isPaused=false is microseconds),
    // short enough that players don't notice the stuck state before it self-heals.
    React.useEffect(() => {
        const interval = setInterval(() => {
            const engine = engineRef.current;
            if (!engine) return;
            if (!engine.isPaused) return;
            if (engine.isGameOver || engine.isVictory) return;
            if (document.hidden) return;
            // Respect every legitimate paused state.
            if (levelUpChoices) return;
            if (showRevivePrompt) return;
            if (isPaused) return;       // PauseModal showing
            if (pending) return;        // OmenXConfirmation showing
            if (isQuitting) return;
            // Engine is paused with no UI reason. Track how long.
            if (!engine._stuckSince) {
                engine._stuckSince = performance.now();
                return;
            }
            const stuckMs = performance.now() - engine._stuckSince;
            if (stuckMs >= 1500) {
                console.warn('[Game] Stuck-pause watchdog: force-resuming engine after', Math.floor(stuckMs), 'ms');
                engine._stuckSince = null;
                engine.lastTime = performance.now();
                engine.isPaused = false;
            }
        }, 500);
        // Clear the tracker any time a legit paused state IS showing — prevents
        // the timer from counting through legitimate pauses.
        const engine = engineRef.current;
        if (engine && (levelUpChoices || showRevivePrompt || isPaused || pending || isQuitting)) {
            engine._stuckSince = null;
        }
        return () => clearInterval(interval);
    }, [levelUpChoices, showRevivePrompt, isPaused, pending, isQuitting]);

    // Keyboard pause hotkeys: Escape or P toggles pause/resume.
    React.useEffect(() => {
        const onKeyDown = (e) => {
            const key = e.key.toLowerCase();
            if (key !== 'escape' && key !== 'p') return;
            const engine = engineRef.current;
            if (!engine || engine.isGameOver || engine.isVictory) return;
            // Don't toggle while a level-up or revive prompt is open.
            if (levelUpChoices || showRevivePrompt) return;
            if (engine.isPaused) {
                handleResume();
            } else {
                handlePause();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [levelUpChoices, showRevivePrompt]);

    return (
        <div className="w-screen h-[100dvh] overflow-hidden bg-black relative select-none" style={{ overscrollBehavior: 'none', overscrollBehaviorY: 'none' }}>
            <canvas 
                ref={canvasRef} 
                className="absolute inset-0"
            />
            
            {!hudHidden && <VirtualJoystick onChange={handleJoystickChange} />}
            
            {isSandbox && <SandboxBanner />}
            {isSandbox && !hudHidden && <SandboxDevPanel engineRef={engineRef} />}
            {!hudHidden && <UIOverlay {...gameState} ddMult={gameState.ddMult ?? 1.0} arenaId={engineRef.current?.arena?.id || location.state?.arenaId || ''} omenxBalance={omenxBalance ?? 0} onPause={handlePause} omenxPurchasesDisabled={omenxPurchasesDisabled} />}
            {!hudHidden && <CharacterAbilityMeter engineRef={engineRef} />}
            {!hudHidden && <SynergyBanner />}
            {!hudHidden && <SessionExpiredBanner />}

            {hudHidden && (
                <HideHudButton onShow={() => setHudHidden(false)} />
            )}

            {/* LevelUpModal renders FIRST so PauseModal stacks on top of it when
                both are active (e.g. player swipes back during a level-up). */}
            {levelUpChoices && !showRevivePrompt && (
                <LevelUpModal level={gameState.level} choices={levelUpChoices} onSelect={handleUpgradeSelect} cosmicTokens={omenxBalance ?? 0} onReroll={handleReroll} onBanish={handleBanish} banishCost={banishCost} banishCount={banishCount} nextBanishCost={nextBanishCost} engineRef={engineRef} omenxPurchasesDisabled={omenxPurchasesDisabled} />
            )}

            {isPaused && !hudHidden && (
                <PauseModal
                    onResume={handleResume}
                    onQuit={handleQuit}
                    onRestart={handleRestart}
                    onHideHud={() => { setHudHidden(true); }}
                    engineRef={engineRef}
                    onBuyXpBuff={handleXpBuff}
                    onSquadUltimate={handleSquadUltimate}
                    omenxBalance={omenxBalance ?? 0}
                    xpBuffExpiry={gameState.xpBuffExpiry || 0}
                    omenxPurchasesDisabled={omenxPurchasesDisabled}
                />
            )}
            
            {showRevivePrompt && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-900 border-2 border-emerald-500 p-6 md:p-8 rounded-xl max-w-md w-full text-center">
                        <h2 className="text-2xl font-bold text-white mb-2 font-mono">CRITICAL DAMAGE</h2>
                        <p className="text-slate-400 mb-2">Operative system failing. Use an Emergency Revive?</p>
                        {/* S8 escalation info — pre-S8 label is 'Flat', so the tier hint stays hidden */}
                        {reviveInfo.label !== 'Flat' && (
                            <p className="text-emerald-300/80 text-xs mb-4 font-mono">
                                Tier: {reviveInfo.label}
                            </p>
                        )}
                        {omenxPurchasesDisabled && (
                            <div className="mb-3 bg-red-950/40 border border-red-700/60 rounded-lg p-2 text-xs text-red-200">
                                OMENX purchases temporarily disabled. Revive isn't available right now.
                            </div>
                        )}
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleRevive}
                                disabled={(omenxBalance ?? 0) < reviveInfo.cost || omenxPurchasesDisabled}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold flex flex-wrap items-center justify-center gap-2 transition-colors"
                            >
                                REVIVE (50% HP) <span className="bg-slate-900 px-2 py-1 rounded text-xs">COST: {reviveInfo.cost} OMENX</span>
                            </button>
                            <button
                                onClick={handleDeclineRevive}
                                className="bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg font-bold border border-slate-700 transition-colors"
                            >
                                ACCEPT FATE
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {gameOverStats && !gameOverStats._suppressModal && (
                <GameOverModal stats={gameOverStats} />
            )}
            
            {victoryStats && (
                <VictoryModal stats={victoryStats} />
            )}
            
            {pending && (
                <OmenXConfirmation
                    amount={pending.amount}
                    itemName={pending.itemName}
                    onConfirm={pending.onConfirm}
                    onCancel={pending.onCancel}
                    pageId="game-run"
                />
            )}

            {isInitializing && <GameLoadingScreen />}

            {isQuitting && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[70]">
                    <div className="flex flex-col items-center gap-3 text-cyan-300">
                        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                        <div className="font-mono font-bold tracking-widest text-sm">SAVING RUN…</div>
                    </div>
                </div>
            )}
        </div>
    );
}