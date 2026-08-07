import React, { useState } from 'react';
import { AlertTriangle, Skull } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import ConfirmDialog from './ConfirmDialog';

export default function AdminDataWipe({ walletAddress }) {
    const { toast } = useToast();
    // Single source of truth — same key the rest of the dashboard uses
    const adminKey = sessionStorage.getItem('admin_key') || '';

    // Standard wipe state
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);

    // Full nuke state
    const [nukeConfirm, setNukeConfirm] = useState('');
    const [nukeLoading, setNukeLoading] = useState(false);
    const [nukeResults, setNukeResults] = useState(null);
    const [nukeDialogOpen, setNukeDialogOpen] = useState(false);

    const handleWipe = async (e) => {
        e.preventDefault();
        if (confirm !== 'RESET_ALL_PLAYER_DATA') {
            toast({ title: 'Wrong confirmation', description: 'Type exactly: RESET_ALL_PLAYER_DATA', variant: 'destructive' });
            return;
        }
        setLoading(true);
        setResults(null);
        try {
            const res = await base44.functions.invoke('resetAllPlayerData', { adminKey, confirm });
            if (res.data?.error) throw new Error(res.data.error);
            setResults(res.data.deleted);
            toast({ title: '✅ Wipe Complete', description: 'All player data has been deleted.' });
        } catch (err) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
        setLoading(false);
    };

    const startNuke = (e) => {
        e.preventDefault();
        if (nukeConfirm !== 'NUKE_EVERYTHING_INCLUDING_USERS') {
            toast({ title: 'Wrong confirmation', description: 'Type exactly: NUKE_EVERYTHING_INCLUDING_USERS', variant: 'destructive' });
            return;
        }
        setNukeDialogOpen(true);
    };

    const runNuke = async () => {
        setNukeLoading(true);
        setNukeResults(null);
        try {
            const res = await base44.functions.invoke('fullWipeIncludingUsers', { adminKey, confirm: nukeConfirm });
            if (res.data?.error) throw new Error(res.data.error);
            setNukeResults(res.data.deleted);
            toast({ title: '☢️ Full Nuke Complete', description: 'All data + non-admin users deleted.' });
            setNukeDialogOpen(false);
        } catch (err) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
        setNukeLoading(false);
    };

    return (
        <div className="max-w-xl space-y-8">

            {/* ───────── STANDARD WIPE ───────── */}
            <section>
                <div className="bg-red-950/40 border-2 border-red-600 rounded-xl p-5 flex items-start gap-3 mb-4">
                    <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                    <div>
                        <h2 className="text-red-400 font-black uppercase tracking-widest mb-1">⚠️ Wipe Player Data</h2>
                        <p className="text-slate-300 text-sm">Permanently deletes <strong>all</strong> RunScores, PlayerSaves, TokenPools, SpendLogs, PayoutLogs, Squads, Members, Messages, GlobalBosses, Contributions, and Events. <strong>Base44 user accounts are kept.</strong> This cannot be undone.</p>
                    </div>
                </div>

                <form onSubmit={handleWipe} className="bg-slate-900/60 border border-slate-700 rounded-xl p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">Type to confirm</label>
                        <input
                            type="text"
                            value={confirm}
                            onChange={e => setConfirm(e.target.value)}
                            placeholder="RESET_ALL_PLAYER_DATA"
                            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono outline-none focus:border-red-500"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading || confirm !== 'RESET_ALL_PLAYER_DATA'}
                        className="w-full bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-lg uppercase tracking-widest transition-colors"
                    >
                        {loading ? 'Wiping...' : '🗑️ Wipe Player Data'}
                    </button>
                </form>

                {results && (
                    <div className="bg-slate-900/60 border border-emerald-700 rounded-xl p-4 mt-4">
                        <h3 className="text-emerald-400 font-bold mb-2">Deleted Records</h3>
                        <div className="space-y-1">
                            {Object.entries(results).map(([entity, count]) => (
                                <div key={entity} className="flex justify-between text-sm">
                                    <span className="text-slate-400">{entity}</span>
                                    <span className="text-white font-mono">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            {/* ───────── FULL NUKE ───────── */}
            <section>
                <div className="bg-fuchsia-950/40 border-2 border-fuchsia-600 rounded-xl p-5 flex items-start gap-3 mb-4">
                    <Skull className="w-6 h-6 text-fuchsia-400 shrink-0 mt-0.5" />
                    <div>
                        <h2 className="text-fuchsia-400 font-black uppercase tracking-widest mb-1">☢️ FULL NUKE — Data + Base44 Users</h2>
                        <p className="text-slate-300 text-sm">
                            Wipes everything above <strong>plus deletes every Base44 user account</strong> except admins.
                            All players will be logged out and must re-register from scratch.
                            <strong className="text-fuchsia-300"> This is irreversible.</strong>
                        </p>
                    </div>
                </div>

                <form onSubmit={startNuke} className="bg-slate-900/60 border border-fuchsia-900/60 rounded-xl p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">Type to confirm</label>
                        <input
                            type="text"
                            value={nukeConfirm}
                            onChange={e => setNukeConfirm(e.target.value)}
                            placeholder="NUKE_EVERYTHING_INCLUDING_USERS"
                            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono outline-none focus:border-fuchsia-500"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={nukeLoading || nukeConfirm !== 'NUKE_EVERYTHING_INCLUDING_USERS'}
                        className="w-full bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-lg uppercase tracking-widest transition-colors"
                    >
                        {nukeLoading ? 'Nuking everything...' : '☢️ Full Nuke (Data + Users)'}
                    </button>
                </form>

                {nukeResults && (
                    <div className="bg-slate-900/60 border border-fuchsia-700 rounded-xl p-4 mt-4">
                        <h3 className="text-fuchsia-400 font-bold mb-2">Nuke Results</h3>
                        <div className="space-y-1">
                            {Object.entries(nukeResults).map(([entity, count]) => (
                                <div key={entity} className="flex justify-between text-sm">
                                    <span className="text-slate-400">{entity}</span>
                                    <span className="text-white font-mono">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            <ConfirmDialog
                open={nukeDialogOpen}
                onClose={() => !nukeLoading && setNukeDialogOpen(false)}
                onConfirm={runNuke}
                busy={nukeLoading}
                title="☢️ FINAL WARNING — Full Nuke"
                description="This deletes EVERY Base44 user account except admins, plus all game data. Players will be logged out and must re-register from scratch. There is no recovery."
                items={[
                    'All PlayerSaves, RunScores, Squads, Messages',
                    'All TokenPools, SpendLogs, PayoutLogs',
                    'All non-admin Base44 user accounts',
                ]}
                confirmText="NUKE_EVERYTHING_INCLUDING_USERS"
                confirmLabel="Nuke everything"
            />
        </div>
    );
}