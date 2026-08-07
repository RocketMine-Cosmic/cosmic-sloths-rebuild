import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Loader2 } from 'lucide-react';

export const PILOT_ICONS = ['🦥', '🐉', '🤖', '👾', '🦊', '🐺', '🦁', '🐸', '👻', '💀', '🤠', '🥷', '🧙', '🦄', '🐼', '🐧', '🦅', '🐙', '🦂', '⚡'];
export const SQUAD_ICONS = ['🛡️', '⚔️', '🔥', '💀', '🌌', '🐉', '🤖', '👾', '☠️', '🦅', '🌙', '⭐', '🌀', '💥', '🎯', '🪐', '🧬', '🏴‍☠️', '⚡', '🦁'];

export default function EmojiPicker({ options, selected, onSelect, onClose }) {
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            if (file_url) {
                onSelect(file_url);
                onClose();
            }
        } catch (error) {
            console.error('Upload failed', error);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="absolute z-50 bg-slate-800 border border-slate-600 rounded-xl p-3 shadow-2xl mt-2" style={{ minWidth: 260 }}>
            <div className="grid grid-cols-5 gap-2 mb-3">
                {options.map(emoji => (
                    <button
                        key={emoji}
                        onClick={() => { onSelect(emoji); onClose(); }}
                        className={`text-2xl p-2 rounded-lg transition-colors flex items-center justify-center hover:bg-slate-700 ${selected === emoji ? 'bg-cyan-900 ring-2 ring-cyan-500' : ''}`}
                    >
                        {emoji?.startsWith('http') ? <img src={emoji} className="w-full h-full object-cover rounded-md" alt="icon" /> : emoji}
                    </button>
                ))}
            </div>
            
            <div className="border-t border-slate-700 pt-3 mb-2">
                <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleUpload} 
                />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors"
                >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploading ? 'Uploading...' : 'Upload Image'}
                </button>
            </div>

            <button onClick={onClose} className="w-full text-xs text-slate-400 hover:text-white text-center py-1">Cancel</button>
        </div>
    );
}