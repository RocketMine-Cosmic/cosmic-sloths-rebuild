import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Check, X, RotateCw, Trash2, Eye, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import GenerateAssetPanel from '@/components/cosmetics/GenerateAssetPanel';
import AssetCard from '@/components/cosmetics/AssetCard';
import AssetPreviewModal from '@/components/cosmetics/AssetPreviewModal';

const STATUS_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'pending_review', label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'needs_reroll', label: 'Needs Reroll' },
];

const CATEGORY_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'animated_pilot_icon', label: 'Pilot Icon' },
    { id: 'lb_frame', label: 'LB Frame' },
    { id: 'meteor_fx', label: 'Meteor FX' },
    { id: 'skin', label: 'Skin' },
    { id: 'trail', label: 'Trail' },
    { id: 'kill_fx', label: 'Kill FX' },
    { id: 'title_flair', label: 'Title Flair' },
    { id: 'other', label: 'Other' },
];

export default function CosmeticStudio() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [previewAsset, setPreviewAsset] = useState(null);
    const [showGenerator, setShowGenerator] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await base44.entities.CosmeticAsset.list('-created_date', 200);
            setAssets(rows || []);
        } catch (e) {
            toast({ title: 'Failed to load assets', description: e.message, variant: 'destructive' });
        }
        setLoading(false);
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const updateStatus = async (asset, status) => {
        try {
            await base44.entities.CosmeticAsset.update(asset.id, { status });
            setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status } : a));
            toast({ title: `Marked as ${status.replace('_', ' ')}` });
        } catch (e) {
            toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
        }
    };

    const reroll = async (asset) => {
        toast({ title: 'Rerolling…', description: 'Generating a fresh take with the same prompt.' });
        try {
            const nextAttempt = (asset.attempt || 1) + 1;
            const res = await base44.functions.invoke('generateCosmeticAsset', {
                model_id: asset.model_id,
                prompt: asset.prompt,
                negative_prompt: asset.negative_prompt || undefined,
                width: asset.width || undefined,
                height: asset.height || undefined,
                cosmetic_id: asset.cosmetic_id,
                category: asset.category,
                rarity: asset.rarity,
                attempt: nextAttempt,
            });
            if (res.data?.error) throw new Error(res.data.error);
            await load();
            toast({ title: `Reroll complete (attempt ${nextAttempt})` });
        } catch (e) {
            toast({ title: 'Reroll failed', description: e.message, variant: 'destructive' });
        }
    };

    const remove = async (asset) => {
        if (!confirm(`Delete this asset for ${asset.cosmetic_id}? The image stays in storage but the gallery entry is gone.`)) return;
        try {
            await base44.entities.CosmeticAsset.delete(asset.id);
            setAssets(prev => prev.filter(a => a.id !== asset.id));
            toast({ title: 'Deleted' });
        } catch (e) {
            toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
        }
    };

    const filtered = assets.filter(a =>
        (statusFilter === 'all' || a.status === statusFilter) &&
        (categoryFilter === 'all' || a.category === categoryFilter)
    );

    const counts = {
        all: assets.length,
        pending_review: assets.filter(a => a.status === 'pending_review').length,
        approved: assets.filter(a => a.status === 'approved').length,
        rejected: assets.filter(a => a.status === 'rejected').length,
        needs_reroll: assets.filter(a => a.status === 'needs_reroll').length,
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <button
                        onClick={() => navigate('/admin')}
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Admin
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={load}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm font-bold transition-colors"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                        <button
                            onClick={() => setShowGenerator(s => !s)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm font-bold transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" /> {showGenerator ? 'Hide Generator' : 'New Asset'}
                        </button>
                    </div>
                </div>

                <div className="mb-6">
                    <h1 className="text-3xl font-black uppercase tracking-widest text-white mb-2">Cosmetic Studio</h1>
                    <p className="text-slate-400 text-sm">
                        Review generated assets. Approve the good ones, reroll the bad ones. Only approved assets get wired into the Wardrobe.
                    </p>
                </div>

                {showGenerator && (
                    <div className="mb-6">
                        <GenerateAssetPanel onGenerated={() => { load(); }} />
                    </div>
                )}

                {/* Status filter */}
                <div className="flex flex-wrap gap-2 mb-3">
                    {STATUS_FILTERS.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setStatusFilter(f.id)}
                            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${
                                statusFilter === f.id
                                    ? 'bg-cyan-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                        >
                            {f.label} <span className="ml-1 opacity-60">{counts[f.id] ?? 0}</span>
                        </button>
                    ))}
                </div>

                {/* Category filter */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {CATEGORY_FILTERS.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setCategoryFilter(f.id)}
                            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                                categoryFilter === f.id
                                    ? 'bg-fuchsia-600/70 text-white'
                                    : 'bg-slate-900 text-slate-500 hover:bg-slate-800'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {loading && assets.length === 0 ? (
                    <div className="text-slate-500 text-center py-12">Loading assets…</div>
                ) : filtered.length === 0 ? (
                    <div className="text-slate-500 text-center py-12 border border-dashed border-slate-800 rounded-xl">
                        No assets in this view. Generate one with the “New Asset” button above.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {filtered.map(asset => (
                            <AssetCard
                                key={asset.id}
                                asset={asset}
                                onPreview={() => setPreviewAsset(asset)}
                                onApprove={() => updateStatus(asset, 'approved')}
                                onReject={() => updateStatus(asset, 'rejected')}
                                onNeedsReroll={() => updateStatus(asset, 'needs_reroll')}
                                onReroll={() => reroll(asset)}
                                onDelete={() => remove(asset)}
                            />
                        ))}
                    </div>
                )}

                {previewAsset && (
                    <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
                )}
            </div>
        </div>
    );
}