import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Wrench, CheckCircle2, Coins } from 'lucide-react';
import AdminMinClientVersion from './AdminMinClientVersion';

// Three-state maintenance toggle — manual flip only, no automation.
// Recommended flow for S6 rollover (May 18, 00:00 UTC):
//   23:00 UTC — flip SOFT (1hr warning banner)
//   23:40 UTC — flip HARD (20min before, blocks /game)
//   ~00:05 UTC, AFTER you've verified rollover is healthy — flip OFF
export default function AdminMaintenance() {
    const [current, setCurrent] = useState({ mode: 'off', message: '' });
    const [draftMessage, setDraftMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [ok, setOk] = useState('');
    // Independent OMENX-purchases-disabled toggle — used when the OmenX settlement
    // service is down but the game itself is still playable. Separate from SOFT/HARD
    // so admins can disable purchases without putting the game into maintenance.
    const [omenxPurchasesDisabled, setOmenxPurchasesDisabled] = useState(false);
    const [omenxPurchasesMsg, setOmenxPurchasesMsg] = useState('');
    const [omenxArmed, setOmenxArmed] = useState(false);
    useEffect(() => {
        if (!omenxArmed) return;
        const t = setTimeout(() => setOmenxArmed(false), 5000);
        return () => clearTimeout(t);
    }, [omenxArmed]);
    // Two-tap confirm — first click arms a mode, second click within 5s commits.
    // Prevents accidental SOFT/HARD/OFF flips during a busy admin session.
    const [armed, setArmed] = useState(null); // 'off' | 'soft' | 'hard' | null
    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(null), 5000);
        return () => clearTimeout(t);
    }, [armed]);

    const refresh = async () => {
        try {
            const res = await base44.functions.invoke('getMaintenanceMode', {});
            if (res.data?.mode) {
                setCurrent({ mode: res.data.mode, message: res.data.message || '' });
                setDraftMessage(res.data.message || '');
            }
            setOmenxPurchasesDisabled(!!res.data?.omenxPurchasesDisabled);
            setOmenxPurchasesMsg(res.data?.omenxPurchasesMessage || '');
        } catch (e) { /* noop */ }
    };

    const toggleOmenxPurchases = async () => {
        if (busy) return;
        if (!omenxArmed) { setOmenxArmed(true); setErr(''); setOk(''); return; }
        setOmenxArmed(false);
        setBusy(true); setErr(''); setOk('');
        try {
            const next = !omenxPurchasesDisabled;
            const res = await base44.functions.invoke('setMaintenanceMode', {
                omenxPurchasesDisabled: next,
                omenxPurchasesMessage: omenxPurchasesMsg,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setOk(`OMENX purchases ${next ? 'DISABLED' : 'ENABLED'}`);
            await refresh();
            setTimeout(() => setOk(''), 3000);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed');
        }
        setBusy(false);
    };

    useEffect(() => { refresh(); }, []);

    const handleModeClick = (mode) => {
        // No-op if it's already the current mode (nothing to confirm).
        if (mode === current.mode) return;
        // First click: arm. Second click on the same mode: commit.
        if (armed !== mode) {
            setArmed(mode);
            setErr(''); setOk('');
            return;
        }
        setArmed(null);
        commitMode(mode);
    };

    const commitMode = async (mode) => {
        setBusy(true); setErr(''); setOk('');
        try {
            const res = await base44.functions.invoke('setMaintenanceMode', { mode, message: draftMessage });
            if (res.data?.error) throw new Error(res.data.error);
            setOk(`Mode set to ${mode.toUpperCase()}`);
            await refresh();
            setTimeout(() => setOk(''), 3000);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed');
        }
        setBusy(false);
    };

    const presets = {
        soft: 'Season 6 rolls out in ~1 hour. Finish your run — the game will briefly close for the swap.',
        hard: 'Season 6 rollover in progress. Back online shortly.',
    };

    const modeColor = {
        off: 'text-emerald-300 bg-emerald-950/40 border-emerald-700/50',
        soft: 'text-amber-300 bg-amber-950/40 border-amber-700/50',
        hard: 'text-red-300 bg-red-950/40 border-red-700/50',
    }[current.mode];

    return (
        <div className="bg-[#0b0416]/80 border border-amber-900/50 rounded-xl p-4 space-y-4">
            <div>
                <h2 className="text-base font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                    <Wrench size={16} /> Maintenance Gate
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                    Player-facing rollover banner / blocker. Manual flip — no auto-recovery.
                </p>
            </div>

            <div className={`rounded-lg border px-3 py-2 ${modeColor}`}>
                <div className="text-[10px] uppercase tracking-widest font-bold opacity-70">Current mode</div>
                <div className="font-black text-lg">{current.mode.toUpperCase()}</div>
                {current.message && <div className="text-xs italic opacity-80 mt-1">"{current.message}"</div>}
            </div>

            <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                    Player-facing message (max 280 chars, optional)
                </label>
                <textarea
                    value={draftMessage}
                    onChange={e => setDraftMessage(e.target.value)}
                    maxLength={280}
                    rows={3}
                    placeholder={presets.soft}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-amber-500 resize-none"
                />
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    <button onClick={() => setDraftMessage(presets.soft)}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded">
                        Use SOFT preset
                    </button>
                    <button onClick={() => setDraftMessage(presets.hard)}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded">
                        Use HARD preset
                    </button>
                    <button onClick={() => setDraftMessage('')}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded">
                        Clear
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {[
                    { mode: 'off',  label: '✓ OFF',     base: 'bg-emerald-700 hover:bg-emerald-600', armed: 'bg-emerald-500 ring-2 ring-emerald-300 animate-pulse' },
                    { mode: 'soft', label: '⚠️ SOFT',   base: 'bg-amber-700 hover:bg-amber-600',     armed: 'bg-amber-500 ring-2 ring-amber-300 animate-pulse' },
                    { mode: 'hard', label: '🔒 HARD',   base: 'bg-red-700 hover:bg-red-600',         armed: 'bg-red-500 ring-2 ring-red-300 animate-pulse' },
                ].map(b => {
                    const isCurrent = current.mode === b.mode;
                    const isArmed = armed === b.mode;
                    return (
                        <button
                            key={b.mode}
                            onClick={() => handleModeClick(b.mode)}
                            disabled={busy || isCurrent}
                            className={`${isArmed ? b.armed : b.base} disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded font-black text-xs uppercase tracking-widest transition-all`}
                            title={isCurrent ? 'Already active' : isArmed ? 'Tap again to confirm' : `Set ${b.mode.toUpperCase()}`}
                        >
                            {isCurrent ? `${b.label} (active)` : isArmed ? `Confirm ${b.mode.toUpperCase()}?` : b.label}
                        </button>
                    );
                })}
            </div>
            {armed && (
                <div className="text-[11px] text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Tap <span className="font-black">{armed.toUpperCase()}</span> again within 5s to confirm, or wait to cancel.
                </div>
            )}

            {ok && <div className="text-xs text-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={12} /> {ok}</div>}
            {err && <div className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle size={12} /> {err}</div>}

            {/* Independent OMENX purchases kill-switch */}
            <div className="border-t border-slate-800 pt-4 space-y-2">
                <div className="flex items-center gap-2">
                    <Coins size={14} className="text-orange-400" />
                    <span className="text-xs font-bold text-orange-300 uppercase tracking-widest">OMENX purchases</span>
                    <span className={`ml-auto text-[10px] font-black px-2 py-0.5 rounded ${omenxPurchasesDisabled ? 'bg-red-950/60 text-red-300 border border-red-700/50' : 'bg-emerald-950/40 text-emerald-300 border border-emerald-700/50'}`}>
                        {omenxPurchasesDisabled ? 'DISABLED' : 'ENABLED'}
                    </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                    Hard-blocks all in-game OMENX SKU purchases server-side. Use when the settlement service is down. Independent of SOFT/HARD — game stays playable.
                </p>
                <input
                    type="text"
                    value={omenxPurchasesMsg}
                    onChange={e => setOmenxPurchasesMsg(e.target.value)}
                    maxLength={280}
                    placeholder="Optional message shown on the purchase modal (e.g. 'OmenX settlement is offline. Back online soon.')"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-xs focus:outline-none focus:border-orange-500"
                />
                <button
                    onClick={toggleOmenxPurchases}
                    disabled={busy}
                    className={`w-full ${omenxArmed
                        ? 'bg-orange-500 ring-2 ring-orange-300 animate-pulse'
                        : omenxPurchasesDisabled ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-orange-700 hover:bg-orange-600'}
                        disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2 rounded font-black text-xs uppercase tracking-widest transition-all`}
                >
                    {omenxArmed
                        ? `Confirm ${omenxPurchasesDisabled ? 'enable' : 'disable'}?`
                        : omenxPurchasesDisabled ? '✓ Re-enable purchases' : '🔒 Disable all OMENX purchases'}
                </button>
                {omenxArmed && (
                    <div className="text-[11px] text-orange-300 flex items-center gap-1.5">
                        <AlertTriangle size={12} /> Tap again within 5s to confirm.
                    </div>
                )}
            </div>

            <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-400 leading-relaxed space-y-3">
                <div>
                    <div className="font-bold text-slate-300 mb-1">📖 What each mode does</div>
                    <div className="space-y-1 pl-1">
                        <div><span className="text-emerald-300 font-bold">OFF</span> — Normal play. Nothing shown to players.</div>
                        <div><span className="text-amber-300 font-bold">SOFT</span> — Yellow warning banner at top of every page. Game still fully playable. Use to give players a heads-up before downtime.</div>
                        <div><span className="text-red-300 font-bold">HARD</span> — Full-screen overlay blocks <span className="font-mono">/game</span>. Players are bumped to /hub if they're already in a run. Squads, chat, leaderboards, profile all stay accessible.</div>
                    </div>
                </div>

                <div>
                    <div className="font-bold text-slate-300 mb-1">🛠 Common scenarios</div>
                    <div className="space-y-1 pl-1">
                        <div><span className="text-slate-200 font-bold">Planned rollout / season swap:</span> SOFT 1hr before → HARD 15–20min before → deploy → manually flip OFF after verifying.</div>
                        <div><span className="text-slate-200 font-bold">Incident / something on fire:</span> Flip HARD immediately to stop new runs from being affected, fix the issue, flip OFF when healthy.</div>
                        <div><span className="text-slate-200 font-bold">Economy / scoring exploit found:</span> HARD blocks /game so no more bad scores get submitted while you patch.</div>
                        <div><span className="text-slate-200 font-bold">Brief notice (no downtime needed):</span> SOFT with a custom message — e.g. "Leaderboard payouts running, expect minor lag".</div>
                    </div>
                </div>

                <div>
                    <div className="font-bold text-slate-300 mb-1">✍️ Tips</div>
                    <div className="space-y-1 pl-1">
                        <div>• Always set a clear player-facing message before flipping — vague banners cause more support tickets than no banner.</div>
                        <div>• Use the SOFT/HARD presets as a starting point and edit from there.</div>
                        <div>• Banner/overlay polls every 30s — players see changes within ~30s without refreshing.</div>
                        <div>• Reads fail-open: if the backend hiccups, the gate defaults to OFF (better than locking everyone out).</div>
                    </div>
                </div>

                <div className="italic text-amber-400 border-t border-slate-800 pt-2">
                    ⚠️ OFF is always manual — there's no auto-revert. If you flip HARD and walk away, it stays HARD until someone clears it. This is intentional: better stuck-closed than stuck-broken.
                </div>
            </div>

            <AdminMinClientVersion />
        </div>
    );
}