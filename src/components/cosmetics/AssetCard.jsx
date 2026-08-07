import React from 'react';
import { Check, X, RotateCw, Trash2, Eye } from 'lucide-react';

const STATUS_STYLES = {
    pending_review: { label: 'Pending', class: 'bg-amber-900/50 text-amber-300 border-amber-500/40' },
    approved: { label: 'Approved', class: 'bg-emerald-900/50 text-emerald-300 border-emerald-500/40' },
    rejected: { label: 'Rejected', class: 'bg-rose-900/50 text-rose-300 border-rose-500/40' },
    needs_reroll: { label: 'Reroll', class: 'bg-fuchsia-900/50 text-fuchsia-300 border-fuchsia-500/40' },
};

const RARITY_STYLES = {
    standard: 'text-slate-400',
    epic: 'text-cyan-300',
    mythic: 'text-amber-300',
};

export default function AssetCard({ asset, onPreview, onApprove, onReject, onNeedsReroll, onReroll, onDelete }) {
    const status = STATUS_STYLES[asset.status] || STATUS_STYLES.pending_review;

    return (
        <div className="bg-slate-900/70 border border-slate-700/50 rounded-xl overflow-hidden flex flex-col">
            {/* Thumbnail */}
            <button
                onClick={onPreview}
                className="aspect-square bg-slate-950 relative overflow-hidden group"
                title="Preview full size"
            >
                <img
                    src={asset.url}
                    alt={asset.cosmetic_id}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                    loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className={`absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${status.class}`}>
                    {status.label}
                </span>
                {asset.attempt > 1 && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-slate-800/80 text-slate-300">
                        try {asset.attempt}
                    </span>
                )}
            </button>

            {/* Meta */}
            <div className="px-3 py-2 border-t border-slate-800">
                <div className="text-xs font-mono text-white truncate" title={asset.cosmetic_id}>{asset.cosmetic_id}</div>
                <div className="flex items-center gap-2 mt-1 text-[10px] uppercase tracking-wider">
                    <span className="text-slate-500">{asset.category || 'other'}</span>
                    <span className={RARITY_STYLES[asset.rarity] || RARITY_STYLES.standard}>{asset.rarity || 'standard'}</span>
                </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-5 border-t border-slate-800">
                <button
                    onClick={onApprove}
                    className="py-2 text-emerald-400 hover:bg-emerald-900/40 transition-colors flex items-center justify-center"
                    title="Approve"
                >
                    <Check className="w-4 h-4" />
                </button>
                <button
                    onClick={onNeedsReroll}
                    className="py-2 text-fuchsia-400 hover:bg-fuchsia-900/40 transition-colors flex items-center justify-center border-l border-slate-800"
                    title="Mark needs reroll"
                >
                    <RotateCw className="w-4 h-4" />
                </button>
                <button
                    onClick={onReject}
                    className="py-2 text-rose-400 hover:bg-rose-900/40 transition-colors flex items-center justify-center border-l border-slate-800"
                    title="Reject"
                >
                    <X className="w-4 h-4" />
                </button>
                <button
                    onClick={onReroll}
                    className="py-2 text-cyan-400 hover:bg-cyan-900/40 transition-colors flex items-center justify-center border-l border-slate-800"
                    title="Reroll now (same prompt)"
                >
                    <RotateCw className="w-4 h-4" />
                    <span className="ml-1 text-[10px] font-bold">GO</span>
                </button>
                <button
                    onClick={onDelete}
                    className="py-2 text-slate-500 hover:text-rose-400 hover:bg-rose-900/30 transition-colors flex items-center justify-center border-l border-slate-800"
                    title="Delete from gallery"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}