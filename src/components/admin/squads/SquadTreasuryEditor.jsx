import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Vault, Save, Loader2, Sparkles } from 'lucide-react';

const TIERS = ['', 'bronze', 'silver', 'gold', 'platinum'];

// ISO week id of "now" — used to suggest the current/next week when stamping
// buffs. Mirrors the server formula in squadActions.
function currentWeekId() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
}
function nextWeekId(wk) {
    const m = wk.match(/^(\d{4})-W(\d{2})$/);
    if (!m) return wk;
    const y = +m[1], w = +m[2];
    if (w >= 52) return `${y + 1}-W01`;
    return `${y}-W${String(w + 1).padStart(2, '0')}`;
}

export default function SquadTreasuryEditor({ squad, onSaved }) {
    const thisWeek = currentWeekId();
    const nextWeek = nextWeekId(thisWeek);

    const [gold, setGold] = useState(squad.treasury_gold || 0);
    const [donated, setDonated] = useState(squad.treasury_total_donated || 0);
    const [activeTier, setActiveTier] = useState(squad.active_buff_tier || '');
    const [activeWeek, setActiveWeek] = useState(squad.active_buff_week_id || '');
    const [pendingTier, setPendingTier] = useState(squad.pending_buff_tier || '');
    const [pendingWeek, setPendingWeek] = useState(squad.pending_buff_week_id || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [msg, setMsg] = useState(null);

    useEffect(() => {
        setGold(squad.treasury_gold || 0);
        setDonated(squad.treasury_total_donated || 0);
        setActiveTier(squad.active_buff_tier || '');
        setActiveWeek(squad.active_buff_week_id || '');
        setPendingTier(squad.pending_buff_tier || '');
        setPendingWeek(squad.pending_buff_week_id || '');
        setError(null); setMsg(null);
    }, [squad.id]);

    const saveGold = async () => {
        setBusy(true); setError(null); setMsg(null);
        try {
            const res = await base44.functions.invoke('adminSquadOps', {
                action: 'updateTreasuryGold', squadId: squad.id,
                treasury_gold: Number(gold), treasury_total_donated: Number(donated),
            });
            if (!res.data?.success) throw new Error(res.data?.error || 'Save failed');
            setMsg('Gold updated.');
            onSaved?.(res.data.squad);
        } catch (e) { setError(e?.response?.data?.error || e.message); }
        finally { setBusy(false); }
    };

    const saveBuffs = async () => {
        setBusy(true); setError(null); setMsg(null);
        try {
            const res = await base44.functions.invoke('adminSquadOps', {
                action: 'setBuffs', squadId: squad.id,
                active_buff_tier: activeTier,
                active_buff_week_id: activeTier ? activeWeek : '',
                pending_buff_tier: pendingTier,
                pending_buff_week_id: pendingTier ? pendingWeek : '',
            });
            if (!res.data?.success) throw new Error(res.data?.error || 'Save failed');
            setMsg('Buffs updated.');
            onSaved?.(res.data.squad);
        } catch (e) { setError(e?.response?.data?.error || e.message); }
        finally { setBusy(false); }
    };

    const clearAll = async () => {
        if (!confirm('Clear BOTH active and pending buffs for this squad?')) return;
        setActiveTier(''); setActiveWeek(''); setPendingTier(''); setPendingWeek('');
        setBusy(true); setError(null); setMsg(null);
        try {
            const res = await base44.functions.invoke('adminSquadOps', {
                action: 'setBuffs', squadId: squad.id,
                active_buff_tier: '', active_buff_week_id: '',
                pending_buff_tier: '', pending_buff_week_id: '',
            });
            if (!res.data?.success) throw new Error(res.data?.error || 'Clear failed');
            setMsg('Buffs cleared.');
            onSaved?.(res.data.squad);
        } catch (e) { setError(e?.response?.data?.error || e.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="bg-slate-900/40 border border-amber-700/40 rounded-lg p-4 space-y-4">
            <h3 className="text-xs font-bold text-amber-300 uppercase tracking-widest flex items-center gap-2"><Vault className="w-3.5 h-3.5" /> Treasury & Buffs</h3>

            {/* Gold pool */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <Field label="Treasury gold (pool)">
                    <input type="number" className={input} value={gold} onChange={e => setGold(e.target.value)} />
                </Field>
                <Field label="Lifetime donated (display only)">
                    <input type="number" className={input} value={donated} onChange={e => setDonated(e.target.value)} />
                </Field>
                <div className="flex items-end">
                    <button onClick={saveGold} disabled={busy} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded flex items-center gap-1.5">
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Gold
                    </button>
                </div>
            </div>

            <div className="border-t border-slate-700/40 pt-3">
                <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                    <span className="text-[10px] uppercase tracking-widest text-emerald-300 font-bold">Active buff (THIS week)</span>
                    <span className="text-[10px] text-slate-500 ml-auto">Current week: <span className="text-slate-300 font-mono">{thisWeek}</span></span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="Tier">
                        <select className={input} value={activeTier} onChange={e => setActiveTier(e.target.value)}>
                            {TIERS.map(t => <option key={`a-${t}`} value={t}>{t || '— none —'}</option>)}
                        </select>
                    </Field>
                    <Field label="Week id">
                        <input className={input} placeholder="2026-W25" value={activeWeek} onChange={e => setActiveWeek(e.target.value)} disabled={!activeTier} />
                    </Field>
                    <div className="flex items-end gap-1">
                        <button type="button" onClick={() => setActiveWeek(thisWeek)} className="text-[10px] bg-slate-700 hover:bg-slate-600 px-2 py-1.5 rounded text-white">This week</button>
                    </div>
                </div>
            </div>

            <div className="border-t border-slate-700/40 pt-3">
                <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                    <span className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold">Pending buff (FUTURE week)</span>
                    <span className="text-[10px] text-slate-500 ml-auto">Next week: <span className="text-slate-300 font-mono">{nextWeek}</span></span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="Tier">
                        <select className={input} value={pendingTier} onChange={e => setPendingTier(e.target.value)}>
                            {TIERS.map(t => <option key={`p-${t}`} value={t}>{t || '— none —'}</option>)}
                        </select>
                    </Field>
                    <Field label="Week id">
                        <input className={input} placeholder="2026-W26" value={pendingWeek} onChange={e => setPendingWeek(e.target.value)} disabled={!pendingTier} />
                    </Field>
                    <div className="flex items-end gap-1">
                        <button type="button" onClick={() => setPendingWeek(nextWeek)} className="text-[10px] bg-slate-700 hover:bg-slate-600 px-2 py-1.5 rounded text-white">Next week</button>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <button onClick={saveBuffs} disabled={busy} className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider px-4 py-2 rounded flex items-center gap-1.5">
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Buffs
                </button>
                <button onClick={clearAll} disabled={busy} className="bg-red-900/70 hover:bg-red-800 disabled:opacity-50 text-red-100 font-bold text-xs uppercase tracking-wider px-3 py-2 rounded">
                    Clear Both
                </button>
                {error && <span className="text-red-400 text-xs">{error}</span>}
                {msg && <span className="text-emerald-400 text-xs">{msg}</span>}
            </div>
            <p className="text-[10px] text-slate-500 italic leading-snug">
                Empty tier = slot cleared. Week id format <code className="text-slate-300">YYYY-Www</code> (e.g. <code className="text-slate-300">2026-W25</code>). Pending buffs auto-promote to active on week rollover via <code className="text-slate-300">resetPeriods</code>.
            </p>
        </div>
    );
}

const input = "bg-slate-950 border border-slate-700 text-white rounded px-2 py-1.5 text-xs w-full focus:outline-none focus:border-amber-500 disabled:opacity-40";

function Field({ label, children }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-slate-400">{label}</span>
            {children}
        </label>
    );
}