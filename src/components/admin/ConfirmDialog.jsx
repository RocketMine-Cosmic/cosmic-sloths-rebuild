import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Generic admin confirmation dialog.
 * - Shows a clear danger summary + optional payload preview.
 * - If `confirmText` is provided, user must type it exactly to enable the confirm button.
 * - Calls `onConfirm` then closes.
 */
export default function ConfirmDialog({
    open, onClose, onConfirm,
    title = 'Confirm action',
    description,
    confirmText,           // optional — require typing this string to enable confirm
    confirmLabel = 'Confirm',
    items,                 // optional array of strings to preview what will be affected
    busy = false,
}) {
    const [typed, setTyped] = useState('');
    useEffect(() => { if (open) setTyped(''); }, [open]);
    if (!open) return null;

    const canConfirm = !busy && (!confirmText || typed.trim() === confirmText);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#0b0416] border-2 border-red-700 rounded-xl shadow-[0_0_40px_rgba(239,68,68,0.3)]">
                <div className="flex items-start justify-between p-4 border-b border-red-900/50">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                        <h3 className="text-base font-bold text-red-400 uppercase tracking-widest">{title}</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
                </div>
                <div className="p-4 space-y-3">
                    {description && <p className="text-sm text-slate-300 leading-relaxed">{description}</p>}
                    {items && items.length > 0 && (
                        <div className="bg-slate-900/60 border border-red-900/40 rounded p-2 max-h-48 overflow-y-auto">
                            {items.map((it, i) => (
                                <div key={i} className="text-[11px] font-mono text-slate-400 py-0.5 border-b border-slate-800 last:border-0">
                                    {it}
                                </div>
                            ))}
                        </div>
                    )}
                    {confirmText && (
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                                Type <span className="text-red-400 font-mono">{confirmText}</span> to confirm:
                            </label>
                            <input
                                type="text" value={typed} onChange={e => setTyped(e.target.value)} autoFocus
                                className="mt-1 w-full bg-slate-900 border border-red-700 text-white rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-red-500"
                            />
                        </div>
                    )}
                </div>
                <div className="flex gap-2 p-4 border-t border-red-900/50">
                    <button onClick={onClose} disabled={busy}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold py-2 rounded text-sm">
                        Cancel
                    </button>
                    <button onClick={onConfirm} disabled={!canConfirm}
                        className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 rounded text-sm">
                        {busy ? 'Working…' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}