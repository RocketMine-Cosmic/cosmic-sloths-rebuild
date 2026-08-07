import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SquadMeteorPanel from '../components/squads/SquadMeteorPanel';
import MeteorPoolBiasSelector from '../components/squads/MeteorPoolBiasSelector';
import SpaceBackground from '../components/game/SpaceBackground';
import CurrencyHeader from '../components/game/CurrencyHeader';
import OmenXGate from '../components/game/OmenXGate';
import { SoundManager } from '../game/SoundManager';

// Standalone Squad Meteor page — broken out of the Squads tab bar so the panel
// gets the full screen + a deep-linkable route (/squad-meteor). Reuses the
// existing SquadMeteorPanel component, no business logic changes.
export default function SquadMeteor() {
    const navigate = useNavigate();

    return (
        <OmenXGate>
            <div className="h-[100dvh] flex flex-col relative text-slate-200 p-2 pb-2 md:p-6 font-sans overflow-hidden">
                <SpaceBackground />
                {/* Always-visible back button (top-left, fixed) — guarantees the user
                    can return to Squads even if the page header scrolls off on mobile. */}
                <button
                    onClick={() => { SoundManager.playUIClick(); navigate('/?slide=5'); }}
                    className="fixed top-3 left-3 z-50 flex items-center gap-1.5 md:gap-2 text-slate-300 hover:text-white transition-colors font-bold text-xs md:text-sm bg-slate-900/90 backdrop-blur px-2.5 py-1.5 md:px-3 md:py-2 rounded-md md:rounded-lg border border-slate-700 hover:border-cyan-500 shadow-lg"
                >
                    <ArrowLeft className="w-3.5 h-3.5 md:w-4 md:h-4" /> Back to Squads
                </button>
                <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col min-h-0 pt-10 md:pt-0">
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 mb-4 md:mb-6 border-b border-slate-800 pb-2 md:pb-4 shrink-0">
                        <div>
                            <h1
                                className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-2"
                                style={{
                                    background: 'linear-gradient(90deg, #F97316, #A855F7)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    filter: 'drop-shadow(0 0 10px rgba(168,85,247,0.5))',
                                }}
                            >
                                ☄️ SQUAD METEOR
                            </h1>
                            <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">
                                Strike together. Level the meteor. Buff the whole squad.
                            </p>
                        </div>
                        <CurrencyHeader />
                    </header>

                    <div className="flex-1 bg-[#0b0416]/80 backdrop-blur-xl border border-purple-500/30 shadow-[0_0_30px_rgba(168,85,247,0.15)] rounded-xl flex flex-col overflow-hidden min-h-0 p-3 md:p-4">
                        <MeteorPoolBiasSelector />
                        <SquadMeteorPanel />
                    </div>
                </div>
            </div>
        </OmenXGate>
    );
}