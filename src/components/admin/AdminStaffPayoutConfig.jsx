import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Settings, Loader2, Save, AlertTriangle } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import StaffPayoutAllocationPreview, { SOFT_CAP_PCT, HARD_CAP_PCT } from './StaffPayoutAllocationPreview';

// Pool %s are loaded LIVE from leaderboardPayoutConfig at mount — the previous
// hardcoded constants (20/30/10) were the S6 numbers; S7+ uses 15/20/5 + 10%
// champions, so showing static figures was misleading. Squad Champions pct is
// still hardcoded — it lives in distributeSquadChampions, not in
// leaderboardPayoutConfig — so we mirror its constant here.
const SQUAD_CHAMPIONS_PCT = 0.10;

// Owner-only widget: read & update the per-staff weekly payout percentage.
// Stored in AppConfig under key 'staff_pct_per_wallet' via setStaffPayoutPct fn.
// Distribution functions read this at payout time (with 0.02 fallback).
export default function AdminStaffPayoutConfig({ isOwner }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pctInput, setPctInput] = useState('2.00');
    const [notes, setNotes] = useState('');
    const [current, setCurrent] = useState(null);
    const [staffCount, setStaffCount] = useState(0);
    // Sum of EFFECTIVE per-wallet pcts (override if set, else global). Reflects
    // real distribution math (mirrors AdminStaffPayouts.effectivePctFor) so the
    // bar is accurate even when individual wallets have custom overrides.
    const [liveStaffTotalPct, setLiveStaffTotalPct] = useState(0);
    // Live pool %s pulled from leaderboardPayoutConfig (see DEFAULT_CONFIG there)
    const [poolPcts, setPoolPcts] = useState({
        weekly: 0.15,
        seasonal: 0.20,
        kill: 0.05,
    });
    const [msg, setMsg] = useState('');

    const adminKey = sessionStorage.getItem('admin_key') || undefined;

    useEffect(() => {
        if (!isOwner) { setLoading(false); return; }
        Promise.all([
            base44.functions.invoke('setStaffPayoutPct', { action: 'get', adminKey }),
            base44.functions.invoke('getAdminData', { type: 'adminWallets' }),
            base44.functions.invoke('leaderboardPayoutConfig', { action: 'get' }),
        ])
            .then(([cfgRes, walletsRes, lbRes]) => {
                if (cfgRes.data?.error) throw new Error(cfgRes.data.error);
                setCurrent(cfgRes.data);
                const globalPct = cfgRes.data.pct ?? 0.02;
                setPctInput((globalPct * 100).toFixed(2));
                const wallets = (walletsRes.data?.records || []).filter(w => w.wallet_address);
                setStaffCount(wallets.length);
                // Sum effective pct per wallet (override OR global) — same logic
                // distributeStaffPayout uses, so the bar = real weekly cost.
                const effectiveSum = wallets.reduce((sum, w) => {
                    const o = w.payout_pct_override;
                    const eff = (o !== null && o !== undefined && isFinite(Number(o))) ? Number(o) : globalPct;
                    return sum + eff;
                }, 0);
                setLiveStaffTotalPct(effectiveSum);
                const lbCfg = lbRes.data?.config || {};
                setPoolPcts({
                    weekly:   lbCfg.weekly_pool_pct   ?? 0.15,
                    seasonal: lbCfg.seasonal_pool_pct ?? 0.20,
                    kill:     lbCfg.kill_pool_pct     ?? 0.05,
                });
            })
            .catch(e => setMsg(`✗ ${e.message}`))
            .finally(() => setLoading(false));
    }, [isOwner]);

    const numericPct = Number(pctInput) / 100;
    const globalPct = current?.pct ?? 0.02;
    // Preview staff total: each wallet WITHOUT an override would shift to the new
    // pct; wallets WITH overrides keep their override. We don't have per-wallet
    // detail here, so approximate by assuming all 5 use the global (matches
    // owner intuition since overrides are the exception, not the rule).
    const staffTotalPct = staffCount * numericPct;
    // Cap check applies to the PREVIEW value (what the owner is about to save)
    const weeklyAllocPct = poolPcts.weekly + poolPcts.kill + staffTotalPct;
    const isOverHardCap = weeklyAllocPct > HARD_CAP_PCT;
    const isValid = isFinite(numericPct) && numericPct >= 0 && numericPct <= 0.10 && !isOverHardCap;
    const changed = current && Math.abs(numericPct - current.pct) > 0.00001;

    const handleSave = async () => {
        setSaving(true); setMsg('');
        try {
            const res = await base44.functions.invoke('setStaffPayoutPct', {
                action: 'set',
                pct: numericPct,
                notes: notes.trim(),
                adminKey,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setCurrent(c => ({ ...c, pct: numericPct, notes: notes.trim() }));
            setMsg(`✓ Updated to ${(numericPct * 100).toFixed(2)}%`);
            setNotes('');
            setConfirmOpen(false);
        } catch (e) { setMsg(`✗ ${e.message}`); }
        setSaving(false);
    };

    if (!isOwner) {
        return (
            <div className="bg-[#0b0416]/80 border border-slate-700/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Settings size={16} /> Staff Payout %
                </h2>
                <div className="text-xs text-slate-400">
                    🔒 Hidden — owner permission required to view or change the staff payout percentage.
                </div>
            </div>
        );
    }

    return (
        <div className="bg-[#0b0416]/80 border border-amber-900/50 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <h2 className="text-base font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                    <Settings size={16} /> Staff Payout %
                </h2>
                <span className="text-[10px] text-slate-500 font-mono">Per-wallet share of the weekly OMENX pool</span>
            </div>

            {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /></div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <div className="bg-slate-900/60 border border-slate-700 rounded p-2.5">
                            <div className="text-[10px] text-slate-500 uppercase">Current</div>
                            <div className="text-base font-mono font-bold text-amber-400">{((current?.pct ?? 0.02) * 100).toFixed(2)}%</div>
                        </div>
                        <div className="bg-slate-900/60 border border-slate-700 rounded p-2.5">
                            <div className="text-[10px] text-slate-500 uppercase">Default</div>
                            <div className="text-base font-mono text-slate-400">{((current?.default ?? 0.02) * 100).toFixed(2)}%</div>
                        </div>
                        <div className="bg-slate-900/60 border border-slate-700 rounded p-2.5">
                            <div className="text-[10px] text-slate-500 uppercase">Hard Ceiling</div>
                            <div className="text-base font-mono text-slate-400">{((current?.max ?? 0.10) * 100).toFixed(2)}%</div>
                        </div>
                    </div>

                    <StaffPayoutAllocationPreview
                        weeklyPlayerPct={poolPcts.weekly}
                        seasonalPlayerPct={poolPcts.seasonal}
                        killPoolPct={poolPcts.kill}
                        squadChampionsPct={SQUAD_CHAMPIONS_PCT}
                        staffCount={staffCount}
                        numericPct={numericPct}
                        liveStaffTotalPct={liveStaffTotalPct}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-2 items-end">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase">New % per staff</span>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="10"
                                    value={pctInput}
                                    onChange={e => setPctInput(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-amber-500 pr-8"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">%</span>
                            </div>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase">Reason (audit log)</span>
                            <input
                                type="text"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="e.g. Adjusted after staff size change"
                                className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                            />
                        </label>
                        <button
                            disabled={!isValid || !changed || saving}
                            onClick={() => setConfirmOpen(true)}
                            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2 whitespace-nowrap"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                        </button>
                    </div>

                    {!isValid && !isOverHardCap && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400">
                            <AlertTriangle size={12} /> Must be between 0 and 10%.
                        </div>
                    )}
                    {msg && <div className={`mt-2 text-xs font-mono ${msg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</div>}

                    <div className="text-[10px] text-slate-500 mt-3 italic">
                        Changes apply to the <strong>next</strong> distribution run. Already-distributed weeks are unaffected.
                    </div>
                </>
            )}

            <ConfirmDialog
                open={confirmOpen}
                onClose={() => !saving && setConfirmOpen(false)}
                onConfirm={handleSave}
                busy={saving}
                title="Update staff payout %"
                description={`Change per-staff weekly payout from ${((current?.pct ?? 0.02) * 100).toFixed(2)}% to ${(numericPct * 100).toFixed(2)}%? This affects every staff wallet at the next weekly distribution.`}
                confirmLabel="Save change"
            />
        </div>
    );
}