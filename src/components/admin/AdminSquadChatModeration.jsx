import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Shield, Trash2, RefreshCw, Search, ChevronDown, ChevronRight, List, Users, VolumeX, Volume2 } from 'lucide-react';
import moment from 'moment';
import ConfirmDialog from './ConfirmDialog';
import MuteWalletDialog from './MuteWalletDialog';

export default function AdminSquadChatModeration({ walletAddress }) {
    const qc = useQueryClient();
    const [filter, setFilter] = useState('');
    const [confirm, setConfirm] = useState(null);
    const [muteTarget, setMuteTarget] = useState(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [view, setView] = useState('all'); // 'all' | 'bysquad' | 'mutes'
    const [expandedSquad, setExpandedSquad] = useState(null);

    const { data: messages = [], isLoading, refetch } = useQuery({
        queryKey: ['squadMessagesAll'],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', { type: 'squadMessages' })
            .then(r => r.data?.messages || []),
    });

    const { data: mutes = [], refetch: refetchMutes } = useQuery({
        queryKey: ['mutedWallets'],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', { type: 'mutedWallets' })
            .then(r => r.data?.mutes || []),
    });

    // Quick lookup: wallet_address (lowercase) → mute record
    const muteMap = useMemo(() => {
        const m = new Map();
        for (const x of mutes) m.set((x.wallet_address || '').toLowerCase(), x);
        return m;
    }, [mutes]);

    const filtered = messages.filter(m => {
        if (!filter.trim()) return true;
        const q = filter.toLowerCase();
        return m.content?.toLowerCase().includes(q)
            || m.player_name?.toLowerCase().includes(q)
            || m.squad_name?.toLowerCase().includes(q)
            || m.wallet_address?.toLowerCase().includes(q);
    });

    // Group filtered messages by squad for the "By Squad" view
    const squadGroups = useMemo(() => {
        const map = new Map();
        for (const m of filtered) {
            const key = m.squad_id || m.squad_name || 'unknown';
            if (!map.has(key)) {
                map.set(key, {
                    squad_id: m.squad_id,
                    squad_name: m.squad_name || '(no squad)',
                    messages: [],
                    latest: 0,
                });
            }
            const group = map.get(key);
            group.messages.push(m);
            const ts = new Date(m.created_date).getTime();
            if (ts > group.latest) group.latest = ts;
        }
        return Array.from(map.values()).sort((a, b) => b.latest - a.latest);
    }, [filtered]);

    const handleDelete = async () => {
        if (!confirm) return;
        setBusy(true); setMsg('');
        try {
            const res = await base44.functions.invoke('deleteSquadMessage', {
                messageId: confirm.id,
                adminKey: sessionStorage.getItem('admin_key') || undefined,
            });
            if (res.data?.error) throw new Error(res.data.error);
            qc.invalidateQueries(['squadMessagesAll']);
            setMsg(`✓ Deleted message from ${confirm.player_name}`);
            setConfirm(null);
        } catch (e) { setMsg(`✗ ${e.message}`); }
        setBusy(false);
    };

    const handleMute = async ({ minutes, reason }) => {
        if (!muteTarget) return;
        setBusy(true); setMsg('');
        try {
            const res = await base44.functions.invoke('muteWallet', {
                action: 'mute',
                walletAddress: muteTarget.wallet_address,
                playerName: muteTarget.player_name,
                durationMinutes: minutes,
                reason,
                adminKey: sessionStorage.getItem('admin_key') || undefined,
            });
            if (res.data?.error) throw new Error(res.data.error);
            refetchMutes();
            setMsg(`✓ Muted ${muteTarget.player_name}${minutes ? ` for ${minutes} min` : ' permanently'}`);
            setMuteTarget(null);
        } catch (e) { setMsg(`✗ ${e.message}`); }
        setBusy(false);
    };

    const handleUnmute = async (mute) => {
        setBusy(true); setMsg('');
        try {
            const res = await base44.functions.invoke('muteWallet', {
                action: 'unmute',
                walletAddress: mute.wallet_address,
                playerName: mute.player_name,
                adminKey: sessionStorage.getItem('admin_key') || undefined,
            });
            if (res.data?.error) throw new Error(res.data.error);
            refetchMutes();
            setMsg(`✓ Unmuted ${mute.player_name || mute.wallet_address}`);
        } catch (e) { setMsg(`✗ ${e.message}`); }
        setBusy(false);
    };

    return (
        <div className="bg-[#0b0416]/80 border border-orange-900/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h2 className="text-base font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2">
                    <Shield size={16} /> Squad Chat Moderation
                </h2>
                <span className="text-[10px] text-slate-500">Last 200 messages</span>
                <div className="flex bg-slate-900 border border-slate-700 rounded overflow-hidden ml-auto">
                    <button onClick={() => setView('all')}
                        className={`text-xs px-2.5 py-1 font-bold flex items-center gap-1 transition-colors ${view === 'all' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                        <List size={11} /> All
                    </button>
                    <button onClick={() => setView('bysquad')}
                        className={`text-xs px-2.5 py-1 font-bold flex items-center gap-1 transition-colors ${view === 'bysquad' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                        <Users size={11} /> By Squad
                    </button>
                    <button onClick={() => setView('mutes')}
                        className={`text-xs px-2.5 py-1 font-bold flex items-center gap-1 transition-colors ${view === 'mutes' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                        <VolumeX size={11} /> Mutes {mutes.length > 0 && <span className="bg-orange-700 text-white px-1 rounded text-[9px] ml-0.5">{mutes.length}</span>}
                    </button>
                </div>
                <button onClick={() => { refetch(); refetchMutes(); }} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded font-bold flex items-center gap-1">
                    <RefreshCw size={11} /> Refresh
                </button>
            </div>

            {view !== 'mutes' && (
                <div className="flex items-center gap-2 mb-3">
                    <Search size={14} className="text-slate-500" />
                    <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
                        placeholder="Filter by content, player, squad, or wallet…"
                        className="flex-1 bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-orange-500" />
                </div>
            )}

            {msg && <div className={`text-xs font-mono mb-2 ${msg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</div>}

            {view === 'mutes' ? (
                <MutesList mutes={mutes} onUnmute={handleUnmute} busy={busy} />
            ) : isLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-orange-500"></div></div>
            ) : filtered.length === 0 ? (
                <div className="text-center text-slate-500 py-6 text-sm">No messages match.</div>
            ) : view === 'all' ? (
                <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
                    {filtered.map(m => <MessageRow key={m.id} m={m} mute={muteMap.get((m.wallet_address || '').toLowerCase())} onDelete={setConfirm} onMute={setMuteTarget} onUnmute={handleUnmute} showSquad />)}
                </div>
            ) : (
                <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
                    <div className="text-[10px] text-slate-500 mb-1">{squadGroups.length} squad{squadGroups.length === 1 ? '' : 's'} · click to expand</div>
                    {squadGroups.map(group => {
                        const isOpen = expandedSquad === (group.squad_id || group.squad_name);
                        return (
                            <div key={group.squad_id || group.squad_name} className="bg-slate-900/40 border border-orange-800/30 rounded overflow-hidden">
                                <button
                                    onClick={() => setExpandedSquad(isOpen ? null : (group.squad_id || group.squad_name))}
                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800/60 transition-colors text-left"
                                >
                                    {isOpen ? <ChevronDown size={14} className="text-orange-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-500 shrink-0" />}
                                    <span className="font-bold text-orange-400 text-sm">[{group.squad_name}]</span>
                                    <span className="text-[10px] text-slate-400 ml-auto">{group.messages.length} msg{group.messages.length === 1 ? '' : 's'}</span>
                                    <span className="text-[10px] text-slate-500 ml-2">latest {moment(group.latest).fromNow()}</span>
                                </button>
                                {isOpen && (
                                    <div className="border-t border-orange-900/30 p-2 space-y-1.5 bg-slate-950/40">
                                        {group.messages.map(m => <MessageRow key={m.id} m={m} mute={muteMap.get((m.wallet_address || '').toLowerCase())} onDelete={setConfirm} onMute={setMuteTarget} onUnmute={handleUnmute} />)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <ConfirmDialog
                open={!!confirm}
                onClose={() => !busy && setConfirm(null)}
                onConfirm={handleDelete}
                busy={busy}
                title="Delete squad message"
                description={confirm ? `Permanently delete this message from ${confirm.player_name} in [${confirm.squad_name}]?` : ''}
                items={confirm ? [`"${(confirm.content || '').slice(0, 200)}"`] : []}
                confirmLabel="Delete message"
            />

            <MuteWalletDialog
                open={!!muteTarget}
                target={muteTarget}
                busy={busy}
                onClose={() => !busy && setMuteTarget(null)}
                onConfirm={handleMute}
            />
        </div>
    );
}

function MessageRow({ m, mute, onDelete, onMute, onUnmute, showSquad }) {
    const isMuted = !!mute;
    return (
        <div className={`bg-slate-900/60 border ${isMuted ? 'border-orange-600/60' : 'border-orange-800/30'} rounded px-3 py-2 flex items-start gap-3`}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-xs">{m.player_name}</span>
                    {showSquad && <span className="text-[10px] text-orange-400 font-mono">[{m.squad_name}]</span>}
                    {isMuted && (
                        <span className="text-[9px] bg-orange-900/60 text-orange-200 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                            <VolumeX size={9} /> MUTED{mute.muted_until ? ` · ${moment(mute.muted_until).fromNow(true)} left` : ' · permanent'}
                        </span>
                    )}
                    <span className="text-[10px] text-slate-500">{moment(m.created_date).fromNow()}</span>
                </div>
                <div className="text-sm text-slate-200 mt-1 break-words whitespace-pre-wrap">{m.content}</div>
                <div className="text-[9px] text-slate-600 font-mono mt-1">{m.wallet_address?.slice(0, 10)}…{m.wallet_address?.slice(-6)}</div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
                {isMuted ? (
                    <button onClick={() => onUnmute(mute)}
                        className="bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 text-xs px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-colors">
                        <Volume2 size={11} /> Unmute
                    </button>
                ) : (
                    <button onClick={() => onMute({ wallet_address: m.wallet_address, player_name: m.player_name })}
                        className="bg-orange-900/60 hover:bg-orange-800 text-orange-200 text-xs px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-colors"
                        disabled={!m.wallet_address || m.wallet_address === 'system'}>
                        <VolumeX size={11} /> Mute
                    </button>
                )}
                <button onClick={() => onDelete(m)}
                    className="bg-red-900/60 hover:bg-red-800 text-red-200 text-xs px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-colors">
                    <Trash2 size={11} /> Delete
                </button>
            </div>
        </div>
    );
}

function MutesList({ mutes, onUnmute, busy }) {
    if (mutes.length === 0) {
        return <div className="text-center text-slate-500 py-6 text-sm">No active mutes.</div>;
    }
    return (
        <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
            <div className="text-[10px] text-slate-500 mb-1">{mutes.length} active mute{mutes.length === 1 ? '' : 's'}</div>
            {mutes.map(m => (
                <div key={m.id} className="bg-slate-900/60 border border-orange-700/40 rounded px-3 py-2 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <VolumeX size={12} className="text-orange-400" />
                            <span className="font-bold text-white text-xs">{m.player_name || '(unknown player)'}</span>
                            <span className="text-[9px] bg-orange-900/60 text-orange-200 px-1.5 py-0.5 rounded font-bold">
                                {m.muted_until ? `expires ${moment(m.muted_until).fromNow()}` : 'PERMANENT'}
                            </span>
                            <span className="text-[10px] text-slate-500">muted {moment(m.created_date).fromNow()}</span>
                        </div>
                        {m.reason && <div className="text-xs text-slate-300 mt-1 italic">"{m.reason}"</div>}
                        <div className="text-[9px] text-slate-600 font-mono mt-1">
                            {m.wallet_address?.slice(0, 10)}…{m.wallet_address?.slice(-6)} · by {m.muted_by?.slice(0, 10)}…{m.muted_by?.slice(-6)}
                        </div>
                    </div>
                    <button onClick={() => onUnmute(m)} disabled={busy}
                        className="bg-emerald-900/60 hover:bg-emerald-800 disabled:opacity-50 text-emerald-200 text-xs px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-colors shrink-0">
                        <Volume2 size={11} /> Unmute
                    </button>
                </div>
            ))}
        </div>
    );
}