import React, { useEffect, useState } from 'react';
import { VolumeX, X } from 'lucide-react';

// Mute duration picker. Used from AdminSquadChatModeration.
const PRESETS = [
    { label: '10 min', minutes: 10 },
    { label: '1 hour', minutes: 60 },
    { label: '6 hours', minutes: 360 },
    { label: '24 hours', minutes: 1440 },
    { label: '7 days', minutes: 10080 },
    { label: 'Permanent', minutes: 0 },
];

export default function MuteWalletDialog({ open, target, onClose, onConfirm, busy }) {
    const [minutes, setMinutes] = useState(60);
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (open) { setMinutes(60); setReason(''); }
    }, [open]);

    if (!open || !target) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#0b0416] border-2 border-orange-700 rounded-xl shadow-[0_0_40px_rgba(234,88,12,0.3)]">
                <div className="flex items-start justify-between p-4 border-b border-orange-900/50">
                    <div className="flex items-center gap-2">
                        <VolumeX className="w-5 h-5 text-orange-400" />
                        <h3 className="text-base font-bold text-orange-400 uppercase tracking-widest">Mute from squad chat</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
                </div>
                <div className="p-4 space-y-3">
                    <div className="bg-slate-900/60 border border-orange-900/40 rounded p-2 text-xs">
                        <div className="text-white font-bold">{target.player_name}</div>
                        <div className="text-slate-500 font-mono text-[10px] break-all">{target.wallet_address}</div>
                    </div>

                    <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Duration</label>
                        <div className="grid grid-cols-3 gap-1.5 mt-1">
                            {PRESETS.map(p => (
                                <button
                                    key={p.label}
                                    type="button"
                                    onClick={() => setMinutes(p.minutes)}
                                    className={`text-xs py-1.5 rounded font-bold border transition-colors ${
                                        minutes === p.minutes
                                            ? 'bg-orange-600 border-orange-500 text-white'
                                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                                    }`}
                                >{p.label}</button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Reason (optional)</label>
                        <input
                            type="text" value={reason} onChange={e => setReason(e.target.value)} maxLength={200}
                            placeholder="e.g. spam, harassment…"
                            className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-orange-500"
                        />
                    </div>
                </div>
                <div className="flex gap-2 p-4 border-t border-orange-900/50">
                    <button onClick={onClose} disabled={busy}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold py-2 rounded text-sm">
                        Cancel
                    </button>
                    <button onClick={() => onConfirm({ minutes, reason })} disabled={busy}
                        className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-bold py-2 rounded text-sm">
                        {busy ? 'Working…' : (minutes === 0 ? 'Mute permanently' : 'Mute')}
                    </button>
                </div>
            </div>
        </div>
    );
}