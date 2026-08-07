import React, { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Check, X, Inbox } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { sanitizePilotName } from '@/lib/sanitizePilotName';

// Shown to leaders and officers in the Members tab when squad.privacy === 'request'.
// Lists pending join requests with approve/deny buttons.
export default function JoinRequestsPanel({ squadId, onApproved }) {
    const { toast } = useToast();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null); // request id being processed

    const load = useCallback(async () => {
        try {
            const list = await base44.entities.SquadJoinRequest.filter(
                { squad_id: squadId, status: 'pending' },
                '-created_date',
                25,
            );
            setRequests(list);
        } catch (e) {
            console.error('[JoinRequestsPanel] load failed', e);
        }
        setLoading(false);
    }, [squadId]);

    useEffect(() => {
        load();
        // Subscribe to live updates so officers see new requests instantly.
        const unsub = base44.entities.SquadJoinRequest.subscribe((event) => {
            if (event.data?.squad_id !== squadId) return;
            load();
        });
        return () => unsub();
    }, [squadId, load]);

    const handle = async (req, action) => {
        setBusy(req.id);
        try {
            const res = await base44.functions.invoke('squadActions', {
                action,
                requestId: req.id,
                squadId,
            });
            if (!res.data?.success) {
                toast({ title: 'Error', description: res.data?.error || 'Failed.' });
                setBusy(null);
                return;
            }
            setRequests(prev => prev.filter(r => r.id !== req.id));
            if (action === 'approveJoin') {
                toast({ title: 'Approved', description: `${sanitizePilotName(req.player_name, req.wallet_address)} joined the squad.` });
                onApproved?.();
            } else {
                toast({ title: 'Denied', description: 'Request rejected.' });
            }
        } catch (e) {
            toast({ title: 'Error', description: e?.message || 'Failed.' });
        }
        setBusy(null);
    };

    if (loading) return null;
    if (requests.length === 0) {
        return (
            <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3 text-center text-xs text-slate-500 mb-3">
                <Inbox className="w-4 h-4 inline mr-1 opacity-60" /> No pending join requests
            </div>
        );
    }

    return (
        <div className="bg-amber-950/20 border border-amber-700/40 rounded-lg p-3 mb-3 space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <Inbox className="w-3 h-3" /> Pending Requests ({requests.length})
            </div>
            {requests.map(req => {
                const safeName = sanitizePilotName(req.player_name, req.wallet_address);
                return (
                    <div key={req.id} className="bg-slate-900/60 rounded-md p-2 flex items-center gap-2 border border-slate-800">
                        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-300 shrink-0">
                            {safeName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white truncate">{safeName}</div>
                            {req.player_title && (
                                <div className="text-[9px] text-amber-300 tracking-wider truncate">{req.player_title}</div>
                            )}
                        </div>
                        <button
                            onClick={() => handle(req, 'approveJoin')}
                            disabled={busy === req.id}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white p-1.5 rounded transition-colors"
                            title="Approve"
                        >
                            <Check className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => handle(req, 'denyJoin')}
                            disabled={busy === req.id}
                            className="bg-red-900/50 hover:bg-red-800 disabled:opacity-50 text-red-300 p-1.5 rounded transition-colors border border-red-900/50"
                            title="Deny"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}