import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Save, Loader2 } from 'lucide-react';

// Edits the squad's core identity + stat fields. Each field is intentionally
// editable so admin can fix corrupted rows (e.g. orphaned tag, wrong XP, stale
// member_count). Server validates & clamps; this is just the form.
export default function SquadCoreEditor({ squad, onSaved }) {
    const [form, setForm] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [msg, setMsg] = useState(null);

    useEffect(() => {
        setForm({
            name: squad.name || '',
            tag: squad.tag || '',
            icon: squad.icon || '',
            description: squad.description || '',
            privacy: squad.privacy || 'open',
            level: squad.level || 1,
            xp: squad.xp || 0,
            weekly_kills: squad.weekly_kills || 0,
            daily_kills: squad.daily_kills || 0,
            member_count: squad.member_count || 0,
        });
        setError(null);
        setMsg(null);
    }, [squad.id]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const save = async () => {
        setBusy(true); setError(null); setMsg(null);
        try {
            const payload = {
                action: 'updateCore',
                squadId: squad.id,
                ...form,
                level: Number(form.level),
                xp: Number(form.xp),
                weekly_kills: Number(form.weekly_kills),
                daily_kills: Number(form.daily_kills),
                member_count: Number(form.member_count),
            };
            const res = await base44.functions.invoke('adminSquadOps', payload);
            if (!res.data?.success) throw new Error(res.data?.error || 'Save failed');
            setMsg('Saved.');
            onSaved?.(res.data.squad);
        } catch (e) {
            setError(e?.response?.data?.error || e.message);
        } finally {
            setBusy(false);
        }
    };

    const reconcile = async () => {
        setBusy(true); setError(null); setMsg(null);
        try {
            const res = await base44.functions.invoke('adminSquadOps', { action: 'reconcileMemberCount', squadId: squad.id });
            if (!res.data?.success) throw new Error(res.data?.error || 'Reconcile failed');
            setMsg(`member_count → ${res.data.member_count}`);
            onSaved?.(res.data.squad);
        } catch (e) {
            setError(e?.response?.data?.error || e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-widest mb-3">Core Identity & Stats</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <Field label="Name"><input className={input} value={form.name} onChange={e => set('name', e.target.value)} /></Field>
                <Field label="Tag"><input className={input} value={form.tag} onChange={e => set('tag', e.target.value)} maxLength={4} /></Field>
                <Field label="Icon (emoji)"><input className={input} value={form.icon} onChange={e => set('icon', e.target.value)} /></Field>
                <Field label="Privacy">
                    <select className={input} value={form.privacy} onChange={e => set('privacy', e.target.value)}>
                        <option value="open">open</option>
                        <option value="request">request</option>
                        <option value="closed">closed</option>
                    </select>
                </Field>
                <Field label="Level"><input type="number" className={input} value={form.level} onChange={e => set('level', e.target.value)} /></Field>
                <Field label="XP"><input type="number" className={input} value={form.xp} onChange={e => set('xp', e.target.value)} /></Field>
                <Field label="Weekly kills"><input type="number" className={input} value={form.weekly_kills} onChange={e => set('weekly_kills', e.target.value)} /></Field>
                <Field label="Daily kills"><input type="number" className={input} value={form.daily_kills} onChange={e => set('daily_kills', e.target.value)} /></Field>
                <Field label="Member count (cached)">
                    <div className="flex gap-1">
                        <input type="number" className={input} value={form.member_count} onChange={e => set('member_count', e.target.value)} />
                        <button onClick={reconcile} disabled={busy} title="Recount from actual SquadMember rows" className="bg-slate-700 hover:bg-slate-600 text-white text-[10px] px-2 rounded disabled:opacity-50">Sync</button>
                    </div>
                </Field>
                <Field label="Description" wide>
                    <textarea className={`${input} h-16`} value={form.description} onChange={e => set('description', e.target.value)} />
                </Field>
            </div>
            <div className="mt-3 flex items-center gap-3">
                <button onClick={save} disabled={busy} className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider px-4 py-2 rounded flex items-center gap-1.5">
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Core
                </button>
                {error && <span className="text-red-400 text-xs">{error}</span>}
                {msg && <span className="text-emerald-400 text-xs">{msg}</span>}
            </div>
        </div>
    );
}

const input = "bg-slate-950 border border-slate-700 text-white rounded px-2 py-1.5 text-xs w-full focus:outline-none focus:border-cyan-500";

function Field({ label, children, wide }) {
    return (
        <label className={`flex flex-col gap-1 ${wide ? 'col-span-2 md:col-span-3' : ''}`}>
            <span className="text-[10px] uppercase tracking-widest text-slate-400">{label}</span>
            {children}
        </label>
    );
}