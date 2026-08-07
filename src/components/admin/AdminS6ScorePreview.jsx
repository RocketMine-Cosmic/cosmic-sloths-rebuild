import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { arenaLabel } from '@/lib/arenaLabels';
import moment from 'moment';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

// =============================================================================
// READ-ONLY simulator. Mirrors functions/saveScore.js EXACTLY for both formulas.
// Lets us preview how S5 leaderboard rows would re-rank under the S6 formula
// BEFORE the W20→W21 rollover flips the live formula.
//
// CRITICAL: keep these constants + formulas in sync with saveScore.js. If the
// server formula changes, this preview lies. Annotated with line numbers from
// saveScore.js as of 2026-05-07 (Phase 1 lock).
// =============================================================================

const ARENA_ORDER = ['station', 'asteroid', 'nebula', 'void', 'plasma', 'crystal', 'moon', 'blackhole', 'mothership', 'dimension'];
const SCORE_HARD_CEILING = 2_500_000;

// S5 formula (saveScore.js lines 178-191)
function computeS5Score({ kills, level, time, gold, arenaId, isVictory }) {
    const isEndless = arenaId === 'endless';
    const isRaid = arenaId === 'world_boss_arena';
    const sectorIdx = (isEndless || isRaid) ? 0 : Math.max(0, ARENA_ORDER.indexOf(arenaId));
    const arenaMult = isEndless ? 2.0 : 1.0 + sectorIdx * 0.2;
    const goldScoreCap = kills * 200;
    const goldScoreContribution = Math.min(gold, goldScoreCap) * 1.5;
    const victoryBonus = isVictory ? (15000 + sectorIdx * 16000) : 0;
    const baseScore = kills * 45 + level * level * 15 + time * 5 + goldScoreContribution + victoryBonus;
    return Math.min(SCORE_HARD_CEILING, Math.floor(baseScore * arenaMult));
}

// S6 formula (saveScore.js lines 153-176, Option A)
function computeS6Score({ kills, level, time, arenaId, isVictory }) {
    const isEndless = arenaId === 'endless';
    const isRaid = arenaId === 'world_boss_arena';
    const sectorIdx = (isEndless || isRaid) ? 0 : Math.max(0, ARENA_ORDER.indexOf(arenaId));
    const killsScore = kills * 120;
    const levelScore = level * level * 100;
    const sectorScore = (isEndless || isRaid) ? 0 : sectorIdx * 8000;
    const victoryBonus = (isVictory && !isEndless && !isRaid) ? sectorIdx * 15000 : 0;
    const endlessScore = isEndless ? Math.floor(time / 60) * 10000 : 0;
    const baseScore = killsScore + levelScore + sectorScore + victoryBonus + endlessScore;
    return Math.min(SCORE_HARD_CEILING, Math.floor(baseScore));
}

// RunScore.is_victory isn't stored — infer from kills>=lastSectorBossKill heuristic?
// Actually saveScore.js stores raw runs without victory flag. But for sectors, we
// can infer: if score is non-zero AND sectorIdx is set AND time matches arena duration,
// it was likely a victory. Simpler: assume non-victory for the simulation (slightly
// undercounts S5 score for victories, but that's OK — the relative ranking is what matters).
// We'll leave `isVictory=false` since it's not in the RunScore record. This is a known
// limitation of the simulator and is shown in the UI footer.

const TIER_COLORS = {
    1: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
    2: 'bg-slate-300/20 text-slate-200 border-slate-300/50',
    3: 'bg-amber-700/20 text-amber-400 border-amber-700/50',
};

function RankBadge({ rank }) {
    if (rank === 1) return <span className="text-yellow-400 font-black">🥇</span>;
    if (rank === 2) return <span className="text-slate-200 font-black">🥈</span>;
    if (rank === 3) return <span className="text-amber-400 font-black">🥉</span>;
    return <span className="text-slate-400 font-mono text-xs">#{rank}</span>;
}

function DeltaBadge({ delta }) {
    if (delta === 0) return <span className="inline-flex items-center gap-1 text-slate-500 text-xs"><Minus className="w-3 h-3" /> 0</span>;
    if (delta > 0) {
        // Lower rank number is BETTER, so positive delta (rank went UP) is bad? No —
        // delta = oldRank - newRank. If positive, newRank is lower (better). Green.
        return <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-xs"><TrendingUp className="w-3 h-3" /> +{delta}</span>;
    }
    return <span className="inline-flex items-center gap-1 text-red-400 font-bold text-xs"><TrendingDown className="w-3 h-3" /> {delta}</span>;
}

export default function AdminS6ScorePreview({ walletAddress }) {
    const [period, setPeriod] = useState('weekly');
    const [mode, setMode] = useState('all'); // all | normal | endless

    const { data: rawScores, isLoading } = useQuery({
        queryKey: ['adminScoresS6Preview', walletAddress, period],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', { type: 'scores', period }).then(r => r.data?.scores || []),
        enabled: !!walletAddress,
        staleTime: 60_000,
    });

    // Build the S5 vs S6 comparison set.
    const comparison = useMemo(() => {
        if (!rawScores) return null;
        // Filter by mode
        const filtered = rawScores.filter(s => {
            if (mode === 'endless' && s.arena_id !== 'endless') return false;
            if (mode === 'normal' && s.arena_id === 'endless') return false;
            return true;
        });

        // Dedupe to each player's single best stored S5 score (matches how the
        // live leaderboard displays — one row per wallet). Without this, a single
        // player with 30 submitted runs eats 30 of the 100 visible slots.
        const bestByWallet = new Map();
        for (const s of filtered) {
            const key = (s.wallet_address || s.user_id || s.id || '').toLowerCase();
            if (!key) continue;
            const prev = bestByWallet.get(key);
            if (!prev || (s.score || 0) > (prev.score || 0)) bestByWallet.set(key, s);
        }
        const deduped = Array.from(bestByWallet.values());

        // Compute both scores per row
        const enriched = deduped.map(s => {
            const args = {
                kills: s.kills || 0,
                level: s.level || 1,
                time: s.time_survived || 0,
                gold: 0, // Not stored on RunScore — gold is on PlayerSave aggregate. S5 score uses gold so this slightly undercounts S5; preview footer notes this limitation.
                arenaId: s.arena_id,
                isVictory: false, // Not stored on RunScore — see comment above.
            };
            const s5Score = computeS5Score(args);
            const s6Score = computeS6Score(args);
            // Use the stored s.score for s5 (it's authoritative for what the leaderboard
            // currently shows), only use computed-s5 for sanity-check.
            return { ...s, _s5Stored: s.score || 0, _s5Computed: s5Score, _s6: s6Score };
        });

        // S5 ranking (by stored score — truth)
        const byS5 = [...enriched].sort((a, b) => (b._s5Stored || 0) - (a._s5Stored || 0));
        const s5Rank = new Map();
        byS5.forEach((s, i) => s5Rank.set(s.id, i + 1));

        // S6 ranking
        const byS6 = [...enriched].sort((a, b) => (b._s6 || 0) - (a._s6 || 0));
        const s6Rank = new Map();
        byS6.forEach((s, i) => s6Rank.set(s.id, i + 1));

        // Build final list ordered by S6 with deltas
        const ranked = byS6.slice(0, 100).map(s => ({
            ...s,
            _s5Rank: s5Rank.get(s.id),
            _s6Rank: s6Rank.get(s.id),
            _delta: s5Rank.get(s.id) - s6Rank.get(s.id), // positive = climbed in S6
        }));

        // Aggregate stats
        const totalPlayers = ranked.length;
        const climbers = ranked.filter(r => r._delta > 0);
        const fallers = ranked.filter(r => r._delta < 0);
        const unchanged = ranked.filter(r => r._delta === 0);
        const newTop10 = ranked.slice(0, 10).filter(r => r._s5Rank > 10);
        const droppedFromTop10 = byS5.slice(0, 10).filter(s => s6Rank.get(s.id) > 10);

        // Character distribution in S5 top-10 vs S6 top-10
        const top10ByChar = (list) => {
            const counts = {};
            list.slice(0, 10).forEach(s => {
                const c = s.character_id || 'unknown';
                counts[c] = (counts[c] || 0) + 1;
            });
            return counts;
        };
        const s5CharDist = top10ByChar(byS5);
        const s6CharDist = top10ByChar(byS6);

        // Per-character kills/sec efficiency — the "is this char mechanically
        // dominant or just popular?" check. Aggregates median + max kills/sec
        // across all dedup'd best runs per character (excluding 0-time rows).
        const efficiencyByChar = (() => {
            const buckets = {};
            for (const s of enriched) {
                const t = s.time_survived || 0;
                if (t < 30) continue; // skip very short runs (noise)
                const c = s.character_id || 'unknown';
                const kps = (s.kills || 0) / t;
                if (!buckets[c]) buckets[c] = [];
                buckets[c].push(kps);
            }
            return Object.entries(buckets).map(([char, list]) => {
                list.sort((a, b) => a - b);
                const median = list[Math.floor(list.length / 2)] || 0;
                const max = list[list.length - 1] || 0;
                const avg = list.reduce((s, v) => s + v, 0) / list.length;
                return { char, median, max, avg, runs: list.length };
            }).sort((a, b) => b.median - a.median);
        })();

        // Endless vs sector dominance
        const top10Mode = (list) => {
            const top = list.slice(0, 10);
            return {
                endless: top.filter(s => s.arena_id === 'endless').length,
                sector: top.filter(s => s.arena_id !== 'endless' && s.arena_id !== 'world_boss_arena').length,
                raid: top.filter(s => s.arena_id === 'world_boss_arena').length,
            };
        };
        const s5ModeDist = top10Mode(byS5);
        const s6ModeDist = top10Mode(byS6);

        return {
            ranked, totalPlayers, climbers, fallers, unchanged,
            newTop10, droppedFromTop10,
            s5CharDist, s6CharDist, s5ModeDist, s6ModeDist,
            efficiencyByChar,
            byS5,
        };
    }, [rawScores, mode]);

    if (!walletAddress) return null;

    return (
        <div className="bg-[#0b0416]/80 border border-purple-900/50 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-bold text-purple-300 uppercase tracking-widest">📈 S6 Score Preview</h2>
                <span className="text-[10px] font-bold bg-purple-500/20 text-purple-200 border border-purple-500/40 px-2 py-0.5 rounded uppercase tracking-wider">Read-only · No writes</span>

                <div className="flex gap-1 ml-auto">
                    {[
                        { id: 'all', label: 'All' },
                        { id: 'normal', label: 'Sectors' },
                        { id: 'endless', label: 'Endless' },
                    ].map(m => (
                        <button key={m.id} onClick={() => setMode(m.id)}
                            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${mode === m.id ? 'bg-fuchsia-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                            {m.label}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1">
                    {['weekly', 'seasonal', 'all'].map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${period === p ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Caveat banner */}
            <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg px-3 py-2 text-[11px] text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                    <span className="font-bold">Simulation caveat:</span> RunScore rows don&apos;t store run-time gold or victory flag. The S5 stored score (left column) is authoritative; the S6 column estimates assume <span className="font-mono">isVictory=false</span> &amp; <span className="font-mono">gold=0</span> contribution. Sector victories will get a bigger S6 boost in production than shown here. Use this for shape-of-distribution, not exact final scores.
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-purple-500"></div></div>
            ) : !comparison || comparison.totalPlayers === 0 ? (
                <div className="text-center text-slate-400 py-8">No scores in this period yet.</div>
            ) : (
                <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="bg-slate-900/60 rounded-lg border border-slate-700 p-3">
                            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1">Total Runs</div>
                            <div className="text-xl font-black text-white">{comparison.totalPlayers}</div>
                        </div>
                        <div className="bg-emerald-950/40 rounded-lg border border-emerald-800/50 p-3">
                            <div className="text-[9px] uppercase tracking-widest text-emerald-400 font-bold mb-1">Climbers</div>
                            <div className="text-xl font-black text-emerald-300">{comparison.climbers.length}</div>
                            <div className="text-[10px] text-emerald-500/70 mt-0.5">rank improved</div>
                        </div>
                        <div className="bg-red-950/40 rounded-lg border border-red-800/50 p-3">
                            <div className="text-[9px] uppercase tracking-widest text-red-400 font-bold mb-1">Fallers</div>
                            <div className="text-xl font-black text-red-300">{comparison.fallers.length}</div>
                            <div className="text-[10px] text-red-500/70 mt-0.5">rank dropped</div>
                        </div>
                        <div className="bg-slate-900/60 rounded-lg border border-slate-700 p-3">
                            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1">Unchanged</div>
                            <div className="text-xl font-black text-slate-300">{comparison.unchanged.length}</div>
                        </div>
                    </div>

                    {/* Top 10 mode mix */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-slate-900/60 rounded-lg border border-slate-700 p-3">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Top 10 — Mode Mix</div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div>
                                    <div className="text-[9px] text-slate-500 mb-0.5">Endless</div>
                                    <div className="text-xs font-mono text-slate-400">S5: <span className="text-fuchsia-300 font-bold">{comparison.s5ModeDist.endless}</span></div>
                                    <div className="text-xs font-mono text-slate-400">S6: <span className="text-purple-300 font-bold">{comparison.s6ModeDist.endless}</span></div>
                                </div>
                                <div>
                                    <div className="text-[9px] text-slate-500 mb-0.5">Sectors</div>
                                    <div className="text-xs font-mono text-slate-400">S5: <span className="text-fuchsia-300 font-bold">{comparison.s5ModeDist.sector}</span></div>
                                    <div className="text-xs font-mono text-slate-400">S6: <span className="text-purple-300 font-bold">{comparison.s6ModeDist.sector}</span></div>
                                </div>
                                <div>
                                    <div className="text-[9px] text-slate-500 mb-0.5">Raid</div>
                                    <div className="text-xs font-mono text-slate-400">S5: <span className="text-fuchsia-300 font-bold">{comparison.s5ModeDist.raid}</span></div>
                                    <div className="text-xs font-mono text-slate-400">S6: <span className="text-purple-300 font-bold">{comparison.s6ModeDist.raid}</span></div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-900/60 rounded-lg border border-slate-700 p-3">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Top 10 — Character Mix</div>
                            <div className="space-y-1 text-xs">
                                {(() => {
                                    const allChars = new Set([...Object.keys(comparison.s5CharDist), ...Object.keys(comparison.s6CharDist)]);
                                    const rows = Array.from(allChars).map(c => ({
                                        char: c,
                                        s5: comparison.s5CharDist[c] || 0,
                                        s6: comparison.s6CharDist[c] || 0,
                                    })).sort((a, b) => (b.s5 + b.s6) - (a.s5 + a.s6));
                                    if (rows.length === 0) return <div className="text-slate-500 text-xs">No data</div>;
                                    return rows.map(r => (
                                        <div key={r.char} className="flex items-center justify-between">
                                            <span className="text-slate-400 capitalize">{r.char}</span>
                                            <span className="font-mono text-[11px]">
                                                <span className="text-fuchsia-300">{r.s5}</span>
                                                <span className="text-slate-600 mx-1">→</span>
                                                <span className={r.s6 > r.s5 ? 'text-emerald-400 font-bold' : r.s6 < r.s5 ? 'text-red-400 font-bold' : 'text-purple-300'}>{r.s6}</span>
                                            </span>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Per-character mechanical efficiency — "is this char dominant or just popular?" */}
                    {comparison.efficiencyByChar.length > 0 && (
                        <div className="bg-slate-900/60 rounded-lg border border-slate-700 p-3">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center justify-between">
                                <span>⚡ Kills/sec Efficiency by Character</span>
                                <span className="text-slate-600 normal-case tracking-normal">Higher = mechanically stronger · &lt;30s runs excluded</span>
                            </div>
                            <table className="w-full text-xs">
                                <thead className="text-slate-500 border-b border-slate-800">
                                    <tr>
                                        <th className="text-left p-1.5 font-bold">Character</th>
                                        <th className="text-right p-1.5 font-bold">Runs</th>
                                        <th className="text-right p-1.5 font-bold">Median k/s</th>
                                        <th className="text-right p-1.5 font-bold">Avg k/s</th>
                                        <th className="text-right p-1.5 font-bold">Max k/s</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {comparison.efficiencyByChar.map((e, i) => (
                                        <tr key={e.char} className={i === 0 ? 'bg-emerald-950/20' : ''}>
                                            <td className="p-1.5 capitalize text-slate-300 font-bold">
                                                {i === 0 && <span className="text-emerald-400 mr-1">⚡</span>}
                                                {e.char}
                                            </td>
                                            <td className="p-1.5 text-right font-mono text-slate-500">{e.runs}</td>
                                            <td className="p-1.5 text-right font-mono text-purple-300 font-bold">{e.median.toFixed(2)}</td>
                                            <td className="p-1.5 text-right font-mono text-slate-400">{e.avg.toFixed(2)}</td>
                                            <td className="p-1.5 text-right font-mono text-slate-400">{e.max.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="text-[10px] text-slate-500 italic mt-2">
                                If SynthBeats and Codebreaker have similar median k/s, SynthBeats just looks dominant because more people play it. If SynthBeats k/s is significantly higher, the character itself is over-tuned.
                            </div>
                        </div>
                    )}

                    {/* New top 10 entrants + dropouts */}
                    {(comparison.newTop10.length > 0 || comparison.droppedFromTop10.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {comparison.newTop10.length > 0 && (
                                <div className="bg-emerald-950/30 rounded-lg border border-emerald-800/50 p-3">
                                    <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-2 flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" /> New top 10 entries
                                    </div>
                                    <div className="space-y-1 text-xs">
                                        {comparison.newTop10.map(r => (
                                            <div key={r.id} className="flex justify-between gap-2">
                                                <span className="text-emerald-200 font-bold truncate">{r.player_name || '-'}</span>
                                                <span className="font-mono text-emerald-300 shrink-0">#{r._s5Rank} → #{r._s6Rank}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {comparison.droppedFromTop10.length > 0 && (
                                <div className="bg-red-950/30 rounded-lg border border-red-800/50 p-3">
                                    <div className="text-[10px] uppercase tracking-widest text-red-400 font-bold mb-2 flex items-center gap-1">
                                        <TrendingDown className="w-3 h-3" /> Dropped out of top 10
                                    </div>
                                    <div className="space-y-1 text-xs">
                                        {comparison.droppedFromTop10.map(r => (
                                            <div key={r.id} className="flex justify-between gap-2">
                                                <span className="text-red-200 font-bold truncate">{r.player_name || '-'}</span>
                                                <span className="font-mono text-red-300 shrink-0">#{comparison.byS5.findIndex(s => s.id === r.id) + 1} → out</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Detailed table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                                <tr>
                                    <th className="p-2 text-center">S6 Rank</th>
                                    <th className="p-2">Player</th>
                                    <th className="p-2">Char</th>
                                    <th className="p-2">Arena</th>
                                    <th className="p-2 text-right">Kills</th>
                                    <th className="p-2 text-right">Lvl</th>
                                    <th className="p-2 text-right">Time</th>
                                    <th className="p-2 text-right">k/s</th>
                                    <th className="p-2 text-right text-fuchsia-300">S5 Score</th>
                                    <th className="p-2 text-right text-purple-300">S6 Score</th>
                                    <th className="p-2 text-center">Δ Rank</th>
                                </tr>
                            </thead>
                            {/* k/s column inserted after Time */}
                            <tbody className="divide-y divide-slate-800/50">
                                {comparison.ranked.map(r => (
                                    <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="p-2 text-center"><RankBadge rank={r._s6Rank} /></td>
                                        <td className="p-2 font-bold text-white max-w-[140px] truncate" title={r.player_name}>
                                            {r.pilot_icon && r.pilot_icon.length <= 4 && !r.pilot_icon.startsWith('http') ? `${r.pilot_icon} ` : ''}
                                            {r.player_name || '-'}
                                        </td>
                                        <td className="p-2 text-slate-400 capitalize text-[11px]">{r.character_id || '-'}</td>
                                        <td className="p-2 text-slate-400 text-[11px]" title={r.arena_id}>{arenaLabel(r.arena_id)}</td>
                                        <td className="p-2 text-right font-mono text-slate-300">{r.kills || 0}</td>
                                        <td className="p-2 text-right font-mono text-slate-300">{r.level || 1}</td>
                                        <td className="p-2 text-right font-mono text-slate-300">{Math.floor((r.time_survived || 0) / 60)}:{String((r.time_survived || 0) % 60).padStart(2, '0')}</td>
                                        <td className="p-2 text-right font-mono text-cyan-300">{((r.time_survived || 0) > 0 ? ((r.kills || 0) / r.time_survived) : 0).toFixed(2)}</td>
                                        <td className="p-2 text-right font-mono text-fuchsia-300">{(r._s5Stored || 0).toLocaleString()}</td>
                                        <td className="p-2 text-right font-mono font-bold text-purple-300">{(r._s6 || 0).toLocaleString()}</td>
                                        <td className="p-2 text-center"><DeltaBadge delta={r._delta} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="text-[10px] text-slate-500 italic">
                        Showing top {comparison.ranked.length} by S6 score · Period: {period} · Mode: {mode}
                    </div>
                </>
            )}
        </div>
    );
}