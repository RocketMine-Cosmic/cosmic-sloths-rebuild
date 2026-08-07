import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Disc3 } from 'lucide-react';
import SpaceBackground from '../components/game/SpaceBackground';
import CurrencyHeader from '../components/game/CurrencyHeader';
import JukeboxPanel from '../components/game/JukeboxPanel';
import { SoundManager } from '../game/SoundManager';

export default function Jukebox({ isCarousel }) {
    const navigate = useNavigate();

    return (
        <div className={`${isCarousel ? 'h-full flex flex-col' : 'h-[100dvh] flex flex-col'} relative text-slate-200 p-2 pb-2 md:p-6 font-sans overflow-hidden`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col min-h-0 relative z-10">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 mb-4 md:mb-6 border-b border-slate-800 pb-2 md:pb-4 shrink-0">
                    <div>
                        {!isCarousel && (
                            <button
                                onClick={() => { SoundManager.playUIClick(); navigate('/'); }}
                                className="mb-2 md:mb-4 flex items-center gap-1.5 md:gap-2 text-slate-400 hover:text-white transition-colors font-bold text-xs md:text-sm bg-slate-900 px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-slate-700 w-fit"
                            >
                                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Main Menu
                            </button>
                        )}
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-2 md:gap-3" style={{ background: 'linear-gradient(90deg, #D946EF, #06B6D4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(217,70,239,0.5))' }}>
                            <Disc3 className="w-7 h-7 md:w-9 md:h-9 text-fuchsia-400 animate-spin" style={{ animationDuration: '8s' }} />
                            STELLAR JUKEBOX
                        </h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">Curate your cosmic soundtrack.</p>
                    </div>
                    <CurrencyHeader />
                </header>

                <div className="flex-1 overflow-y-auto pr-1 pb-10">
                    <JukeboxPanel />
                </div>
            </div>
        </div>
    );
}