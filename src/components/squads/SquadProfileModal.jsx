import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Crown, Users, Swords, Trophy, Skull, Flame, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getSquadLevel, getNextSquadLevel, getSquadXpProgress } from '../../game/SquadLevels';
import { sanitizePilotName } from '@/lib/sanitizePilotName';

// Module-level cache shared across all SquadProfileModal instances.
// Re-opening the same squad within CACHE_TTL_MS skips the backend call entirely,
// which is what was causing rate-limit storms when players rapidly clicked
// between squad cards in the browser. In-flight requests are deduped via the
// pending map so simultaneous opens of the same squad share one network call.
const CACHE_TTL_MS = 30_000;
const profileCache = new Map(); // squadId -> { data, expires }
const pendingFetches = new Map(); // squadId -> Promise

async function fetchSquadProfile(squadId) {
    const cached = profileCache.get(squadId);
    if (cached && cached.expires > Date.now()) return cached.data;
    if (pendingFetches.has(squadId)) return pendingFetches.get(squadId);

    const p = (async () => {
        // Up to 3 attempts with backoff for transient 429s — invisible to the user.
        let lastErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await base44.functions.invoke('getSquadProfile', { squadId });
                if (res.data?.success) {
                    profileCache.set(squadId, { data: res.data, expires: Date.now() + CACHE_TTL_MS });
                    return res.data;
                }
                throw new Error(res.data?.error || 'Failed to load squad profile.');
            } catch (e) {
                lastErr = e;
                const status = e?.response?.status;
                // Only retry on transient errors (rate limit, 5xx). Other errors fail fast.
                if (status !== 429 && (!status || status < 500)) break;
                await new Promise(r => setTimeout(r, 400 * (attempt + 1) + Math.random() * 200));
            }
        }
        throw lastErr || new Error('Failed to load squad profile.');
    })();

    pendingFetches.set(squadId, p);
    try { return await p; } finally { pendingFetches.delete(squadId); }
}

// Read-only profile card for any squad. Opens from the squad browser
// (scouting before joining) and from the members tab (own squad view).
export default function SquadProfileModal({ squadId, onClose, onJoin, onRequestJoin, canJoin, isFull, hideJoin }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!squadId) return;
        let cancelled = false;
        (async () => {
            // Show cached data instantly; only show spinner on fresh loads.
            const cached = profileCache.get(squadId);
            if (cached && cached.expires > Date.now()) {
                setData(cached.data);
                setLoading(false);
                return;
            }
            setLoading(true);
            setError('');
            try {
                const result = await fetchSquadProfile(squadId);
                if (!cancelled) setData(result);
            } catch (e) {
                if (!cancelled) {
                    const serverMsg = e?.response?.data?.error;
                    setError(serverMsg || e?.message || 'Failed to load squad profile.');
                }
            }
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [squadId]);

    const squad = data?.squad;
    const lvlData = squad ? getSquadLevel(squad.xp || 0) : null;
    const nextLvl = squad ? getNextSquadLevel(squad.xp || 0) : null;
    const xpProgress = squad ? getSquadXpProgress(squad.xp || 0) : 0;

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-3 md:p-6"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                    onClick={e => e.stopPropagation()}
                    className="bg-[#0b0416]/95 border-2 border-orange-500/60 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-[0_0_60px_rgba(249,115,22,0.3)]"
                    style={lvlData ? { borderColor: lvlData.borderColor, boxShadow: `0 0 60px ${lvlData.glowColor}` } : {}}
                >
                    {/* Header */}
                    <div className="flex justify-between items-start p-4 border-b border-slate-800 shrink-0">
                        <div className="text-xs font-black tracking-widest uppercase text-slate-400">Squad Profile</div>
                        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-12 px-6 text-red-400">
                            <div className="text-sm">{error}</div>
                        </div>
                    )}

                    {!loading && !error && squad && (
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
                            {/* Squad identity */}
                            <div className="flex items-start gap-4">
                                <div className="text-4xl md:text-5xl shrink-0 w-16 h-16 inline-flex items-center justify-center overflow-hidden rounded-xl border-2"
                                    style={{ borderColor: lvlData.borderColor, background: lvlData.glowColor }}>
                                    {(squad.icon || lvlData.badge).startsWith('http')
                                        ? <img src={squad.icon} className="w-full h-full object-cover" alt="squad" />
                                        : (squad.icon || lvlData.badge)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-xl md:text-2xl font-black text-white truncate">{squad.name}</h2>
                                        <span className="px-1.5 py-0.5 rounded text-xs border bg-slate-900/60"
                                            style={{ color: lvlData.borderColor, borderColor: lvlData.borderColor + '60' }}>
                                            [{squad.tag}]
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className="text-xs font-bold px-2 py-0.5 rounded"
                                            style={{ color: lvlData.borderColor, background: lvlData.glowColor }}>
                                            Lv.{lvlData.level} {lvlData.name}
                                        </span>
                                        <span className="text-xs text-slate-400 flex items-center gap-1">
                                            <Users className="w-3 h-3" /> {data.members.length}/5
                                        </span>
                                    </div>
                                    {squad.description && (
                                        <p className="text-sm text-slate-400 mt-2 italic">"{squad.description}"</p>
                                    )}
                                </div>
                            </div>

                            {/* XP Bar */}
                            <div>
                                <div className="flex justify-between text-xs font-bold mb-1">
                                    <span style={{ color: lvlData.borderColor }}>Squad XP</span>
                                    {nextLvl
                                        ? <span className="text-slate-400">{(squad.xp || 0).toLocaleString()} / {nextLvl.xpRequired.toLocaleString()}</span>
                                        : <span className="text-yellow-400">MAX LEVEL</span>}
                                </div>
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                                    <div className="h-full transition-all duration-700 rounded-full"
                                        style={{ width: `${xpProgress}%`, background: `linear-gradient(to right, ${lvlData.borderColor}99, ${lvlData.borderColor})` }} />
                                </div>
                            </div>

                            {/* War record + activity */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <StatCard icon={Trophy} color="text-amber-400" label="War Wins" value={squad.war_wins} />
                                <StatCard icon={Skull} color="text-red-400" label="Losses" value={squad.war_losses} />
                                <StatCard icon={Swords} color="text-cyan-400" label="Ties" value={squad.war_ties} />
                                <StatCard icon={Flame} color="text-orange-400" label="Win Streak" value={squad.war_streak} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <StatCard icon={Zap} color="text-yellow-400" label="Weekly Kills" value={(squad.weekly_kills || 0).toLocaleString()} />
                                <StatCard icon={Zap} color="text-cyan-300" label="Today's Kills" value={(squad.daily_kills || 0).toLocaleString()} />
                            </div>

                            {/* Member roster with stats */}
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-orange-400 mb-2 flex items-center gap-2">
                                    <Users className="w-4 h-4" /> Roster
                                </h3>
                                <div className="space-y-2">
                                    {data.members.map(m => (
                                        <MemberStatRow key={m.id} member={m} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer actions */}
                    {!loading && !error && squad && !hideJoin && (
                        <div className="border-t border-slate-800 p-3 shrink-0 flex gap-2">
                            <button onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-lg font-bold transition-colors text-sm">
                                Close
                            </button>
                            {canJoin && (() => {
                                const privacy = squad.privacy || 'open';
                                if (privacy === 'closed') {
                                    return (
                                        <button disabled className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-slate-700 text-slate-500 cursor-not-allowed">
                                            Closed Squad
                                        </button>
                                    );
                                }
                                if (privacy === 'request') {
                                    return (
                                        <button
                                            onClick={() => onRequestJoin?.(squad.id)}
                                            disabled={isFull}
                                            className={`flex-1 py-2.5 rounded-lg font-bold transition-colors text-sm ${isFull
                                                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                                : 'bg-amber-600 hover:bg-amber-500 text-white'}`}
                                        >
                                            {isFull ? 'Squad Full' : 'Request to Join'}
                                        </button>
                                    );
                                }
                                return (
                                    <button
                                        onClick={() => onJoin?.(squad.id)}
                                        disabled={isFull}
                                        className={`flex-1 py-2.5 rounded-lg font-bold transition-colors text-sm ${isFull
                                            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                            : 'bg-cyan-600 hover:bg-cyan-500 text-white'}`}
                                    >
                                        {isFull ? 'Squad Full' : 'Join Squad'}
                                    </button>
                                );
                            })()}
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}

function StatCard({ icon: Icon, color, label, value }) {
    return (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2 flex flex-col items-center text-center">
            <Icon className={`w-4 h-4 ${color} mb-1`} />
            <div className={`text-base md:text-lg font-black ${color}`}>{value}</div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider font-bold">{label}</div>
        </div>
    );
}

function MemberStatRow({ member }) {
    const isLeader = member.role === 'leader';
    return (
        <div className={`bg-slate-900/60 border rounded-lg p-2.5 ${isLeader ? 'border-yellow-700/50' : 'border-slate-800'}`}>
            <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${isLeader ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700' : 'bg-slate-700 text-slate-300'}`}>
                    {sanitizePilotName(member.player_name, member.wallet_address).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                    {isLeader && <Crown className="w-3 h-3 text-yellow-400 shrink-0" />}
                    <span className="font-bold text-white text-sm truncate">{sanitizePilotName(member.player_name, member.wallet_address)}</span>
                    {member.player_title && <span className="text-[9px] bg-slate-900/80 text-amber-300 px-1.5 py-0.5 rounded border border-amber-900/50 tracking-wider">{member.player_title}</span>}
                </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5 text-center">
                <MemberStat
                    label="Today"
                    value={(member.daily_kills || 0).toLocaleString()}
                    color="text-green-400"
                    tooltip="Kills this pilot has scored today (resets 00:00 UTC). Useful for tracking daily kill quests."
                />
                <MemberStat
                    label="Weekly Kills"
                    value={member.weekly_kills.toLocaleString()}
                    color="text-yellow-400"
                    tooltip="Total enemies killed across ALL arena runs this week (resets Mon 00:00 UTC). Not squad-war-only — includes regular runs, trials, raid, etc."
                />
                <MemberStat
                    label="All-Time Kills"
                    value={member.total_kills.toLocaleString()}
                    color="text-cyan-400"
                    tooltip="Lifetime total kills across every run this pilot has ever played."
                />
                <MemberStat
                    label="Raid DMG"
                    value={member.raid_damage_this_week.toLocaleString()}
                    color="text-red-400"
                    tooltip="Damage dealt to this week's Global Raid Boss."
                />
                <MemberStat
                    label="War Wins"
                    value={member.war_wins_claimed.toLocaleString()}
                    color="text-amber-400"
                    tooltip="Squad War wins this pilot has personally claimed rewards for."
                />
            </div>
        </div>
    );
}

function MemberStat({ label, value, color, tooltip }) {
    return (
        <div
            className="bg-slate-950/60 rounded px-1 py-1 border border-slate-800/60"
            title={tooltip || undefined}
        >
            <div className={`text-xs font-black ${color} truncate`}>{value}</div>
            <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold">{label}</div>
        </div>
    );
}