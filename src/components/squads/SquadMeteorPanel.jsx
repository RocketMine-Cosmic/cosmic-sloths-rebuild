import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Sparkles, Zap, Trophy, Loader2, AlertTriangle, Crosshair, Lock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { sanitizePilotName } from '@/lib/sanitizePilotName';
import { SaveManager } from '../../game/SaveManager';
import { SoundManager } from '../../game/SoundManager';
import { isS6OrLater } from '@/lib/seasonGate';

// Squad Meteor goes live with S6 (Mon May 18 2026 00:00 UTC, W20→W21 boundary).
// Until then, every entry point shows a locked "Coming with S6" screen.
const S6_START_UTC = Date.UTC(2026, 4, 18, 0, 0, 0); // May 18 2026 00:00 UTC

function fmtNum(n) {
    if (n == null) return '0';
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
}

export default function SquadMeteorPanel() {
    const { toast } = useToast();
    const navigate = useNavigate();
    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const handleAttackMeteor = useCallback(() => {
        if (!state?.in_squad) return;
        if ((state?.my_attempts_remaining ?? 0) <= 0) {
            toast({ title: 'No attacks remaining', description: 'Resets at 00:00 UTC.', variant: 'destructive' });
            return;
        }
        SoundManager.playUIClick();
        // FAST LAUNCH (2026-05-13): navigate to /game immediately. The attempt
        // reservation fires in the background and stashes the resulting attackId
        // in sessionStorage — Game.jsx picks it up when it's ready to submit
        // damage. If the reservation fails, Game.jsx falls back to the legacy
        // single-call finish path (which charges an attempt at run-end instead).
        try { sessionStorage.removeItem('squad_meteor_pending_attack'); } catch {}
        try { sessionStorage.removeItem('squad_meteor_quit_toast'); } catch {}
        // Mark reservation as in-flight so Game.jsx knows to wait briefly.
        try { sessionStorage.setItem('squad_meteor_pending_attack', JSON.stringify({ status: 'pending', startedAt: Date.now() })); } catch {}
        base44.functions.invoke('submitSquadMeteorDamage', { mode: 'start', damage: 0 })
            .then(res => {
                if (res.data?.error || !res.data?.attackId) {
                    try { sessionStorage.setItem('squad_meteor_pending_attack', JSON.stringify({ status: 'failed', error: res.data?.error || 'reserve failed' })); } catch {}
                    return;
                }
                try { sessionStorage.setItem('squad_meteor_pending_attack', JSON.stringify({ status: 'ready', attackId: res.data.attackId })); } catch {}
            })
            .catch(err => {
                try { sessionStorage.setItem('squad_meteor_pending_attack', JSON.stringify({ status: 'failed', error: err?.message || 'network' })); } catch {}
            });

        const save = SaveManager.load();
        const characterId = save?.lastSelectedChar || 'neobyte';
        navigate('/game', {
            state: {
                characterId,
                arenaId: 'quantum_meteor',
                difficultyId: 'normal',
                isEndless: false,
                isSquadMeteor: true,
                // meteorAttackId resolved at submit-time via sessionStorage.
            },
        });
    }, [state, navigate, toast]);

    const load = useCallback(async () => {
        try {
            const res = await base44.functions.invoke('getSquadMeteorState', {});
            if (res.data?.error) {
                setError(res.data.error);
            } else {
                setState(res.data);
                setError(null);
                // Cache buffs so EVERY arena run (not just meteor) picks them up.
                // Read by Game.jsx on run start → injected into engine.save.squadMeteorBuffs.
                // Squad members refresh this whenever they open the Squads page.
                try {
                    if (res.data?.in_squad && res.data?.buffs) {
                        localStorage.setItem('squad_meteor_buffs', JSON.stringify({
                            buffs: res.data.buffs,
                            squadId: res.data.squad_id,
                            cachedAt: Date.now(),
                        }));
                    } else {
                        localStorage.removeItem('squad_meteor_buffs');
                    }
                } catch {}
            }
        } catch (e) {
            setError(e?.message || 'Failed to load meteor state.');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Show a toast if we just came back from a quit/abandoned meteor run.
    // The Game page writes this key in handleQuit before navigating away.
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem('squad_meteor_quit_toast');
            if (!raw) return;
            sessionStorage.removeItem('squad_meteor_quit_toast');
            const parsed = JSON.parse(raw);
            const dmg = Number(parsed?.damage || 0);
            if (parsed?.error) {
                toast({ title: 'Meteor attack failed', description: parsed.error, variant: 'destructive' });
            } else if (dmg > 0) {
                toast({ title: 'Damage submitted', description: `Dealt ${fmtNum(dmg)} damage to the meteor.` });
            } else {
                toast({ title: 'Attempt used', description: 'No damage submitted — quit too early.' });
            }
        } catch {}
    }, [toast]);

    // S6 gate — Squad Meteor unlocks at the W20→W21 rollover (May 18 2026 00:00 UTC).
    // Show a polished "coming soon" screen instead of the live panel until then.
    if (!isS6OrLater()) {
        const msUntil = Math.max(0, S6_START_UTC - Date.now());
        const days = Math.floor(msUntil / 86400000);
        const hours = Math.floor((msUntil % 86400000) / 3600000);
        return (
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="max-w-sm text-center bg-gradient-to-br from-purple-950/60 via-slate-900/80 to-orange-950/40 border border-purple-500/40 rounded-xl p-6 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                    <div className="text-6xl mb-3 drop-shadow-[0_0_15px_rgba(249,115,22,0.6)]">☄️</div>
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <Lock className="w-4 h-4 text-purple-300" />
                        <h3 className="text-lg font-black text-white tracking-widest uppercase">Squad Meteor</h3>
                    </div>
                    <p className="text-purple-300 text-xs font-bold uppercase tracking-widest mb-3">
                        Unlocks with Season 6
                    </p>
                    <p className="text-slate-400 text-xs mb-4 leading-relaxed">
                        Strike together. Level the meteor. Buff the whole squad.
                    </p>
                    <div className="bg-slate-900/60 border border-purple-500/30 rounded-lg p-3">
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Launches in</div>
                        <div className="text-2xl font-black text-orange-300">
                            {days}d {hours}h
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">Mon May 18 · 00:00 UTC</div>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center text-red-400 p-6 text-center">
                <div>
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                    <div className="text-sm mb-3">{error}</div>
                    <div className="text-xs text-slate-500 mb-3">Server is busy — try again in a second.</div>
                    <button
                        onClick={() => { setLoading(true); setError(null); load(); }}
                        className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-xs"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!state?.in_squad) {
        return <div className="flex-1 flex items-center justify-center text-slate-400 p-6">Join a squad to attack the meteor.</div>;
    }

    const { meteor, buffs, today_activity, weekly_leaderboard, my_attempts_remaining, my_attempts_used_today, daily_attempt_limit, today_date, week_id } = state;
    // current_hp now means "damage banked toward next level" (counts up 0 → max_hp).
    const hpPct = meteor.max_hp > 0 ? Math.min(100, (meteor.current_hp / meteor.max_hp) * 100) : 0;

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* HERO — meteor + HP */}
            <div className="bg-gradient-to-br from-purple-950/60 via-slate-900/80 to-orange-950/40 border border-purple-500/40 rounded-xl p-4 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                <div className="flex items-center gap-3 mb-3">
                    <div className="text-5xl drop-shadow-[0_0_15px_rgba(249,115,22,0.6)]">☄️</div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xl font-black text-white tracking-wider">SQUAD METEOR</h3>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900/60 text-purple-200 border border-purple-500/50 tracking-widest">
                                LV.{meteor.level}
                            </span>
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">
                            {fmtNum(meteor.total_lifetime_kills)} destroyed · {fmtNum(meteor.total_lifetime_damage)} lifetime dmg
                        </div>
                    </div>
                </div>

                {/* Progress bar — damage banked toward next level-up */}
                <div className="mb-2">
                    <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-orange-300">PROGRESS</span>
                        <span className="text-white">{fmtNum(meteor.current_hp)} / {fmtNum(meteor.max_hp)}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700">
                        <div
                            className="h-full bg-gradient-to-r from-orange-600 via-red-500 to-purple-500 transition-all duration-500"
                            style={{ width: `${hpPct}%` }}
                        />
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 text-center">
                        Fill the bar as a squad to break through to Lv.{meteor.level + 1}
                    </div>
                </div>

                {/* Daily attempts indicator */}
                <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Your attacks today</span>
                    <span className="font-bold text-cyan-300">{my_attempts_used_today} / {daily_attempt_limit}</span>
                </div>
                {my_attempts_remaining === 0 && (
                    <div className="mt-2 text-[10px] text-amber-300 text-center bg-amber-950/30 border border-amber-700/40 rounded py-1.5">
                        All attacks used today — resets at 00:00 UTC
                    </div>
                )}

                {/* ATTACK METEOR — launches the dedicated DPS run */}
                <button
                    onClick={handleAttackMeteor}
                    disabled={my_attempts_remaining <= 0}
                    className="mt-3 w-full bg-gradient-to-r from-orange-600 via-red-600 to-purple-600 hover:from-orange-500 hover:via-red-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl font-black text-sm uppercase tracking-widest shadow-[0_0_25px_rgba(220,38,38,0.45)] hover:shadow-[0_0_35px_rgba(220,38,38,0.7)] transition-all flex items-center justify-center gap-2 border border-red-400/60"
                >
                    <Crosshair className="w-4 h-4" />
                    ATTACK METEOR
                    <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded-full font-bold tracking-normal">
                        {my_attempts_remaining} left
                    </span>
                </button>
            </div>

            {/* BUFFS */}
            <div className="bg-[#0b0416]/80 border border-cyan-500/30 rounded-xl p-3">
                <h4 className="text-xs font-black text-cyan-300 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Active Squad Buffs (Lv.{buffs.applied_level}{buffs.is_capped ? ' MAX' : ''})
                </h4>
                <div className="grid grid-cols-2 gap-2">
                    <BuffPill label="Gold" value={`+${buffs.gold_pct.toFixed(1)}%`} color="yellow" />
                    <BuffPill label="Damage" value={`+${buffs.damage_pct.toFixed(1)}%`} color="red" />
                    <BuffPill label="AoE" value={`+${buffs.aoe_pct.toFixed(1)}%`} color="orange" />
                    <BuffPill label="CDR" value={`+${buffs.cdr_pct.toFixed(2)}%`} color="cyan" />
                </div>
                <div className="text-[10px] text-slate-500 mt-2">
                    Buffs apply to every squad member's runs. Destroy the meteor to level it up.
                </div>
            </div>

            {/* ACTIVITY FEEDS — daily + weekly side-by-side on desktop, stacked on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* TODAY */}
                <div className="bg-[#0b0416]/80 border border-orange-500/30 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-black text-orange-300 uppercase tracking-widest flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5" /> Today
                        </h4>
                        <span className="text-[9px] text-slate-500 font-mono">{today_date}</span>
                    </div>
                    {today_activity.length === 0 ? (
                        <div className="text-center text-slate-500 text-xs py-4 italic">
                            No attacks yet today.
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {today_activity.map((row, i) => (
                                <div key={row.wallet} className="flex items-center justify-between bg-slate-900/60 rounded px-2 py-1.5 border border-slate-800">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[10px] font-black text-slate-500 w-4">{i + 1}</span>
                                        <span className="text-sm text-white truncate">{sanitizePilotName(row.name, row.wallet)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] text-slate-400">{row.attacks}/{daily_attempt_limit}</span>
                                        <span className="text-sm font-bold text-orange-300">{fmtNum(row.damage)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* THIS WEEK */}
                <div className="bg-[#0b0416]/80 border border-purple-500/30 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-black text-purple-300 uppercase tracking-widest flex items-center gap-1.5">
                            <Trophy className="w-3.5 h-3.5" /> This Week
                        </h4>
                        <span className="text-[9px] text-slate-500 font-mono">{week_id}</span>
                    </div>
                    {(!weekly_leaderboard || weekly_leaderboard.length === 0) ? (
                        <div className="text-center text-slate-500 text-xs py-4 italic">
                            No attacks yet this week.
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {weekly_leaderboard.map((row, i) => (
                                <div key={row.wallet} className="flex items-center justify-between bg-slate-900/60 rounded px-2 py-1.5 border border-slate-800">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[10px] font-black text-slate-500 w-4">{i + 1}</span>
                                        <span className="text-sm text-white truncate">{sanitizePilotName(row.name, row.wallet)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] text-slate-400">{row.attacks} hits</span>
                                        <span className="text-sm font-bold text-purple-300">{fmtNum(row.damage)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}

function BuffPill({ label, value, color }) {
    const colorMap = {
        yellow: 'border-yellow-500/40 bg-yellow-950/30 text-yellow-300',
        red: 'border-red-500/40 bg-red-950/30 text-red-300',
        orange: 'border-orange-500/40 bg-orange-950/30 text-orange-300',
        cyan: 'border-cyan-500/40 bg-cyan-950/30 text-cyan-300',
    };
    return (
        <div className={`rounded-lg border px-2 py-1.5 flex items-center justify-between ${colorMap[color]}`}>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</span>
            <span className="text-sm font-black">{value}</span>
        </div>
    );
}