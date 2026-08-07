import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { UserPlus, Trash2, Shield } from 'lucide-react';
import moment from 'moment';

const ALL_PERMISSIONS = [
    { id: 'view_data',          label: '👁️ View Data',           desc: 'Read-only access to dashboards (no revenue/finance)' },
    { id: 'view_finance',       label: '💵 View Finance',         desc: 'See OMENX revenue, token pools, spend logs' },
    { id: 'edit_players',       label: '✏️ Edit Players',         desc: 'Edit player saves, grant currency' },
    { id: 'delete_scores',      label: '🗑️ Delete Scores',         desc: 'Remove leaderboard entries' },
    { id: 'moderate_chat',      label: '💬 Moderate Chat',         desc: 'Delete squad messages' },
    { id: 'manage_blacklist',   label: '🚫 Manage Blacklist',     desc: 'Ban / unban wallets' },
    { id: 'distribute_rewards', label: '💸 Distribute Rewards',   desc: 'Trigger weekly/seasonal payouts' },
    { id: 'manage_raid',        label: '⚔️ Manage Raid',          desc: 'Manage the global boss' },
    { id: 'manage_backups',     label: '💾 Manage Backups',       desc: 'Create / restore data backups' },
    { id: 'manage_admins',      label: '👥 Manage Admins',         desc: 'Add / remove staff (high trust)' },
    { id: 'manage_maintenance', label: '🔧 Maintenance Gate',     desc: 'Flip soft/hard maintenance gate during incidents/rollouts' },
    { id: 'refund_single',      label: '💸 Refund Single Player', desc: 'Issue one-off OMENX refunds (cap 100k)' },
    { id: 'wipe_data',          label: '🗑️ Wipe Data',             desc: 'OWNER-LEVEL — destructive resets' },
    { id: 'refund_omenx',       label: '💰 Refund OMENX (Bulk)',   desc: 'OWNER-LEVEL — bulk refunds' },
    { id: 'owner',              label: '👑 Owner',                 desc: 'Full access. Bypasses all checks. Only owners can grant.' },
];

export default function AdminManagers({ walletAddress }) {
    const [newWallet, setNewWallet] = useState('');
    const [newName, setNewName] = useState('');
    const [newNotes, setNewNotes] = useState('');
    const [selectedPerms, setSelectedPerms] = useState(['view_data']);
    const [adding, setAdding] = useState(false);
    const [msg, setMsg] = useState('');
    const qc = useQueryClient();

    const { data: admins, isLoading } = useQuery({
        queryKey: ['adminWallets', walletAddress],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'adminWallets' })
            .then(r => r.data.records || []),
    });

    const callerIsOwner = (admins || []).find(a => a.wallet_address?.toLowerCase() === walletAddress?.toLowerCase())?.permissions?.includes('owner');

    const togglePerm = (id) => {
        setSelectedPerms(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    };

    const handleAdd = async () => {
        if (!newWallet.trim()) { setMsg('✗ Enter a wallet address.'); return; }
        setAdding(true); setMsg('');
        try {
            const res = await base44.functions.invoke('manageAdminWallet', {
                action: 'create',
                wallet_address: newWallet.trim(),
                admin_name: newName.trim() || 'Unnamed',
                permissions: selectedPerms,
                notes: newNotes.trim(),
            });
            if (res.data?.success) {
                qc.invalidateQueries({ queryKey: ['adminWallets'] });
                setMsg('✓ Manager added');
                setNewWallet(''); setNewName(''); setNewNotes(''); setSelectedPerms(['view_data']);
                setTimeout(() => setMsg(''), 3000);
            } else {
                setMsg(`✗ ${res.data?.error || 'Failed'}`);
            }
        } catch (e) {
            setMsg(`✗ ${e.message}`);
        }
        setAdding(false);
    };

    const handleDelete = async (admin) => {
        const isOwner = (admin.permissions || []).includes('owner');
        const label = admin.admin_name || admin.wallet_address;
        if (!window.confirm(`Remove ${label}${isOwner ? ' (OWNER)' : ''}?`)) return;
        try {
            const res = await base44.functions.invoke('manageAdminWallet', {
                action: 'delete',
                admin_id: admin.id,
            });
            if (res.data?.success) {
                qc.invalidateQueries({ queryKey: ['adminWallets'] });
                setMsg('✓ Removed'); setTimeout(() => setMsg(''), 3000);
            } else {
                setMsg(`✗ ${res.data?.error || 'Failed'}`);
            }
        } catch (e) { setMsg(`✗ ${e.message}`); }
    };

    const handleUpdatePerms = async (admin, perms) => {
        try {
            const res = await base44.functions.invoke('manageAdminWallet', {
                action: 'updatePerms',
                admin_id: admin.id,
                permissions: perms,
            });
            if (res.data?.success) {
                qc.invalidateQueries({ queryKey: ['adminWallets'] });
            } else {
                setMsg(`✗ ${res.data?.error || 'Failed'}`);
                setTimeout(() => setMsg(''), 3000);
            }
        } catch (e) { setMsg(`✗ ${e.message}`); setTimeout(() => setMsg(''), 3000); }
    };

    return (
        <div className="space-y-4">
            {/* Add new manager */}
            <div className="bg-[#0b0416]/80 border border-cyan-900/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <UserPlus size={16} /> Add Staff Member
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 uppercase">Wallet Address</label>
                        <input type="text" value={newWallet} onChange={e => setNewWallet(e.target.value)} placeholder="0x..."
                            className="bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-cyan-500 font-mono" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 uppercase">Display Name</label>
                        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Support Manager"
                            className="bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-cyan-500" />
                    </div>
                </div>
                <div className="flex flex-col gap-1 mb-3">
                    <label className="text-[10px] text-slate-500 uppercase">Notes (optional)</label>
                    <input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="e.g. Community manager, helps with support"
                        className="bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-cyan-500" />
                </div>

                <div className="mb-3">
                    <div className="text-[10px] text-slate-500 uppercase mb-2">Permissions</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {ALL_PERMISSIONS.map(p => {
                            const isOwnerPerm = p.id === 'owner';
                            const disabled = isOwnerPerm && !callerIsOwner;
                            return (
                                <button key={p.id} type="button" onClick={() => !disabled && togglePerm(p.id)} disabled={disabled}
                                    className={`text-left px-3 py-2 rounded border text-xs transition-colors ${
                                        disabled ? 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
                                        : selectedPerms.includes(p.id)
                                            ? 'bg-cyan-900/50 border-cyan-600 text-cyan-300'
                                            : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-500'
                                    }`}>
                                    <div className="font-bold">{p.label}</div>
                                    <div className="text-[10px] opacity-70 mt-0.5">{p.desc}</div>
                                </button>
                            );
                        })}
                    </div>
                    {!callerIsOwner && <div className="text-[10px] text-slate-500 mt-2">👑 Only owners can grant the Owner permission.</div>}
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={handleAdd} disabled={adding}
                        className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm transition-colors">
                        {adding ? 'Adding...' : 'Add Staff Member'}
                    </button>
                    {msg && <span className={`text-xs font-mono ${msg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</span>}
                </div>
            </div>

            {/* Existing managers */}
            <div className="bg-[#0b0416]/80 border border-slate-700/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Shield size={16} /> Current Staff & Admins
                </h2>
                {isLoading ? (
                    <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-slate-500"></div></div>
                ) : (admins || []).length === 0 ? (
                    <div className="text-slate-500 text-sm text-center py-6">No staff added yet.</div>
                ) : (
                    <div className="space-y-3">
                        {(admins || []).map(admin => {
                            const isOwner = (admin.permissions || []).includes('owner');
                            return (
                                <div key={admin.id} className={`bg-slate-900/60 border rounded-xl p-4 ${isOwner ? 'border-yellow-700/60' : 'border-slate-700'}`}>
                                    <div className="flex items-start justify-between mb-2 gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <div className="font-bold text-white text-sm">{admin.admin_name || 'Unnamed'}</div>
                                                {isOwner && <span className="text-[10px] font-bold bg-yellow-900/50 text-yellow-300 px-1.5 py-0.5 rounded">👑 OWNER</span>}
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-mono mt-0.5 break-all">{admin.wallet_address}</div>
                                            {admin.notes && <div className="text-[10px] text-slate-400 mt-1 italic">"{admin.notes}"</div>}
                                            <div className="text-[10px] text-slate-600 mt-0.5">Added {moment(admin.created_date).fromNow()}</div>
                                        </div>
                                        <button onClick={() => handleDelete(admin)}
                                            className="bg-red-900/50 hover:bg-red-800 text-red-400 hover:text-red-300 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 transition-colors shrink-0">
                                            <Trash2 size={10} /> Remove
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {ALL_PERMISSIONS.map(p => {
                                            const has = (admin.permissions || []).includes(p.id);
                                            const isOwnerPerm = p.id === 'owner';
                                            const canToggle = !isOwnerPerm || callerIsOwner;
                                            return (
                                                <button key={p.id}
                                                    disabled={!canToggle}
                                                    onClick={() => {
                                                        if (!canToggle) return;
                                                        const cur = admin.permissions || [];
                                                        const updated = cur.includes(p.id) ? cur.filter(x => x !== p.id) : [...cur, p.id];
                                                        handleUpdatePerms(admin, updated);
                                                    }}
                                                    title={!canToggle ? 'Only owners can change owner permission' : ''}
                                                    className={`text-[10px] px-2 py-0.5 rounded font-bold transition-colors ${
                                                        !canToggle ? 'bg-slate-900 text-slate-700 cursor-not-allowed'
                                                            : has ? 'bg-cyan-800 text-cyan-300'
                                                                  : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                                                    }`}>
                                                    {p.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}