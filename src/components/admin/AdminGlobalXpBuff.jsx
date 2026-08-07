import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';

// Server-wide XP multiplier toggle. Used as a "make-good" lever — e.g. when
// OMENX settlement is down so players can't buy the personal +50% XP buff,
// you can grant 2× XP for 24h server-wide so everyone benefits.
//
// Stacks multiplicatively with the personal +50% buff (a player who has both
// gets 1.5 × global). Locked in at run-start — does not affect runs already
// in progress.
export default function AdminGlobalXpBuff() {
    const [active, setActive] = useState(null); // { multiplier, expiresAt, message } | null
    const [multInput, setMultInput] = useState('2');
    const [hoursInput, setHoursInput] = useState('24');
    const [msgInput, setMsgInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [armed, setArmed] = useState(false);
    const [err, setErr] = useState('');
    const [ok, setOk] = useState('');

    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), 5000);
        return () => clearTimeout(t);
    }, [armed]);

    const refresh = async () => {
        try {
            const res = await base44.functions.invoke('getMaintenanceMode', {});
            setActive(res.data?.globalXpBuff || null);
        } catch {}
    };
    useEffect(() => { refresh(); }, []);

    const apply = async () => {
        if (busy) return;
        if (!armed) { setArmed(true); setErr(''); setOk(''); return; }
        setArmed(false);
        setBusy(true); setErr(''); setOk('');
        try {
            const res = await base44.functions.invoke('setGlobalXpBuff', {
                multiplier: parseFloat(multInput),
                hours: parseFloat(hoursInput),
                message: msgInput,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setOk(`Global XP buff set to ${multInput}× for ${hoursInput}h`);
            await refresh();
            setTimeout(() => setOk(''), 3000);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed');
        }
        setBusy(false);
    };

    const clear = async () => {
        if (busy) return;
        setBusy(true); setErr(''); setOk('');
        try {
            const res = await base44.functions.invoke('setGlobalXpBuff', { disable: true });
            if (res.data?.error) throw new Error(res.data.error);
            setOk('Global XP buff cleared');
            await refresh();
            setTimeout(() => setOk(''), 3000);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed');
        }
        setBusy(false);
    };

    const fmtRemaining = (expiresAt) => {
        const ms = expiresAt - Date.now();
        if (ms <= 0) return 'expired';
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    return (
        <div className="bg-[#0b0416]/80 border border-emerald-900/50 rounded-xl p-4 space-y-4">
            <div>
                <h2 className="text-base font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles size={16} /> Global XP Buff
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                    Server-wide XP multiplier. Applies to every player's runs. Stacks with the personal +50% SKU.
                </p>
            </div>

            <div className={`rounded-lg border px-3 py-2 ${active ? 'border-emerald-700/50 bg-emerald-950/40 text-emerald-300' : 'border-slate-700/50 bg-slate-900/40 text-slate-400'}`}>
                <div className="text-[10px] uppercase tracking-widest font-bold opacity-70">Current state</div>
                {active ? (
                    <>
                        <div className="font-black text-lg">{active.multiplier}× XP — {fmtRemaining(active.expiresAt)} left</div>
                        {active.message && <div className="text-xs italic opacity-80 mt-1">"{active.message}"</div>}
                    </>
                ) : (
                    <div className="font-black text-lg">Inactive</div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                        Multiplier (1.0–3.0)
                    </label>
                    <input
                        type="number" step="0.1" min="1" max="3"
                        value={multInput}
                        onChange={e => setMultInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                        Duration (hours, max 72)
                    </label>
                    <input
                        type="number" step="1" min="1" max="72"
                        value={hoursInput}
                        onChange={e => setHoursInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                    />
                </div>
            </div>

            <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                    Optional public message (shown to players in patch notes / banners — UI hookup TBD)
                </label>
                <input
                    type="text"
                    value={msgInput}
                    onChange={e => setMsgInput(e.target.value)}
                    maxLength={280}
                    placeholder="e.g. 'Sorry for the OmenX outage — enjoy 2× XP for the next 24h!'"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                />
            </div>

            <div className="flex gap-2">
                <button
                    onClick={apply}
                    disabled={busy}
                    className={`flex-1 ${armed
                        ? 'bg-emerald-500 ring-2 ring-emerald-300 animate-pulse'
                        : 'bg-emerald-700 hover:bg-emerald-600'}
                        disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2 rounded font-black text-xs uppercase tracking-widest transition-all`}
                >
                    {armed ? 'Confirm activation?' : '✨ Activate global buff'}
                </button>
                {active && (
                    <button
                        onClick={clear}
                        disabled={busy}
                        className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white px-3 py-2 rounded font-black text-xs uppercase tracking-widest"
                    >
                        Clear
                    </button>
                )}
            </div>

            {armed && (
                <div className="text-[11px] text-emerald-300 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Tap activate again within 5s to confirm.
                </div>
            )}
            {ok && <div className="text-xs text-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={12} /> {ok}</div>}
            {err && <div className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle size={12} /> {err}</div>}

            <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-400 leading-relaxed space-y-1">
                <div>• Locked at run-start — players already mid-run keep their old multiplier until they start a new run.</div>
                <div>• Stacks with the personal +50% SKU multiplicatively (2× global × 1.5 personal = 3× total).</div>
                <div>• Players see it within ~15s of activation (cached at the same TTL as the maintenance gate).</div>
                <div>• Auto-expires at the configured time — no need to remember to disable it.</div>
            </div>
        </div>
    );
}