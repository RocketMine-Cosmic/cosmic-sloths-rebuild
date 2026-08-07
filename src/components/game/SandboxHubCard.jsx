import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { SoundManager } from '../../game/SoundManager';
import { isS8OrLater } from '@/lib/seasonGate';

// S8 Sandbox / Test Play — Hub entry tile. Just a navigation shortcut into the
// dedicated /sandbox setup page (see pages/Sandbox.jsx). All the actual picker
// UI + the "no rewards" warning live there. Gated to S8+ so pre-launch it
// stays hidden. See docs/s8/PLAN_SANDBOX_TEST_PLAY.md §UX.
export default function SandboxHubCard() {
    const navigate = useNavigate();

    if (!isS8OrLater()) return null;

    const launchSandbox = () => {
        SoundManager.playUIClick();
        navigate('/sandbox');
    };

    return (
        <button
            onClick={launchSandbox}
            className="relative bg-[#0b0416]/80 backdrop-blur-xl rounded-lg md:rounded-xl border border-yellow-500/50 hover:border-yellow-400 overflow-hidden shadow-[0_0_15px_rgba(234,179,8,0.15)] hover:shadow-[0_0_20px_rgba(234,179,8,0.3)] transition-all group"
            title="Practice runs — no rewards, no leaderboard, no kill credit"
        >
            <div className="relative flex items-center justify-between p-2 md:p-3 min-h-[64px] md:min-h-[80px]">
                <span className="flex items-center gap-2 md:gap-3 z-10">
                    <FlaskConical className="w-5 h-5 md:w-6 md:h-6 text-yellow-400" />
                    <span className="flex flex-col items-start">
                        <span className="text-sm md:text-lg font-black tracking-widest uppercase text-white group-hover:text-yellow-200 transition-colors flex items-center gap-2">
                            Practice Range
                            <span className="text-[9px] font-black bg-yellow-500 text-slate-900 px-1.5 py-0.5 rounded uppercase tracking-widest">NEW</span>
                        </span>
                        <span className="text-[10px] md:text-xs text-slate-400 group-hover:text-slate-300 font-normal normal-case tracking-normal">
                            Try builds — no rewards, no LB, no kill credit
                        </span>
                    </span>
                </span>
                <span className="text-yellow-300 text-lg md:text-xl font-black group-hover:translate-x-1 transition-transform z-10">→</span>
            </div>
        </button>
    );
}