import React from 'react';
import { Eye } from 'lucide-react';

// Floating "Show HUD" button shown only while the HUD is hidden for screenshots.
// Sits in the top-right corner so it's easy to find but out of the way for screenshots.
export default function HideHudButton({ onShow }) {
    return (
        <button
            onClick={onShow}
            data-allow-edge-touch="true"
            className="fixed top-2 right-2 md:top-4 md:right-4 z-50 bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-cyan-500/60 rounded-lg p-2 md:p-2.5 text-cyan-300 hover:text-white transition-all pointer-events-auto"
            title="Show HUD"
        >
            <Eye className="w-4 h-4 md:w-5 md:h-5" />
        </button>
    );
}