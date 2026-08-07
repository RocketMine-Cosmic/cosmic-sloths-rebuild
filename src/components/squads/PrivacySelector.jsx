import React from 'react';
import { Globe, ShieldQuestion, Lock } from 'lucide-react';

const OPTIONS = [
    { id: 'open',    label: 'Open',         icon: Globe,         desc: 'Anyone can join instantly.' },
    { id: 'request', label: 'Invite-Only',  icon: ShieldQuestion,desc: 'Pilots must request to join — leader & officers approve.' },
    { id: 'closed',  label: 'Closed',       icon: Lock,          desc: 'No new members can join.' },
];

// Three-way privacy toggle used in the Settings tab.
export default function PrivacySelector({ value, onChange }) {
    const current = value || 'open';
    return (
        <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-400">Privacy</label>
            <div className="grid grid-cols-3 gap-2">
                {OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const active = current === opt.id;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => onChange(opt.id)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors text-center ${
                                active
                                    ? 'bg-orange-950/40 border-orange-500 text-orange-200 shadow-[0_0_12px_rgba(249,115,22,0.3)]'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            <span className="text-[11px] font-bold">{opt.label}</span>
                        </button>
                    );
                })}
            </div>
            <p className="text-[10px] text-slate-500 italic">
                {OPTIONS.find(o => o.id === current)?.desc}
            </p>
        </div>
    );
}