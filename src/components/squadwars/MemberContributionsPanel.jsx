import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronDown, ChevronUp, Users, Crown, Loader2, AlertTriangle } from 'lucide-react';
import { sanitizePilotName } from '@/lib/sanitizePilotName';

// "Your Squad's War Contributions" — collapsible panel under WarHeadToHead.
// Lists each member's sector-mode kill contribution this week (matches the
// rules in saveScore: endless / raid / meteor runs DON'T count).
//
// S6+ feature; parent component gates visibility via isS6OrLater().

function fmtNum(n) {
    if (n == null) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
}

export default function MemberContributionsPanel({ squadId, myWalletLower = '' }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [rows, setRows] = useState(null);
    const [totalShown, setTotalShown] = useState(0);

    // attempted ref — once we've tried (success OR failure) we DON'T auto-retry.
    // Previously, a 429 left rows === null with an error, so any parent re-render
    // (squad subscription events, wallet hydration, tab switch) re-fired the
    // effect → hammered the backend → made the 429 storm worse. Now: one attempt
    // per open, and the user clicks "Retry" if they want another.
    const attemptedRef = useRef(false);

    const load = useCallback(async () => {
        if (!squadId) return;
        attemptedRef.current = true;
        setLoading(true);
        setError(null);
        try {
            const res = await base44.functions.invoke('getSquadWarMemberContributions', { squadId });
            if (res.data?.error) {
                setError(res.data.error);
            } else {
                const list = res.data?.contributions || [];
                setRows(list);
                setTotalShown(list.reduce((sum, r) => sum + (r.war_kills || 0), 0));
            }
        } catch (e) {
            const status = e?.response?.status || e?.status;
            setError(status === 429 ? 'Server busy — try again in a moment.' : 'Couldn\'t load contributions.');
        }
        setLoading(false);
    }, [squadId]);

    // Reset the attempted flag if the squad id changes (e.g. user switched squads).
    useEffect(() => { attemptedRef.current = false; setRows(null); setError(null); }, [squadId]);

    // Lazy-load: only fetch when the panel is opened the first time. Will NOT
    // re-fire on error — user must click "Retry" explicitly.
    useEffect(() => {
        if (open && !attemptedRef.current && !loading) load();
    }, [open, loading, load]);

    // Explicit retry handler — resets the gate and re-fetches.
    const handleRetry = useCallback(() => {
        attemptedRef.current = false;
        load();
    }, [load]);

    return (
        <div className="mt-4 bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-800/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm font-bold text-white tracking-wide">YOUR SQUAD'S CONTRIBUTIONS</span>
                </div>
                {open
                    ? <ChevronUp className="w-4 h-4 text-slate-400" />
                    : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {open && (
                <div className="border-t border-slate-800 p-3">
                    {loading && (
                        <div className="flex items-center justify-center py-6 text-slate-400 gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-xs">Loading…</span>
                        </div>
                    )}
                    {error && !loading && (
                        <div className="flex items-center justify-between gap-2 text-xs text-amber-200 bg-amber-950/40 border border-amber-700/40 rounded p-2">
                            <div className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> {error}</div>
                            <button onClick={handleRetry} className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold">Retry</button>
                        </div>
                    )}
                    {!loading && !error && rows && rows.length === 0 && (
                        <div className="text-center text-slate-500 text-xs py-4 italic">No squad members yet.</div>
                    )}
                    {!loading && !error && rows && rows.length > 0 && (
                        <>
                            <div className="space-y-1.5">
                                {rows.map((r, i) => {
                                    const isMe = myWalletLower && r.wallet_address === myWalletLower;
                                    const isLeader = r.role === 'leader';
                                    return (
                                        <div
                                            key={r.wallet_address}
                                            className={`flex items-center justify-between rounded px-2 py-1.5 border ${isMe ? 'bg-cyan-950/40 border-cyan-700/50' : 'bg-slate-900/60 border-slate-800'}`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-[10px] font-black text-slate-500 w-5 text-right">{i + 1}</span>
                                                {isLeader && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                                                <span className={`text-sm truncate ${isMe ? 'text-cyan-100 font-bold' : 'text-white'}`}>
                                                    {sanitizePilotName(r.player_name, r.wallet_address)}
                                                </span>
                                                {isMe && <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest shrink-0">You</span>}
                                            </div>
                                            <span className="text-sm font-bold text-orange-300 shrink-0">{fmtNum(r.war_kills)} kills</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-2 text-[10px] text-slate-500 text-center space-y-1">
                                <div>Total shown: {fmtNum(totalShown)} · Sector runs only — endless / raid / meteor don't count.</div>
                                <div className="text-slate-600">
                                    ✓ Squad war total (kills_a) is <span className="font-bold">100% accurate</span>. Per-player breakdown may drift slightly due to score archives.
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}