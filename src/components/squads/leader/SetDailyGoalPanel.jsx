import React, { useState } from 'react';
import { Target, Check, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

// Daily goal setter — leader picks a kill target (or custom challenge text)
// + duration. The active goal gets broadcast to every member via DailyGoalBanner.
export default function SetDailyGoalPanel({ squadId, currentGoal, onChange }) {
    const { toast } = useToast();
    const [goalType, setGoalType] = useState('kills');
    const [target, setTarget] = useState(1500);
    const [label, setLabel] = useState('');
    const [hours, setHours] = useState(24);
    const [busy, setBusy] = useState(false);

    const handleSet = async () => {
        if (!squadId) return;
        const finalLabel = (label.trim() ||
            (goalType === 'kills' ? `Hit ${Number(target).toLocaleString()} kills today!` : '')).trim();
        if (!finalLabel) {
            toast({ title: 'Add a label', description: 'Tell your squad what the goal is.' });
            return;
        }
        setBusy(true);
        try {
            const res = await base44.functions.invoke('squadActions', {
                action: 'setDailyGoal',
                squadId,
                goalType,
                target,
                label: finalLabel,
                durationHours: hours,
            });
            if (res.data?.error) throw new Error(res.data.error);
            toast({ title: 'Goal broadcast!', description: 'Your squad will see the banner immediately.' });
            setLabel('');
            onChange?.(res.data?.goal || null);
        } catch (e) {
            toast({ title: 'Failed to set goal', description: e.message || 'Try again.' });
        } finally {
            setBusy(false);
        }
    };

    const handleClear = async () => {
        if (!squadId) return;
        setBusy(true);
        try {
            const res = await base44.functions.invoke('squadActions', { action: 'clearDailyGoal', squadId });
            if (res.data?.error) throw new Error(res.data.error);
            toast({ title: 'Goal cleared', description: 'The banner is now hidden.' });
            onChange?.(null);
        } catch (e) {
            toast({ title: 'Failed to clear goal', description: e.message || 'Try again.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-[#0b0416]/80 border border-amber-700/50 rounded-xl p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm md:text-base font-bold text-amber-300 uppercase tracking-widest">Daily Squad Goal</h3>
            </div>

            {currentGoal ? (
                <div className="bg-amber-950/30 border border-amber-700/40 rounded-lg p-3 mb-3">
                    <div className="text-[10px] uppercase tracking-widest text-amber-500/80 mb-1">Active goal</div>
                    <div className="text-sm font-bold text-amber-200">{currentGoal.label}</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                        Set by <span className="text-white">{currentGoal.set_by_name}</span>
                        {currentGoal.expires_at && (
                            <> · expires {new Date(currentGoal.expires_at).toLocaleString()}</>
                        )}
                    </div>
                    <button
                        onClick={handleClear}
                        disabled={busy}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs text-rose-300 hover:text-rose-200 bg-rose-950/40 border border-rose-800/50 rounded px-2 py-1 disabled:opacity-50"
                    >
                        <X className="w-3 h-3" /> Clear goal
                    </button>
                </div>
            ) : (
                <div className="text-xs text-slate-500 mb-3 italic">No active goal. Set one to rally your squad.</div>
            )}

            <div className="space-y-3">
                <div className="flex gap-2">
                    <button
                        onClick={() => setGoalType('kills')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${goalType === 'kills' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                        🎯 Kill Target
                    </button>
                    <button
                        onClick={() => setGoalType('custom')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${goalType === 'custom' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                        ✏️ Custom
                    </button>
                </div>

                {goalType === 'kills' && (
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Kill target</label>
                        <input
                            type="number"
                            min={1}
                            max={100000}
                            value={target}
                            onChange={(e) => setTarget(Number(e.target.value) || 0)}
                            className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                        />
                    </div>
                )}

                <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                        Banner message {goalType === 'kills' && <span className="text-slate-600">(optional — auto-generated)</span>}
                    </label>
                    <input
                        type="text"
                        maxLength={120}
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder={goalType === 'kills' ? `Hit ${Number(target).toLocaleString()} kills today!` : 'e.g. Beat Sector 5 today'}
                        className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                </div>

                <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Duration</label>
                    <div className="flex gap-2 mt-1">
                        {[6, 12, 24, 48].map(h => (
                            <button
                                key={h}
                                onClick={() => setHours(h)}
                                className={`flex-1 px-2 py-1.5 rounded text-xs font-bold transition-colors ${hours === h ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                            >
                                {h}h
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleSet}
                    disabled={busy}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                    <Check className="w-4 h-4" /> Broadcast Goal to Squad
                </button>
            </div>
        </div>
    );
}