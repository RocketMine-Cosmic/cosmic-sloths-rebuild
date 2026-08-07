import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { SaveManager } from '../../game/SaveManager';

export default function SetProfileNameModal({ onComplete }) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSave = () => {
        const trimmed = name.trim();
        if (!trimmed) { setError('Please enter a name.'); return; }
        if (trimmed.length < 2) { setError('Name must be at least 2 characters.'); return; }
        if (trimmed.length > 20) { setError('Name must be 20 characters or less.'); return; }
        setSaving(true);
        const save = SaveManager.load();
        save.pilotName = trimmed;
        save.hasSetProfileName = true;
        SaveManager.save(save);
        onComplete(trimmed);
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-slate-900 border-2 border-cyan-500 p-8 rounded-xl max-w-sm w-full text-center shadow-[0_0_30px_rgba(6,182,212,0.3)]"
            >
                <div className="text-4xl mb-4">🦥</div>
                <h2 className="text-2xl font-bold text-cyan-400 mb-2 font-mono">PILOT CALLSIGN</h2>
                <p className="text-slate-400 text-sm mb-6">Choose your name for the leaderboard. This cannot be changed later.</p>

                <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    placeholder="Enter your callsign..."
                    maxLength={20}
                    className="w-full bg-slate-800 border border-slate-600 focus:border-cyan-500 text-white font-mono text-lg px-4 py-3 rounded-lg outline-none mb-2 text-center"
                    autoFocus
                />
                <div className="text-xs text-slate-500 mb-1">{name.trim().length}/20 characters</div>
                {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

                <button
                    onClick={handleSave}
                    disabled={saving || !name.trim()}
                    className="w-full mt-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-lg font-mono text-lg transition-colors"
                >
                    CONFIRM CALLSIGN
                </button>
            </motion.div>
        </div>
    );
}