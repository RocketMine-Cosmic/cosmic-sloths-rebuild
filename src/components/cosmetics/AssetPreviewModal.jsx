import React from 'react';
import { X, Copy } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function AssetPreviewModal({ asset, onClose }) {
    const { toast } = useToast();

    const copy = (text, label) => {
        navigator.clipboard.writeText(text);
        toast({ title: `${label} copied` });
    };

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur flex items-center justify-center p-4 z-50"
            onClick={onClose}
        >
            <div
                className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
                onClick={e => e.stopPropagation()}
            >
                {/* Image */}
                <div className="md:w-1/2 bg-slate-950 flex items-center justify-center p-4">
                    <img
                        src={asset.url}
                        alt={asset.cosmetic_id}
                        className="max-w-full max-h-[70vh] object-contain"
                    />
                </div>

                {/* Meta panel */}
                <div className="md:w-1/2 p-5 overflow-y-auto flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Cosmetic ID</div>
                            <div className="text-white font-mono text-sm break-all">{asset.cosmetic_id}</div>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Category</div>
                            <div className="text-slate-200 text-sm">{asset.category || 'other'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Rarity</div>
                            <div className="text-slate-200 text-sm">{asset.rarity || 'standard'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Status</div>
                            <div className="text-slate-200 text-sm">{asset.status?.replace('_', ' ')}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Attempt</div>
                            <div className="text-slate-200 text-sm">{asset.attempt || 1}</div>
                        </div>
                        <div className="col-span-2">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Model</div>
                            <div className="text-slate-200 text-sm font-mono break-all">{asset.model_id}</div>
                        </div>
                        {(asset.width || asset.height) && (
                            <div className="col-span-2">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Dimensions</div>
                                <div className="text-slate-200 text-sm">{asset.width || '?'} × {asset.height || '?'}</div>
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Prompt</div>
                            <button onClick={() => copy(asset.prompt, 'Prompt')} className="text-slate-500 hover:text-cyan-400"><Copy className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="text-slate-200 text-sm bg-slate-950 border border-slate-800 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">{asset.prompt}</div>
                    </div>

                    {asset.negative_prompt && (
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Negative Prompt</div>
                                <button onClick={() => copy(asset.negative_prompt, 'Negative prompt')} className="text-slate-500 hover:text-cyan-400"><Copy className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="text-slate-200 text-sm bg-slate-950 border border-slate-800 rounded p-2 max-h-24 overflow-y-auto whitespace-pre-wrap">{asset.negative_prompt}</div>
                        </div>
                    )}

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500">URL</div>
                            <button onClick={() => copy(asset.url, 'URL')} className="text-slate-500 hover:text-cyan-400"><Copy className="w-3.5 h-3.5" /></button>
                        </div>
                        <a
                            href={asset.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-300 text-xs font-mono break-all hover:underline"
                        >{asset.url}</a>
                    </div>
                </div>
            </div>
        </div>
    );
}