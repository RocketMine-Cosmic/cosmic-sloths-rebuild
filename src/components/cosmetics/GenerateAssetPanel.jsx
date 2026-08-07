import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

// Only models with working provider routing. SDXL / Playground were
// deprecated on hf-inference 2026-06-26 and aren't proxied by the HF router.
const MODELS = [
    { id: 'black-forest-labs/FLUX.1-dev', label: 'FLUX.1 dev (gallery quality, via fal-ai)' },
    { id: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1 schnell (fast, free)' },
];

// All chest-tier cosmetics default to FLUX.1-dev via fal-ai (HF deprecated
// it on the shared hf-inference endpoint 2026-06-26; we now route through
// the Inference Providers router with a Pro token — see generateCosmeticAsset).
// Schnell still available in the dropdown for quick / cheap iteration.
const CATEGORIES = [
    { id: 'animated_pilot_icon', label: 'Pilot Icon', w: 256, h: 256, model: 'black-forest-labs/FLUX.1-dev' },
    { id: 'lb_frame', label: 'LB Frame', w: 1024, h: 96, model: 'black-forest-labs/FLUX.1-dev' },
    { id: 'meteor_fx', label: 'Meteor FX', w: 256, h: 128, model: 'black-forest-labs/FLUX.1-dev' },
    { id: 'skin', label: 'Skin', w: 256, h: 256, model: 'black-forest-labs/FLUX.1-dev' },
    { id: 'other', label: 'Other', w: 512, h: 512, model: 'black-forest-labs/FLUX.1-dev' },
];

const RARITIES = ['standard', 'epic', 'mythic'];

export default function GenerateAssetPanel({ onGenerated }) {
    const { toast } = useToast();
    const [cosmeticId, setCosmeticId] = useState('');
    const [category, setCategory] = useState('animated_pilot_icon');
    const [rarity, setRarity] = useState('epic');
    const [model, setModel] = useState('black-forest-labs/FLUX.1-schnell');
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    const [width, setWidth] = useState(256);
    const [height, setHeight] = useState(256);
    const [busy, setBusy] = useState(false);

    const onCategoryChange = (id) => {
        setCategory(id);
        const c = CATEGORIES.find(x => x.id === id);
        if (c) {
            setWidth(c.w);
            setHeight(c.h);
            setModel(c.model);
        }
    };

    const generate = async () => {
        if (!cosmeticId.trim() || !prompt.trim()) {
            toast({ title: 'Need a cosmetic ID + prompt', variant: 'destructive' });
            return;
        }
        setBusy(true);
        try {
            const res = await base44.functions.invoke('generateCosmeticAsset', {
                model_id: model,
                prompt: prompt.trim(),
                negative_prompt: negativePrompt.trim() || undefined,
                width: Number(width),
                height: Number(height),
                cosmetic_id: cosmeticId.trim(),
                category,
                rarity,
            });
            if (res.data?.error) throw new Error(res.data.error);
            toast({ title: 'Generated', description: 'Asset is in the gallery — review it below.' });
            setPrompt('');
            if (onGenerated) onGenerated();
        } catch (e) {
            toast({ title: 'Generation failed', description: e.message, variant: 'destructive' });
        }
        setBusy(false);
    };

    return (
        <div className="bg-slate-900/70 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-cyan-400 font-bold uppercase tracking-widest text-sm mb-4">Generate New Asset</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Cosmetic ID</label>
                    <input
                        value={cosmeticId}
                        onChange={e => setCosmeticId(e.target.value)}
                        placeholder="animated_pilot_orbiting_moon"
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono text-white"
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Category</label>
                        <select
                            value={category}
                            onChange={e => onCategoryChange(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                        >
                            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Rarity</label>
                        <select
                            value={rarity}
                            onChange={e => setRarity(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                        >
                            {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div className="md:col-span-1">
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Model</label>
                    <select
                        value={model}
                        onChange={e => setModel(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                    >
                        {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Width</label>
                    <input
                        type="number"
                        value={width}
                        onChange={e => setWidth(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
                    />
                </div>
                <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Height</label>
                    <input
                        type="number"
                        value={height}
                        onChange={e => setHeight(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
                    />
                </div>
            </div>

            <div className="mb-3">
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Prompt</label>
                <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    rows={3}
                    placeholder="A small moon orbits a planet, pixel-art style, deep space blues and cyans, transparent background, 6 frames…"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono"
                />
            </div>

            <div className="mb-4">
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Negative Prompt (optional)</label>
                <input
                    value={negativePrompt}
                    onChange={e => setNegativePrompt(e.target.value)}
                    placeholder="blurry, low quality, text, watermark"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-white font-mono"
                />
            </div>

            <button
                onClick={generate}
                disabled={busy}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold uppercase tracking-widest text-sm rounded transition-colors flex items-center gap-2"
            >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? 'Generating…' : 'Generate'}
            </button>
        </div>
    );
}