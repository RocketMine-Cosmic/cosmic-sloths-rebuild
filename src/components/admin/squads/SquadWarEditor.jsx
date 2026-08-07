import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Swords, Save, Loader2 } from 'lucide-react';
import moment from 'moment';

export default function SquadWarEditor({ squad, recentWars, onSaved }) {
    const [form, setForm] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [msg, setMsg] = useState(null);

    useEffect(() => {
        setForm({
            war_wins: squad.war_wins || 0,
            war_losses: squad.war_losses || 0,
            war_ties: squad.war_ties || 0,
            war_streak: squad.war_streak || 0,
        });
        setError(null); setMsg(null);
    }, [squad.id]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const save = async () => {
        setBusy(true); setError(null); setMsg(null);
        try {
            const res = await base44.functions.invoke('adminSquadOps', {
                action: 'updateWarRecord',
                squadId: squad.id,
                war_wins: Number(form.war_wins),
                war_losses: Number(form.war_losses),
                war_ties: Number(form.war_ties),
                war_streak: Number(form.war_streak),
            });
            if (!res.data?.success) throw new Error(res.data?.error || 'Save failed');
            setMsg('War record updated.');
            onSaved?.(res.data.squad);
        } catch (e) { setError(e?.response?.data?.error || e.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="bg-slate-900/40 border border-red-700/40 rounded-lg p-4 space-y-4">
            <h3 className="text-xs font-bold text-red-300 uppercase tracking-widest flex items-center gap-2"><Swords className="w-3.5 h-3.5" /> War Record</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <Field label="Wins"><input type="number" className={input} value={form.war_wins} onChange={e => set('war_wins', e.target.value)} /></Field>
                <Field label="Losses"><input type="number" className={input} value={form.war_losses} onChange={e => set('war_losses', e.target.value)} /></Field>
                <Field label="Ties"><input type="number" className={input} value={form.war_ties} onChange={e => set('war_ties', e.target.value)} /></Field>
                <Field label="Streak"><input type="number" className={input} value={form.war_streak} onChange={e => set('war_streak', e.target.value)} /></Field>
            </div>
            <div className="flex items-center gap-3">
                <button onClick={save} disabled={busy} className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider px-4 py-2 rounded flex items-center gap-1.5">
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Record
                </button>
                {error && <span className="text-red-400 text-xs">{error}</span>}
                {msg && <span className="text-emerald-400 text-xs">{msg}</span>}
            </div>

            <div className="border-t border-slate-700/40 pt-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Recent wars ({recentWars.length})</div>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {recentWars.map(w => {
                        const isA = w.squad_a_id === squad.id;
                        const myKills = isA ? w.kills_a : w.kills_b;
                        const oppKills = isA ? w.kills_b : w.kills_a;
                        const oppName = isA ? (w.squad_b_name || 'no opponent') : w.squad_a_name;
                        const resolved = w.is_resolved;
                        const won = w.winner_squad_id === squad.id;
                        const tied = resolved && !w.winner_squad_id && w.result_kind === 'tie';
                        return (
                            <div key={w.id} className="bg-slate-800/50 rounded px-2.5 py-1.5 flex items-center gap-2 text-[11px]">
                                <span className="font-mono text-slate-500">{w.week_id}</span>
                                <span className="text-white">vs {oppName}</span>
                                <span className="ml-auto font-mono">
                                    <span className="text-emerald-400">{myKills || 0}</span>
                                    <span className="text-slate-500"> – </span>
                                    <span className="text-red-400">{oppKills || 0}</span>
                                </span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    !resolved ? 'bg-slate-700 text-slate-300' :
                                    won ? 'bg-emerald-900/60 text-emerald-300' :
                                    tied ? 'bg-yellow-900/60 text-yellow-300' :
                                    'bg-red-900/60 text-red-300'
                                }`}>
                                    {!resolved ? 'live' : won ? 'win' : tied ? 'tie' : 'loss'}
                                </span>
                                <span className="text-slate-500 text-[10px]">{moment(w.created_date).fromNow()}</span>
                            </div>
                        );
                    })}
                    {!recentWars.length && <div className="text-slate-500 text-xs py-2 text-center">No wars.</div>}
                </div>
            </div>
        </div>
    );
}

const input = "bg-slate-950 border border-slate-700 text-white rounded px-2 py-1.5 text-xs w-full focus:outline-none focus:border-red-500";

function Field({ label, children }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-slate-400">{label}</span>
            {children}
        </label>
    );
}