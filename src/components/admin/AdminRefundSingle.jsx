import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Coins, AlertTriangle, Search, CheckCircle2 } from 'lucide-react';
import PlayerSearchInput from './PlayerSearchInput';

// Single-player OMENX refund tool. Used for one-off support cases (failed grant
// after charge, bug compensation, etc.) — does NOT touch the bulk refund flow.
//
// Flow:
//   1. Search for player → see their TokenSpendLog total
//   2. Choose mode (manual amount or full auto-refund)
//   3. Enter reason → confirm → send
export default function AdminRefundSingle() {
    const [selected, setSelected] = useState(null);
    const [preview, setPreview] = useState(null); // { totalSpent, purchaseCount, ... }
    const [loadingPreview, setLoadingPreview] = useState(false);

    const [mode, setMode] = useState('manual'); // 'manual' | 'auto'
    const [manualAmount, setManualAmount] = useState('');
    const [reason, setReason] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);
    const [err, setErr] = useState('');

    // When a player is picked, fetch their spend total (preview)
    const handleSelect = async (player) => {
        setSelected(player);
        setPreview(null);
        setResult(null);
        setErr('');
        setManualAmount('');
        setReason('');
        if (!player) return;

        setLoadingPreview(true);
        try {
            const res = await base44.functions.invoke('refundSinglePlayer', {
                mode: 'preview',
                walletAddress: player.wallet_address,
                adminKey: sessionStorage.getItem('admin_key') || undefined,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setPreview(res.data);
        } catch (e) { setErr(e.message); }
        setLoadingPreview(false);
    };

    const refundAmount = mode === 'auto'
        ? Math.floor(preview?.totalSpent || 0)
        : Math.floor(Number(manualAmount) || 0);

    const canSubmit = selected && refundAmount > 0 && refundAmount <= 100000 && reason.trim().length > 0 && !sending;

    const handleSend = async () => {
        if (!canSubmit) return;
        setSending(true); setErr('');
        try {
            const res = await base44.functions.invoke('refundSinglePlayer', {
                mode,
                walletAddress: selected.wallet_address,
                amount: mode === 'manual' ? refundAmount : undefined,
                reason: reason.trim(),
                adminKey: sessionStorage.getItem('admin_key') || undefined,
            });
            // Server marks 504/timeout responses with statusUnknown=true so staff
            // know the payment may have silently succeeded — verify on dev portal
            // before retrying. (Tijckers refund 2026-05-07 — gateway timeout, no
            // way to tell if it went through.)
            if (res.data?.statusUnknown) {
                setErr(`⚠️ ${res.data.error}`);
                setSending(false);
                return;
            }
            if (res.data?.error) throw new Error(res.data.error);
            setResult(res.data);
            setConfirming(false);
        } catch (e) {
            // Axios surfaces the server's status in e.response — if 504 came back,
            // treat as "unknown status" rather than a generic failure.
            const status = e?.response?.status;
            const serverMsg = e?.response?.data?.error || e.message;
            if (status === 504 || /status code 504|timeout/i.test(e.message || '')) {
                setErr(`⚠️ ${serverMsg || 'Payment status UNKNOWN — verify on OMENX dev portal before retrying.'}`);
            } else {
                setErr(serverMsg);
            }
        }
        setSending(false);
    };

    const reset = () => {
        setSelected(null);
        setPreview(null);
        setManualAmount('');
        setReason('');
        setResult(null);
        setErr('');
        setMode('manual');
    };

    return (
        <div className="bg-[#0b0416]/80 border border-amber-900/50 rounded-xl p-4">
            <h2 className="text-base font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                <Coins size={16} /> Single-Player OMENX Refund
            </h2>
            <p className="text-xs text-slate-500 mb-4">
                Refund a single player — for support cases (failed grant, bug comp, etc.). Logs to <span className="font-mono">#economy-alerts</span> + audit trail. Cap: 100,000 OMENX per refund.
            </p>

            {/* Success */}
            {result && (
                <div className="bg-emerald-950/40 border border-emerald-700 rounded-lg p-4 mb-3">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold mb-2">
                        <CheckCircle2 size={16} /> Refund sent
                    </div>
                    <div className="text-xs text-slate-300 space-y-0.5">
                        <div><span className="text-slate-500">Player:</span> {result.playerName}</div>
                        <div><span className="text-slate-500">Amount:</span> <span className="font-mono text-amber-300 font-bold">{result.amount.toLocaleString()} OMENX</span></div>
                        {result.txId && <div className="font-mono text-[10px] text-slate-500 break-all">Tx: {result.txId}</div>}
                    </div>
                    <button onClick={reset} className="mt-3 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded font-bold">
                        Refund another player
                    </button>
                </div>
            )}

            {!result && (
                <>
                    <div className="mb-3">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">Find Player</label>
                        <PlayerSearchInput selected={selected} onSelect={handleSelect} accent="amber" />
                    </div>

                    {/* Spend preview */}
                    {selected && (
                        <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3 mb-3">
                            {loadingPreview ? (
                                <div className="text-xs text-slate-400 flex items-center gap-2"><Search size={12} className="animate-pulse" /> Loading spend history…</div>
                            ) : preview ? (
                                <>
                                    <div className="grid grid-cols-3 gap-3 text-center mb-3">
                                        <div>
                                            <div className="text-[10px] text-slate-500 uppercase">Total Spent</div>
                                            <div className="text-sm font-mono font-bold text-amber-300">{preview.totalSpent.toFixed(1)} OMENX</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-500 uppercase">Purchases</div>
                                            <div className="text-sm font-mono font-bold text-white">{preview.purchaseCount}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-500 uppercase">Last Purchase</div>
                                            <div className="text-[10px] font-mono text-slate-300">{preview.lastPurchaseDate ? new Date(preview.lastPurchaseDate).toLocaleDateString() : '—'}</div>
                                        </div>
                                    </div>
                                    {preview.recentPurchases?.length > 0 && (
                                        <details className="border-t border-slate-800 pt-2">
                                            <summary className="text-[10px] text-slate-400 uppercase tracking-wider font-bold cursor-pointer hover:text-amber-300">
                                                📋 Recent purchases ({preview.recentPurchases.length}{preview.purchaseCount > preview.recentPurchases.length ? ` of ${preview.purchaseCount}` : ''}) — click to expand
                                            </summary>
                                            <div className="mt-2 max-h-64 overflow-y-auto space-y-0.5">
                                                {preview.recentPurchases.map((p, i) => (
                                                    <div key={i} className="flex items-center justify-between gap-2 text-[11px] font-mono bg-slate-950/40 rounded px-2 py-1">
                                                        <span className="text-slate-400 truncate flex-1" title={p.sku_id}>{p.sku_id}</span>
                                                        <span className="text-amber-300 font-bold shrink-0">{p.amount} OMENX</span>
                                                        <span className="text-slate-600 text-[10px] shrink-0 w-20 text-right">{new Date(p.created_date).toLocaleDateString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    )}
                                </>
                            ) : null}
                        </div>
                    )}

                    {selected && preview && (
                        <>
                            {/* Mode selector */}
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <button onClick={() => setMode('manual')}
                                    className={`text-left px-3 py-2 rounded border text-xs transition-colors ${mode === 'manual' ? 'bg-amber-900/40 border-amber-600 text-amber-200' : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                                    <div className="font-bold">✍️ Manual amount</div>
                                    <div className="text-[10px] opacity-70 mt-0.5">Refund a specific OMENX amount</div>
                                </button>
                                <button onClick={() => setMode('auto')}
                                    className={`text-left px-3 py-2 rounded border text-xs transition-colors ${mode === 'auto' ? 'bg-amber-900/40 border-amber-600 text-amber-200' : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                                    <div className="font-bold">🔄 Full refund</div>
                                    <div className="text-[10px] opacity-70 mt-0.5">Refund their entire spend history</div>
                                </button>
                            </div>

                            {mode === 'manual' && (
                                <div className="mb-3">
                                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">Amount (OMENX)</label>
                                    <input type="number" value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="e.g. 50"
                                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-500" />
                                </div>
                            )}

                            <div className="mb-3">
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">Reason (required, for audit)</label>
                                <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Failed grant after charge — ticket #1234"
                                    maxLength={500}
                                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-amber-500" />
                            </div>

                            {/* Final summary + confirm */}
                            {refundAmount > 0 && reason.trim() && (
                                <div className="bg-amber-950/30 border border-amber-700/50 rounded-lg p-3 mb-3">
                                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider mb-2">
                                        <AlertTriangle size={12} /> About to refund
                                    </div>
                                    <div className="text-xs text-slate-200 space-y-1">
                                        <div><span className="text-slate-500">Player:</span> {preview.playerName}</div>
                                        <div><span className="text-slate-500">Amount:</span> <span className="font-mono text-amber-300 font-bold text-sm">{refundAmount.toLocaleString()} OMENX</span></div>
                                        <div className="text-[10px] text-slate-500 italic">"{reason.slice(0, 120)}"</div>
                                    </div>
                                </div>
                            )}

                            {err && <div className="text-xs text-red-400 font-mono mb-2">✗ {err}</div>}

                            {!confirming ? (
                                <button onClick={() => setConfirming(true)} disabled={!canSubmit}
                                    className="w-full bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-bold text-sm transition-colors">
                                    Send refund
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button onClick={() => setConfirming(false)} disabled={sending}
                                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded font-bold text-sm">
                                        Cancel
                                    </button>
                                    <button onClick={handleSend} disabled={sending}
                                        className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded font-bold text-sm flex items-center justify-center gap-2">
                                        {sending ? '...' : <>⚠️ Confirm send {refundAmount.toLocaleString()} OMENX</>}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}