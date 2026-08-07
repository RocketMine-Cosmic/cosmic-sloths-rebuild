import React, { useEffect, useState, useRef } from 'react';
import { Cloud, CloudOff, Check, Loader2 } from 'lucide-react';

// Tiny status pill that reflects the SaveManager sync lifecycle.
// States: 'idle' | 'pending' | 'syncing' | 'saved' | 'error'
//
// Listens to events the SaveManager already dispatches:
//   - saveUpdated      → user just made a change (pending)
//   - saveSyncStart    → sync went out
//   - saveSyncSuccess  → sync ok
//   - syncFailed       → sync failed (existing event)
//
// Auto-hides 2s after a successful save.

export default function SaveStatusIndicator() {
    const [status, setStatus] = useState('idle');
    const [path, setPath] = useState(typeof window !== 'undefined' ? window.location.pathname : '');
    const hideTimerRef = useRef(null);
    const inGame = path === '/game';

    // Track route changes without depending on Router context (this component
    // is rendered outside <Router> in App.jsx).
    useEffect(() => {
        const update = () => setPath(window.location.pathname);
        window.addEventListener('popstate', update);
        const interval = setInterval(update, 500);
        return () => { window.removeEventListener('popstate', update); clearInterval(interval); };
    }, []);

    useEffect(() => {
        const clearHide = () => { if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; } };

        const hasWallet = () => {
            try {
                const a = JSON.parse(localStorage.getItem('omenx_auth_data'));
                return !!a?.walletAddress;
            } catch { return false; }
        };

        // Defer all setState calls to a microtask so we never update this
        // component during another component's render phase (events can be
        // dispatched synchronously inside SaveManager.save()).
        const defer = (fn) => queueMicrotask(fn);

        const onPending = () => defer(() => {
            // Don't show "Saving…" for anonymous users — there's no sync happening.
            if (!hasWallet()) return;
            clearHide();
            setStatus('pending');
            // Auto-clear after 5s if no sync is actually triggered (e.g. wallet not linked yet).
            hideTimerRef.current = setTimeout(() => {
                setStatus(s => (s === 'pending' ? 'idle' : s));
            }, 5000);
        });
        const onSyncing = () => defer(() => { clearHide(); setStatus('syncing'); });
        const onSaved = () => defer(() => {
            clearHide();
            setStatus('saved');
            hideTimerRef.current = setTimeout(() => setStatus('idle'), 2000);
        });
        const onError = () => defer(() => { clearHide(); setStatus('error'); });

        window.addEventListener('saveUpdated', onPending);
        window.addEventListener('saveSyncStart', onSyncing);
        window.addEventListener('saveSyncSuccess', onSaved);
        window.addEventListener('syncFailed', onError);

        return () => {
            clearHide();
            window.removeEventListener('saveUpdated', onPending);
            window.removeEventListener('saveSyncStart', onSyncing);
            window.removeEventListener('saveSyncSuccess', onSaved);
            window.removeEventListener('syncFailed', onError);
        };
    }, []);

    if (status === 'idle' || inGame) return null;

    const config = {
        pending: { icon: Cloud, text: 'Saving…', color: 'text-slate-300', bg: 'bg-slate-900/80', border: 'border-slate-600/50' },
        syncing: { icon: Loader2, text: 'Syncing', color: 'text-cyan-300', bg: 'bg-cyan-950/80', border: 'border-cyan-500/50', spin: true },
        saved:   { icon: Check, text: 'Saved', color: 'text-emerald-300', bg: 'bg-emerald-950/80', border: 'border-emerald-500/50' },
        error:   { icon: CloudOff, text: 'Save failed', color: 'text-red-300', bg: 'bg-red-950/80', border: 'border-red-500/50' },
    }[status];

    const Icon = config.icon;

    return (
        <div
            className={`fixed bottom-3 right-3 z-[60] flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-md text-[10px] font-bold uppercase tracking-wider shadow-lg pointer-events-none transition-opacity ${config.bg} ${config.border} ${config.color}`}
            title={config.text}
        >
            <Icon className={`w-3 h-3 ${config.spin ? 'animate-spin' : ''}`} />
            <span>{config.text}</span>
        </div>
    );
}