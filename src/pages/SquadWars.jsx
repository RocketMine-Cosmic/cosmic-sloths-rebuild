import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Swords, Trophy, Skull, ArrowLeft, Crown, Shield, Coins, Puzzle, Flame, Users, Award } from 'lucide-react';
import { SoundManager } from '../game/SoundManager';
import { SaveManager } from '../game/SaveManager';
import { useToast } from '@/components/ui/use-toast';
import { useOmenXUser } from '@/hooks/useOmenXUser';
import SpaceBackground from '../components/game/SpaceBackground';
import OmenXGate from '../components/game/OmenXGate';
import CurrencyHeader from '../components/game/CurrencyHeader';
import WarHeadToHead from '../components/squadwars/WarHeadToHead';
import WarHistoryRow from '../components/squadwars/WarHistoryRow';
import RaidLeaderboardRow from '../components/squadwars/RaidLeaderboardRow';
import ChampionsPanel from '../components/squadwars/ChampionsPanel';
import MemberContributionsPanel from '../components/squadwars/MemberContributionsPanel';
import { isS6OrLater } from '@/lib/seasonGate';

export default function SquadWars({ isCarousel }) {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user: omenxUser } = useOmenXUser();

    const [activeTab, setActiveTab] = useState('myWar'); // 'myWar' | 'roster' | 'champions' | 'raid' | 'history'
    const [mySquadId, setMySquadId] = useState(null);
    const [squadCheckDone, setSquadCheckDone] = useState(false); // gate loadData until membership lookup completes
    const [myWar, setMyWar] = useState(null);
    const [weekId, setWeekId] = useState('');
    const [roster, setRoster] = useState([]);
    const [history, setHistory] = useState([]);
    const [raidRanking, setRaidRanking] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [claiming, setClaiming] = useState(false);

    // Load my squad membership — omenxUser may use walletAddress (camelCase) or wallet_address
    useEffect(() => {
        const rawWallet = omenxUser?.wallet_address || omenxUser?.walletAddress || omenxUser?.data?.wallet_address || '';
        if (!rawWallet) {
            setSquadCheckDone(true); // no wallet = no squad, allow loadData to run
            return;
        }
        (async () => {
            try {
                const wallet = rawWallet.toLowerCase();
                let members = await base44.entities.SquadMember.filter({ wallet_address: wallet });
                if (members.length === 0 && wallet !== rawWallet) {
                    members = await base44.entities.SquadMember.filter({ wallet_address: rawWallet });
                }
                console.log('[SquadWars] wallet lookup:', wallet, '→', members.length, 'memberships');
                if (members.length > 0) setMySquadId(members[0].squad_id);
            } catch (e) {
                console.error('[SquadWars] Failed to load membership:', e);
            } finally {
                setSquadCheckDone(true);
            }
        })();
    }, [omenxUser]);

    // Retry helper — Base44 throttles bursts of function calls during peak (429s).
    // When that happens, the whole page goes blank because every tab depends on
    // these fetches. Retry transient 429/5xx with backoff so the page recovers.
    const invokeWithRetry = useCallback(async (name, body) => {
        const delays = [400, 900, 1800];
        let lastErr;
        for (let attempt = 0; attempt <= delays.length; attempt++) {
            try {
                const r = await base44.functions.invoke(name, body);
                return r.data;
            } catch (err) {
                lastErr = err;
                const status = err?.response?.status || err?.status;
                const msg = String(err?.message || '').toLowerCase();
                const isTransient = status === 429 || status === 502 || status === 503 || status === 504 || msg.includes('rate limit');
                if (!isTransient || attempt === delays.length) throw err;
                await new Promise(r => setTimeout(r, delays[attempt]));
            }
        }
        throw lastErr;
    }, []);

    // Track when we last fetched + which tabs we've already loaded — avoids
    // re-firing the same expensive backend calls on every focus / visibility flip.
    const lastFetchRef = useRef(0);
    const historyLoadedRef = useRef(false);
    const raidLoadedRef = useRef(false);

    const loadData = useCallback(async ({ force = false, includeHistory = false, includeRaid = false } = {}) => {
        // Coalesce — if we fetched within the last 30s and this isn't a forced
        // refetch (e.g. new-week subscription event), skip. Prevents the page
        // from spamming the platform when focus / visibility flip in quick
        // succession or when the SquadWar subscription fires a burst of events.
        const now = Date.now();
        if (!force && now - lastFetchRef.current < 30_000) return;
        lastFetchRef.current = now;

        setLoading(true);
        setLoadError(null);
        try {
            // Roster is always loaded — it's the "Wars Board" + drives weekId.
            // Raid + History are lazy: only fetched on first tab-open OR when forced.
            const calls = [invokeWithRetry('squadWarEngine', { action: 'getRoster' })];
            const shouldLoadRaid = includeRaid || raidLoadedRef.current;
            const shouldLoadHistory = mySquadId && (includeHistory || historyLoadedRef.current);
            if (shouldLoadRaid) {
                calls.push(invokeWithRetry('getSquadRaidLeaderboard', {}));
            } else {
                calls.push(Promise.resolve(null));
            }
            if (mySquadId) {
                calls.push(invokeWithRetry('squadWarEngine', { action: 'getCurrent', squadId: mySquadId }));
                if (shouldLoadHistory) {
                    calls.push(invokeWithRetry('squadWarEngine', { action: 'getHistory', squadId: mySquadId, limit: 12 }));
                }
            }
            // Use allSettled so a single failure (e.g. one rate-limited call) doesn't
            // wipe the other tabs' data. Each result is handled independently.
            const results = await Promise.allSettled(calls);
            const ok = (i) => results[i] && results[i].status === 'fulfilled' ? results[i].value : null;
            const fail = (i) => results[i] && results[i].status === 'rejected' ? results[i].reason : null;

            const rosterRes = ok(0);
            const raidRes = ok(1);
            if (rosterRes) {
                setRoster(rosterRes.wars || []);
                setWeekId(rosterRes.weekId || '');
            }
            if (raidRes) {
                setRaidRanking(raidRes.ranking || []);
                raidLoadedRef.current = true;
            }
            if (mySquadId) {
                const curRes = ok(2);
                const histRes = ok(3);
                if (curRes) setMyWar(curRes.war || null);
                if (histRes) {
                    setHistory(histRes.wars || []);
                    historyLoadedRef.current = true;
                }
            }

            // If the critical getRoster call failed, show an error banner so players
            // know to retry instead of staring at empty tabs.
            const rosterErr = fail(0);
            if (rosterErr) {
                const status = rosterErr?.response?.status || rosterErr?.status;
                const isRateLimit = status === 429 || /rate limit/i.test(rosterErr?.message || '');
                setLoadError(isRateLimit
                    ? 'Server is busy right now. Tap "Retry" in a few seconds.'
                    : 'Couldn\'t load Squad Wars. Tap "Retry" to try again.');
                console.error('[SquadWars] getRoster failed:', rosterErr?.message);
            }
        } catch (e) {
            console.error('[SquadWars] Load failed:', e);
            setLoadError('Couldn\'t load Squad Wars. Tap "Retry" to try again.');
        }
        setLoading(false);
    }, [mySquadId, invokeWithRetry]);

    // Initial load — wait for the squad membership check to finish, force the
    // first fetch (bypasses the 30s coalesce gate), and skip cancelled.
    useEffect(() => { if (squadCheckDone) loadData({ force: true }); }, [squadCheckDone, loadData]);

    // Lazy-load Raid + History the first time their tabs are opened. Subsequent
    // tab switches reuse the cached data + the existing refetch path keeps them
    // fresh. This was previously eager-loaded on every page open = 4 backend
    // calls when most users only look at one tab.
    useEffect(() => {
        if (activeTab === 'raid' && !raidLoadedRef.current) loadData({ force: true, includeRaid: true });
        if (activeTab === 'history' && !historyLoadedRef.current && mySquadId) loadData({ force: true, includeHistory: true });
    }, [activeTab, mySquadId, loadData]);

    // Real-time updates: subscribe to SquadWar changes.
    // Same-week events patch local state in place (free). NEW-week events used to
    // fire an instant full refetch — but the Monday pairing run creates ~10 wars
    // in quick succession, which fan-out to ~10× loadData() on every open client
    // and was a top contributor to the platform 429 storm. Debounce the refetch
    // so the burst collapses into one refresh.
    const newWeekTimerRef = useRef(null);
    useEffect(() => {
        const unsub = base44.entities.SquadWar.subscribe((event) => {
            if (event.type !== 'update' && event.type !== 'create') return;
            if (!event.data) return;
            const eventWeek = event.data.week_id;
            // A war for a NEW week appeared → our data is stale, schedule a refetch
            // ~3s out so a burst of creates collapses into one call.
            if (eventWeek && weekId && eventWeek > weekId) {
                if (newWeekTimerRef.current) return; // already scheduled
                newWeekTimerRef.current = setTimeout(() => {
                    newWeekTimerRef.current = null;
                    loadData({ force: true });
                }, 3000);
                return;
            }
            // Same-week update: patch state in place (cheap, no backend call).
            if (eventWeek === weekId) {
                setRoster(prev => {
                    const idx = prev.findIndex(w => w.id === event.data.id);
                    if (idx >= 0) {
                        const next = [...prev];
                        next[idx] = event.data;
                        return next;
                    }
                    return [event.data, ...prev];
                });
                if (mySquadId && (event.data.squad_a_id === mySquadId || event.data.squad_b_id === mySquadId)) {
                    setMyWar(event.data);
                }
            }
        });
        return () => {
            unsub();
            if (newWeekTimerRef.current) { clearTimeout(newWeekTimerRef.current); newWeekTimerRef.current = null; }
        };
    }, [mySquadId, weekId, loadData]);

    // Auto-refresh on tab return — visibilitychange alone is enough (window focus
    // fires alongside it on tab switch, so listening to both was doubling calls).
    // loadData() self-coalesces via the 30s gate, so this is safe to fire freely.
    useEffect(() => {
        const onVisibility = () => { if (!document.hidden) loadData(); };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [loadData]);

    const handleClaimWinBonus = async (warId) => {
        if (claiming) return;
        setClaiming(true);
        try {
            SoundManager.playLevelUp();
            const res = await base44.functions.invoke('squadWarEngine', { action: 'claimWinBonus', warId });
            if (!res.data?.success) {
                toast({ title: 'Error', description: res.data?.error || 'Failed to claim.' });
                return;
            }
            // Apply server save to local
            const currentSave = SaveManager.load();
            if (res.data.saveData?.gold !== undefined) currentSave.gold = res.data.saveData.gold;
            if (res.data.saveData?.relicFragments !== undefined) currentSave.relicFragments = res.data.saveData.relicFragments;
            SaveManager.save(currentSave);

            const r = res.data.reward;
            const titleByLabel = { win: '🏆 War Victory!', tie: '🤝 War Tie Bonus', loss: '🛡️ Consolation Reward' };
            toast({
                title: titleByLabel[r.label] || 'War Bonus',
                description: `+${r.gold.toLocaleString()} Gold${r.fragments > 0 ? ` and +${r.fragments} Relic Fragments` : ''}!`,
            });
            // Refresh history so the claim button disappears
            await loadData({ force: true, includeHistory: true });
        } catch (e) {
            console.error(e);
            toast({ title: 'Error', description: 'Failed to claim war bonus.' });
        } finally {
            setClaiming(false);
        }
    };

    return (
        <OmenXGate isCarousel={isCarousel}>
        <div className={`${isCarousel ? 'h-full flex flex-col' : 'min-h-screen'} relative text-slate-200 p-2 pb-20 md:p-6 font-sans`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col min-h-0">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 mb-4 border-b border-slate-800 pb-2 md:pb-4 shrink-0">
                    <div>
                        {!isCarousel && (
                            <div className="mb-2 flex items-center gap-2 flex-wrap">
                                <button onClick={() => { SoundManager.playUIClick(); navigate('/squads'); }}
                                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors font-bold text-xs bg-slate-900 px-2 py-1 rounded border border-slate-700 w-fit">
                                    <ArrowLeft className="w-3 h-3" /> Back to Squads
                                </button>
                                <button onClick={() => { SoundManager.playUIClick(); navigate('/'); }}
                                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors font-bold text-xs bg-slate-900 px-2 py-1 rounded border border-slate-700 w-fit">
                                    <ArrowLeft className="w-3 h-3" /> Main Menu
                                </button>
                            </div>
                        )}
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-2"
                            style={{ background: 'linear-gradient(90deg, #EF4444, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.5))' }}>
                            <Swords className="w-6 h-6 md:w-8 md:h-8 text-red-400" /> SQUAD WARS
                        </h1>
                        <p className="text-slate-400 mt-0.5 text-xs md:text-sm tracking-widest uppercase">
                            Weekly head-to-head. Outkill your rival squad.
                        </p>
                        {weekId && <div className="text-[10px] text-slate-500 font-mono mt-1">Week: {weekId}</div>}
                        <div className="text-[10px] md:text-xs text-amber-300/80 mt-1 font-bold">
                            ⚠ Endless Void kills do NOT count toward Squad Wars — play sectors to earn war kills.
                        </div>
                        <div className="text-[10px] md:text-xs text-amber-300/80 font-bold">
                            ⚠ Minimum of 2 players required for eligibility.
                        </div>
                        <button onClick={() => { SoundManager.playUIClick(); navigate('/war-archive'); }}
                            className="mt-2 inline-flex items-center gap-1.5 text-[10px] md:text-xs font-bold text-amber-300 hover:text-amber-200 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-600/40 px-2 py-1 rounded transition-colors">
                            <Crown className="w-3 h-3" /> View full War Archive →
                        </button>
                    </div>
                    <CurrencyHeader />
                </header>

                {/* Tabs — icon-only on mobile (label below), full label on md+ */}
                <div className="grid grid-cols-5 gap-1 md:gap-1.5 mb-4 shrink-0">
                    {[
                        { id: 'myWar', label: 'My War', icon: Swords },
                        { id: 'roster', label: 'Board', longLabel: 'Wars Board', icon: Trophy },
                        { id: 'champions', label: 'Champs', longLabel: 'Champions', icon: Award },
                        { id: 'raid', label: 'Raid', longLabel: 'Raid Damage', icon: Flame },
                        { id: 'history', label: 'History', icon: Crown },
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button key={tab.id}
                                onClick={() => { SoundManager.playUIClick(); setActiveTab(tab.id); }}
                                className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1.5 px-1 md:px-3 py-1.5 md:py-2 rounded-lg font-bold text-[10px] md:text-sm transition-all min-w-0 ${
                                    isActive ? 'bg-red-600/30 border border-red-400 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                                             : 'bg-slate-900/60 border border-slate-700 text-slate-400 hover:text-white'
                                }`}>
                                <Icon className="w-4 h-4 md:w-3.5 md:h-3.5 shrink-0" />
                                <span className="md:hidden leading-none">{tab.label}</span>
                                <span className="truncate hidden md:inline">{tab.longLabel || tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {loadError && !loading && (
                    <div className="mb-3 bg-amber-950/50 border border-amber-600/60 rounded-lg p-3 flex items-center justify-between gap-3">
                        <div className="text-xs text-amber-200 flex-1">⚠ {loadError}</div>
                        <button onClick={() => { SoundManager.playUIClick(); loadData({ force: true, includeRaid: raidLoadedRef.current, includeHistory: historyLoadedRef.current }); }}
                            className="text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded transition-colors shrink-0">
                            Retry
                        </button>
                    </div>
                )}

                <div className="flex-1 bg-[#0b0416]/60 backdrop-blur-xl rounded-xl border border-red-500/30 p-3 md:p-5 shadow-[0_0_30px_rgba(239,68,68,0.12)] overflow-y-auto min-h-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>
                            {activeTab === 'myWar' && (
                                !mySquadId ? (
                                    <div className="text-center py-16 text-slate-400">
                                        <Shield className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                                        <div className="text-lg font-bold text-white mb-1">Join a Squad to Fight</div>
                                        <p className="text-sm">Squad Wars are 5v5 (max). Join or create a squad to enter weekly wars.</p>
                                    </div>
                                ) : myWar ? (
                                    <>
                                        <WarHeadToHead war={myWar} mySquadId={mySquadId} onClaim={handleClaimWinBonus} claiming={claiming} />
                                        {isS6OrLater() && (
                                            <MemberContributionsPanel
                                                squadId={mySquadId}
                                                myWalletLower={(omenxUser?.wallet_address || omenxUser?.walletAddress || '').toLowerCase()}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <div className="text-center py-16 text-slate-400">
                                        <Swords className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                                        <div className="text-lg font-bold text-white mb-1">No War This Week</div>
                                        <p className="text-sm">Squads are paired every Monday at 00:05 UTC. Check back soon!</p>
                                        <p className="text-xs text-amber-300/80 mt-3 font-bold">⚠ Minimum of 2 players required for eligibility.</p>
                                    </div>
                                )
                            )}

                            {activeTab === 'roster' && (
                                <div className="space-y-2">
                                    <div className="text-xs text-slate-500 mb-2 uppercase tracking-widest">All wars this week — sorted by total kills</div>
                                    {roster.length === 0 ? (
                                        <div className="text-center text-slate-500 py-12">No wars yet — pairings happen every Monday.</div>
                                    ) : roster.map(war => (
                                        <WarHeadToHead key={war.id} war={war} mySquadId={mySquadId} compact />
                                    ))}
                                </div>
                            )}

                            {activeTab === 'champions' && (
                                <ChampionsPanel mySquadId={mySquadId} />
                            )}

                            {activeTab === 'raid' && (
                                <div>
                                    <div className="bg-rose-950/30 border border-rose-700/40 rounded-lg p-3 mb-3 text-xs text-rose-200">
                                        🔥 Top squads by total damage to this week's <strong>Galactic Raid Boss</strong>. Coordinate your squad's attacks!
                                    </div>
                                    {raidRanking.length === 0 ? (
                                        <div className="text-center text-slate-500 py-12">No squad damage logged yet this week.</div>
                                    ) : (
                                        <div className="space-y-2">
                                            {raidRanking.map((s, i) => (
                                                <RaidLeaderboardRow key={s.squad_id} entry={s} rank={i + 1} isMine={s.squad_id === mySquadId} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'history' && (
                                !mySquadId ? (
                                    <div className="text-center py-16 text-slate-400">Join a squad to see war history.</div>
                                ) : history.length === 0 ? (
                                    <div className="text-center py-16 text-slate-500">No war history yet.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {history.map(w => (
                                            <WarHistoryRow key={w.id} war={w} mySquadId={mySquadId} onClaim={handleClaimWinBonus} claiming={claiming} myWalletLower={(omenxUser?.wallet_address || '').toLowerCase()} />
                                        ))}
                                    </div>
                                )
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
        </OmenXGate>
    );
}