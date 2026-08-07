import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Users, Loader2, Save, X, RotateCcw } from 'lucide-react';

// Owner-only widget. Lists every staff wallet and lets the owner set or clear
// a per-wallet payout % override. Cleared overrides fall back to the global
// staff_pct_per_wallet (managed in AdminStaffPayoutConfig).
//
// Backend: setStaffPayoutPct { action: 'setOverride', admin_id, override_pct }
// distributeRewards.js reads each AdminWallet's payout_pct_override at payout time.
export default function AdminStaffPayoutOverrides({ isOwner }) {
    const [admins, setAdmins] = useState([]);
    const [globalPct, setGlobalPct] = useState(0.02);
    const [loading, setLoading] = useState(true);
    const [edits, setEdits] = useState({}); // { admin_id: '2.50' | '' }
    const [savingId, setSavingId] = useState(null);
    const [msg, setMsg] = useState({}); // { admin_id: '✓ Saved' }

    const adminKey = sessionStorage.getItem('admin_key') || undefined;

    const refresh = async () => {
        setLoading(true);
        try {
            const [walletsRes, cfgRes] = await Promise.all([
                base44.functions.invoke('getAdminData', { type: 'adminWallets' }),
                base44.functions.invoke('setStaffPayoutPct', { action: 'get', adminKey }),
            ]);
            setAdmins(walletsRes.data?.records || []);
            setGlobalPct(Number(cfgRes.data?.pct ?? 0.02));
        } catch (e) {
            console.error('[AdminStaffPayoutOverrides]', e);
        }
        setLoading(false);
    };

    useEffect(() => { if (isOwner) refresh(); else setLoading(false); }, [isOwner]);

    const saveOverride = async (admin, value) => {
        setSavingId(admin.id);
        setMsg(m => ({ ...m, [admin.id]: '' }));
        try {
            // Empty/blank → clear; otherwise convert percent input to fraction.
            const trimmed = (value || '').trim();
            const override_pct = trimmed === '' ? null : Number(trimmed) / 100;
            const res = await base44.functions.invoke('setStaffPayoutPct', {
                action: 'setOverride',
                admin_id: admin.id,
                override_pct,
                adminKey,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setMsg(m => ({ ...m, [admin.id]: trimmed === '' ? '✓ Cleared (using global)' : `✓ Set to ${trimmed}%` }));
            setEdits(e => { const n = { ...e }; delete n[admin.id]; return n; });
            await refresh();
        } catch (e) {
            setMsg(m => ({ ...m, [admin.id]: `✗ ${e.message}` }));
        }
        setSavingId(null);
    };

    if (!isOwner) {
        return (
            <div className="bg-[#0b0416]/80 border border-slate-700/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Users size={16} /> Per-Staff Payout Overrides
                </h2>
                <div className="text-xs text-slate-400">
                    🔒 Hidden — owner permission required.
                </div>
            </div>
        );
    }

    return (
        <div className="bg-[#0b0416]/80 border border-amber-900/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-base font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                    <Users size={16} /> Per-Staff Payout Overrides
                </h2>
                <span className="text-[10px] text-slate-500 font-mono">
                    Default: {(globalPct * 100).toFixed(2)}% per staff
                </span>
            </div>

            <div className="text-[11px] text-slate-400 mb-3">
                Set a custom % for individual staff members (overrides the global default above).
                Leave blank and save to revert to the global default. Range: 0 – 10%.
            </div>

            {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /></div>
            ) : admins.length === 0 ? (
                <div className="text-slate-500 text-sm py-4 text-center">No staff configured.</div>
            ) : (
                <div className="space-y-1.5">
                    {admins.map(a => {
                        const override = a.payout_pct_override;
                        const hasOverride = override !== null && override !== undefined && isFinite(Number(override));
                        const effectivePct = hasOverride ? Number(override) : globalPct;
                        const editValue = edits[a.id] !== undefined
                            ? edits[a.id]
                            : (hasOverride ? (Number(override) * 100).toFixed(2) : '');
                        const dirty = edits[a.id] !== undefined;
                        const isSaving = savingId === a.id;

                        return (
                            <div key={a.id} className="bg-slate-900/50 border border-slate-800 rounded p-2.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="text-sm font-bold text-white truncate">{a.admin_name || 'Unnamed'}</span>
                                        {(a.permissions || []).includes('owner') && (
                                            <span className="text-[9px] bg-yellow-900/50 text-yellow-300 px-1 py-0.5 rounded font-bold shrink-0">👑 OWNER</span>
                                        )}
                                        <span className="text-[10px] text-slate-500 font-mono truncate">
                                            {a.wallet_address?.slice(0, 8)}…{a.wallet_address?.slice(-4)}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-[10px] text-slate-500 uppercase">Effective:</span>
                                        <span className={`text-xs font-mono font-bold ${hasOverride ? 'text-amber-400' : 'text-slate-400'}`}>
                                            {(effectivePct * 100).toFixed(2)}%
                                        </span>
                                        {hasOverride && (
                                            <span className="text-[9px] bg-amber-900/40 border border-amber-700/40 text-amber-300 px-1 py-0.5 rounded font-bold uppercase">
                                                custom
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="10"
                                            placeholder={`(blank = ${(globalPct * 100).toFixed(2)}%)`}
                                            value={editValue}
                                            onChange={e => setEdits(ed => ({ ...ed, [a.id]: e.target.value }))}
                                            className="w-40 bg-slate-900 border border-slate-700 text-white rounded pl-2 pr-7 py-1 text-xs font-mono focus:outline-none focus:border-amber-500"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">%</span>
                                    </div>

                                    <button
                                        disabled={!dirty || isSaving}
                                        onClick={() => saveOverride(a, editValue)}
                                        className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-2.5 py-1 rounded font-bold text-[11px] flex items-center gap-1"
                                    >
                                        {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                        Save
                                    </button>

                                    {hasOverride && (
                                        <button
                                            disabled={isSaving}
                                            onClick={() => saveOverride(a, '')}
                                            title="Clear override — revert to global default"
                                            className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 px-2 py-1 rounded font-bold text-[11px] flex items-center gap-1 border border-slate-700"
                                        >
                                            <RotateCcw size={11} /> Reset
                                        </button>
                                    )}

                                    {dirty && !isSaving && (
                                        <button
                                            onClick={() => setEdits(ed => { const n = { ...ed }; delete n[a.id]; return n; })}
                                            className="text-slate-500 hover:text-slate-300 text-[11px] flex items-center gap-1"
                                            title="Cancel edit"
                                        >
                                            <X size={11} /> Cancel
                                        </button>
                                    )}

                                    {msg[a.id] && (
                                        <span className={`text-[10px] font-mono ${msg[a.id].startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {msg[a.id]}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="text-[10px] text-slate-500 mt-3 italic">
                Changes apply to the <strong>next</strong> distribution run. Already-distributed weeks are unaffected.
            </div>
        </div>
    );
}