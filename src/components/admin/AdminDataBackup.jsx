import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, Upload, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function AdminDataBackup({ walletAddress }) {
    const { toast } = useToast();
    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [creatingBackup, setCreatingBackup] = useState(false);
    const [restoring, setRestoring] = useState(null);
    const [notes, setNotes] = useState('');

    const adminKey = sessionStorage.getItem('admin_key') || '';

    useEffect(() => {
        loadBackups();
    }, []);

    const loadBackups = async () => {
        try {
            setLoading(true);
            // DataBackup is admin-only RLS so we can read it directly with the SDK
            const records = await base44.entities.DataBackup.list('-created_date', 50);
            setBackups(records || []);
        } catch (err) {
            toast({ title: 'Error', description: 'Failed to load backups' });
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBackup = async () => {
        try {
            setCreatingBackup(true);
            const res = await base44.functions.invoke('backupData', {
                adminKey,
                backup_notes: notes,
            });
            if (res.data?.success) {
                toast({ title: 'Success', description: `Backup created: ${res.data.backup_name}` });
                setNotes('');
                loadBackups();
            } else {
                toast({ title: 'Error', description: res.data?.error || 'Failed to create backup' });
            }
        } catch (err) {
            toast({ title: 'Error', description: err.message });
        } finally {
            setCreatingBackup(false);
        }
    };

    const handleRestore = async (backupId) => {
        if (!window.confirm('⚠️ This will OVERWRITE all current data. Continue?')) return;

        try {
            setRestoring(backupId);
            const res = await base44.functions.invoke('restoreDataBackup', {
                adminKey,
                backup_id: backupId,
                confirm_restore: true,
            });
            if (res.data?.success) {
                toast({ title: 'Success', description: `Restored ${res.data.records_restored} records` });
                loadBackups();
            } else {
                toast({ title: 'Error', description: res.data?.error || 'Restore failed' });
            }
        } catch (err) {
            toast({ title: 'Error', description: err.message });
        } finally {
            setRestoring(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Create Backup Section */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Download className="w-5 h-5" /> Create New Backup
                </h3>
                <div className="space-y-3">
                    <textarea
                        placeholder="Optional notes about this backup..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        maxLength={200}
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                        rows="2"
                    />
                    <button
                        onClick={handleCreateBackup}
                        disabled={creatingBackup}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {creatingBackup ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4" /> Create Backup Now
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Backups List */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Upload className="w-5 h-5" /> Backup History
                </h3>
                {loading ? (
                    <div className="text-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                    </div>
                ) : backups.length === 0 ? (
                    <p className="text-slate-400 text-sm">No backups yet. Create one to get started.</p>
                ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {backups.map(backup => (
                            <div
                                key={backup.id}
                                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="font-mono text-xs text-slate-300 truncate">{backup.backup_name}</div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        {backup.backup_type === 'automated' ? '⏰ Automated' : '📝 Manual'} •{' '}
                                        {backup.entity_counts?.RunScore || 0} scores • {backup.entity_counts?.Squad || 0} squads
                                    </div>
                                    {backup.notes && (
                                        <div className="text-xs text-slate-400 mt-1 italic">{backup.notes}</div>
                                    )}
                                    <div className="text-xs text-slate-600 mt-2">
                                        {new Date(backup.created_date).toLocaleString()}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRestore(backup.id)}
                                    disabled={restoring === backup.id || !backup.restore_available}
                                    className="flex-shrink-0 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-2 whitespace-nowrap"
                                >
                                    {restoring === backup.id ? (
                                        <>
                                            <Loader2 className="w-3 h-3 animate-spin" /> Restoring...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-3 h-3" /> Restore
                                        </>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Warning */}
            <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-orange-200">
                    <strong>Restore Warning:</strong> Restoring will permanently overwrite current data. Only backups you see here can be restored.
                </div>
            </div>
        </div>
    );
}