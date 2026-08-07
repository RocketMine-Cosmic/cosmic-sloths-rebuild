import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

// Admin panel for the forced-update gate.
// Sets AppConfig row 'min_client_version'. Clients running an older APP_VERSION
// see a blocking "Update Required" modal within ~60s (or instantly on tab focus).
// Set version to blank to clear the gate.
export default function AdminMinClientVersion() {
    const [current, setCurrent] = useState({ version: '', message: '' });
    const [draftVersion, setDraftVersion] = useState('');
    const [draftMessage, setDraftMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [ok, setOk] = useState('');
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), 5000);
        return () => clearTimeout(t);
    }, [armed]);

    const refresh = async () => {
        try {
            const res = await base44.functions.invoke('getMaintenanceMode', {});
            const v = res.data?.minClientVersion || '';
            const m = res.data?.minClientVersionMessage || '';
            setCurrent({ version: v, message: m });
            setDraftVersion(v);
            setDraftMessage(m);
        } catch { /* noop */ }
    };

    useEffect(() => { refresh(); }, []);

    const handleSave = async () => {
        if (busy) return;
        if (!armed) { setArmed(true); setErr(''); setOk(''); return; }
        setArmed(false);
        setBusy(true); setErr(''); setOk('');
        try {
            const res = await base44.functions.invoke('setMinClientVersion', {
                version: draftVersion.trim(),
                message: draftMessage,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setOk(draftVersion.trim()
                ? `Min client version set to v${draftVersion.trim()}`
                : 'Forced-update gate cleared');
            await refresh();
            setTimeout(() => setOk(''), 3000);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed');
        }
        setBusy(false);
    };

    const isClearing = !draftVersion.trim() && !!current.version;
    const isCurrentBuild = draftVersion.trim() === APP_VERSION;

    return (
        <div className="bg-[#0b0416]/80 border border-cyan-900/50 rounded-xl p-4 space-y-4">
            <div>
                <h2 className="text-base font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                    <RefreshCw size={16} /> Forced Update Gate
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                    Blocks players running an old client until they reload. Use after shipping a new build.
                </p>
            </div>

            <div className="rounded-lg border border-cyan-700/50 bg-cyan-950/30 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest font-bold text-cyan-300/70">Currently required</div>
                <div className="font-black text-lg text-cyan-200">
                    {current.version ? `v${current.version}` : 'No gate'}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                    This build: <span className="font-mono text-slate-200">v{APP_VERSION}</span>
                </div>
                {current.message && <div className="text-xs italic text-slate-400 mt-1">"{current.message}"</div>}
            </div>

            <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                    Minimum version (blank = no gate)
                </label>
                <input
                    type="text"
                    value={draftVersion}
                    onChange={e => setDraftVersion(e.target.value)}
                    placeholder="e.g. 1.0.2"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cyan-500"
                />
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    <button onClick={() => setDraftVersion(APP_VERSION)}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded">
                        Use current build (v{APP_VERSION})
                    </button>
                    <button onClick={() => setDraftVersion('')}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded">
                        Clear gate
                    </button>
                </div>
            </div>

            <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                    Player-facing message (optional, max 280)
                </label>
                <textarea
                    value={draftMessage}
                    onChange={e => setDraftMessage(e.target.value)}
                    maxLength={280}
                    rows={2}
                    placeholder="A new version of Cosmic Sloths is available. Please reload to continue playing."
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-cyan-500 resize-none"
                />
            </div>

            <button
                onClick={handleSave}
                disabled={busy}
                className={`w-full ${armed
                    ? 'bg-cyan-500 ring-2 ring-cyan-300 animate-pulse'
                    : isClearing ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-cyan-700 hover:bg-cyan-600'}
                    disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded font-black text-xs uppercase tracking-widest transition-all`}
            >
                {armed
                    ? 'Tap again to confirm'
                    : isClearing ? '✓ Clear forced-update gate' : `🔒 Require v${draftVersion.trim() || '?'}`}
            </button>
            {armed && (
                <div className="text-[11px] text-cyan-300 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Tap again within 5s to confirm.
                </div>
            )}
            {ok && <div className="text-xs text-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={12} /> {ok}</div>}
            {err && <div className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle size={12} /> {err}</div>}

            <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-400 leading-relaxed space-y-2">
                <div className="font-bold text-slate-300">📖 How to ship a forced update</div>
                <div className="pl-1 space-y-1">
                    <div>1. Bump <span className="font-mono text-slate-200">APP_VERSION</span> in <span className="font-mono">lib/version.js</span> and deploy the new build.</div>
                    <div>2. Come here and set "Minimum version" to that same number → save.</div>
                    <div>3. Old clients see a blocking "Update Required" modal within ~60s (instant on tab focus) and can only reload.</div>
                    <div className="text-amber-400 italic">⚠️ Don't gate a version higher than what you shipped — you'll lock everyone out including yourself (admins bypass, but only after sign-in).</div>
                </div>
                {isCurrentBuild && draftVersion && (
                    <div className="text-cyan-300 italic">ℹ️ You're about to require the version this admin panel is running. Safe.</div>
                )}
            </div>
        </div>
    );
}