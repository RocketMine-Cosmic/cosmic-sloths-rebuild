import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, Trash2, AlertTriangle } from 'lucide-react';

export default function AdminOrphanedData({ walletAddress }) {
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [cleaning, setCleaning] = useState(false);
    const [msg, setMsg] = useState('');

    const runScan = async () => {
        setLoading(true); setResults(null); setMsg('');
        try {
            const [squads, members] = await Promise.all([
                base44.entities.Squad.list('-created_date', 500),
                base44.entities.SquadMember.list('-created_date', 1000),
            ]);
            const squadIds = new Set(squads.map(s => s.id));
            const orphanedMembers = members.filter(m => !squadIds.has(m.squad_id));
            setResults({ orphanedMembers, total: orphanedMembers.length });
        } catch (e) {
            setMsg(`✗ ${e.message}`);
        }
        setLoading(false);
    };

    const cleanOrphans = async () => {
        if (!results?.orphanedMembers?.length) return;
        setCleaning(true); setMsg('');
        try {
            for (const m of results.orphanedMembers) {
                await base44.entities.SquadMember.delete(m.id);
            }
            await base44.entities.AdminChangesLog.create({
                wallet_address: walletAddress,
                action_type: 'other',
                description: `Cleaned ${results.orphanedMembers.length} orphaned squad members`,
                details: { count: results.orphanedMembers.length }
            });
            setMsg(`✓ Cleaned ${results.orphanedMembers.length} orphaned records`);
            setResults(null);
        } catch (e) {
            setMsg(`✗ ${e.message}`);
        }
        setCleaning(false);
    };

    return (
        <div className="bg-[#0b0416]/80 border border-orange-900/50 rounded-xl p-4">
            <h2 className="text-base font-bold text-orange-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <AlertTriangle size={16} /> Orphaned Data Cleaner
            </h2>
            <div className="text-xs text-slate-400 mb-4">
                Scans for squad members that belong to deleted squads, and other dangling records.
            </div>

            <div className="flex items-center gap-3 mb-4">
                <button onClick={runScan} disabled={loading}
                    className="bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2 transition-colors">
                    <Search size={14} /> {loading ? 'Scanning...' : 'Run Scan'}
                </button>
                {msg && <span className={`text-xs font-mono ${msg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</span>}
            </div>

            {results !== null && (
                <div className="space-y-3">
                    <div className={`rounded-lg p-4 border ${results.total === 0 ? 'bg-emerald-950/30 border-emerald-700/50' : 'bg-orange-950/30 border-orange-700/50'}`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className={`font-bold text-sm ${results.total === 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                    {results.total === 0 ? '✓ No orphaned records found' : `⚠️ ${results.total} orphaned squad members found`}
                                </div>
                                {results.total > 0 && (
                                    <div className="text-xs text-slate-400 mt-1">These are members whose squad no longer exists.</div>
                                )}
                            </div>
                            {results.total > 0 && (
                                <button onClick={cleanOrphans} disabled={cleaning}
                                    className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2 transition-colors">
                                    <Trash2 size={14} /> {cleaning ? 'Cleaning...' : 'Clean All'}
                                </button>
                            )}
                        </div>
                        {results.orphanedMembers?.length > 0 && (
                            <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                                {results.orphanedMembers.map(m => (
                                    <div key={m.id} className="flex justify-between text-[10px] py-0.5 border-b border-orange-900/30 last:border-0">
                                        <span className="text-white font-mono">{m.player_name}</span>
                                        <span className="text-slate-500 font-mono">squad: {m.squad_id?.slice(0, 8)}...</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}