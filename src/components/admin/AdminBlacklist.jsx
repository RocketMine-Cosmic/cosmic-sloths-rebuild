import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Trash2, Plus, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PlayerSearchInput from './PlayerSearchInput';
import ConfirmDialog from './ConfirmDialog';

function getAdminKey() { return sessionStorage.getItem('admin_key') || ''; }

export default function AdminBlacklist() {
    const [blacklist, setBlacklist] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [newReason, setNewReason] = useState('');
    const [newNotes, setNewNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [unbanTarget, setUnbanTarget] = useState(null);
    const [unbanBusy, setUnbanBusy] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        fetchBlacklist();
    }, []);

    const buildAuth = () => ({ adminKey: getAdminKey() });

    const fetchBlacklist = async () => {
        try {
            setLoading(true);
            const result = await base44.functions.invoke('manageBlacklist', { action: 'list', ...buildAuth() });
            setBlacklist(result.data.records || []);
        } catch (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleBan = async () => {
        if (!selected || !newReason.trim()) {
            toast({ title: 'Error', description: 'Pick a player and enter a reason.' });
            return;
        }
        setSubmitting(true);
        try {
            const result = await base44.functions.invoke('manageBlacklist', {
                action: 'ban',
                wallet_address: selected.wallet_address,
                reason: newReason.trim(),
                notes: newNotes.trim(),
                ...buildAuth(),
            });
            if (result.data.success) {
                toast({ title: 'Success', description: 'Wallet banned' });
                setSelected(null); setNewReason(''); setNewNotes('');
                fetchBlacklist();
            } else {
                toast({ title: 'Error', description: result.data.error || 'Failed', variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnban = async () => {
        if (!unbanTarget) return;
        setUnbanBusy(true);
        try {
            const result = await base44.functions.invoke('manageBlacklist', {
                action: 'unban',
                wallet_address: unbanTarget.wallet_address,
                ...buildAuth(),
            });
            if (result.data.success) {
                toast({ title: 'Success', description: 'Wallet unbanned' });
                fetchBlacklist();
            } else {
                toast({ title: 'Error', description: result.data.error || 'Failed', variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setUnbanBusy(false);
            setUnbanTarget(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-red-950/20 border border-red-500/50 rounded-xl p-6">
                <h3 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" /> Ban Wallet
                </h3>
                <div className="space-y-4">
                    <PlayerSearchInput selected={selected} onSelect={setSelected} accent="red" />
                    <input type="text" placeholder="Reason (abuse, exploit, fraud, etc)" value={newReason}
                        onChange={(e) => setNewReason(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 outline-none focus:border-red-500" />
                    <textarea placeholder="Additional notes (optional)" value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)} rows={3}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 outline-none focus:border-red-500" />
                    <button onClick={handleBan} disabled={submitting}
                        className="w-full bg-red-600 hover:bg-red-500 disabled:bg-slate-700 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <Plus className="w-4 h-4" /> Ban Wallet
                    </button>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-bold text-white mb-4">Blacklisted Wallets ({blacklist.length})</h3>
                {loading ? (
                    <div className="text-slate-400">Loading...</div>
                ) : blacklist.length === 0 ? (
                    <div className="text-slate-400 text-center py-8">No banned wallets</div>
                ) : (
                    <div className="space-y-2">
                        {blacklist.map((entry) => (
                            <div key={entry.id} className="bg-slate-800 border border-red-500/30 rounded-lg p-4 flex justify-between items-start gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="font-mono text-sm text-red-400 break-all">{entry.wallet_address}</div>
                                    <div className="text-sm text-white font-bold mt-1">{entry.reason}</div>
                                    {entry.notes && <div className="text-xs text-slate-400 mt-1">Notes: {entry.notes}</div>}
                                    <div className="text-xs text-slate-500 mt-2">
                                        Banned by {entry.banned_by} • {new Date(entry.banned_at).toLocaleDateString()}
                                    </div>
                                </div>
                                <button onClick={() => setUnbanTarget(entry)}
                                    className="shrink-0 p-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors" title="Unban">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={!!unbanTarget}
                onClose={() => !unbanBusy && setUnbanTarget(null)}
                onConfirm={handleUnban}
                busy={unbanBusy}
                title="Unban wallet"
                description={unbanTarget ? `Unban ${unbanTarget.wallet_address}? They will be able to play again immediately.` : ''}
                items={unbanTarget ? [`Banned for: ${unbanTarget.reason}`] : []}
                confirmLabel="Unban"
            />
        </div>
    );
}