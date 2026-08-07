import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Coins, AlertTriangle, CheckCircle2 } from 'lucide-react';

// Admin one-shot tools for the S6 launch — currently just squad treasury seeding.
// Both action and amount inputs are guarded by a two-tap confirm.

function ConfirmAction({ label, icon: IconComp, accent, helpText, onRun, busy, lastResult }) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), 5000);
        return () => clearTimeout(t);
    }, [armed]);

    const handleClick = () => {
        if (busy) return;
        if (!armed) { setArmed(true); return; }
        setArmed(false);
        onRun();
    };

    return (
        <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
            <div className="flex items-start gap-3 mb-2">
                <IconComp className={`w-5 h-5 ${accent} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                    <div className={`text-sm font-bold ${accent}`}>{label}</div>
                    <div className="text-[11px] text-slate-400 leading-relaxed mt-1">{helpText}</div>
                </div>
            </div>
            <button
                onClick={handleClick}
                disabled={busy}
                className={`w-full ${armed ? 'bg-amber-500 ring-2 ring-amber-300 animate-pulse' : 'bg-slate-700 hover:bg-slate-600'} disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold py-2 rounded transition-all`}
            >
                {busy ? 'Running…' : armed ? 'Tap again to confirm' : 'Run'}
            </button>
            {lastResult && (
                <div className={`mt-2 text-[11px] ${lastResult.ok ? 'text-emerald-300' : 'text-red-400'} flex items-start gap-1.5`}>
                    {lastResult.ok ? <CheckCircle2 size={12} className="mt-0.5 shrink-0" /> : <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
                    <span>{lastResult.message}</span>
                </div>
            )}
        </div>
    );
}

export default function AdminS6LaunchTools() {
    const [busy, setBusy] = useState(null);
    const [seedResult, setSeedResult] = useState(null);
    const [seedAmount, setSeedAmount] = useState(25000);

    const runSeed = async () => {
        setBusy('seed');
        setSeedResult(null);
        try {
            const res = await base44.functions.invoke('seedSquadTreasuries', {
                amount: Number(seedAmount) || 25000,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setSeedResult({
                ok: true,
                message: `Seeded ${res.data?.seeded || 0} squads (${res.data?.skipped || 0} skipped, already had treasury).`,
            });
        } catch (e) {
            setSeedResult({ ok: false, message: e.message || 'Seed failed' });
        }
        setBusy(null);
    };

    return (
        <div className="bg-[#0b0416]/80 border border-fuchsia-900/50 rounded-xl p-4 space-y-4">
            <div>
                <h2 className="text-base font-bold text-fuchsia-400 uppercase tracking-widest flex items-center gap-2">
                    🚀 S6 Launch Tools
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                    One-shot admin actions for the Season 6 rollover. Idempotent — safe to re-run.
                </p>
            </div>

            <div className="space-y-3">
                <div>
                    <ConfirmAction
                        label="Seed Squad Treasuries"
                        icon={Coins}
                        accent="text-emerald-300"
                        helpText="Gives every squad with 0 treasury enough gold to immediately activate the Bronze buff (25k). Squads with existing treasury are skipped."
                        onRun={runSeed}
                        busy={busy === 'seed'}
                        lastResult={seedResult}
                    />
                    <div className="mt-1.5 flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Amount per squad:</label>
                        <input
                            type="number"
                            value={seedAmount}
                            onChange={e => setSeedAmount(e.target.value)}
                            min={1}
                            max={50000}
                            className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-500 w-24"
                        />
                        <span className="text-[10px] text-slate-500">gold (max 50k)</span>
                    </div>
                </div>
            </div>

            <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-400 leading-relaxed">
                <div className="italic text-fuchsia-400">
                    💡 Run this BEFORE the S6 rollover at Mon May 25 00:00 UTC. Old S5 leaderboards (weekly / seasonal / endless) reset automatically when the season flips — no archive action needed.
                </div>
            </div>
        </div>
    );
}