import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Target } from 'lucide-react';
import { SaveManager } from '../game/SaveManager';
import { SoundManager } from '../game/SoundManager';
import BountiesPanel from '../components/game/BountiesPanel';
import DailyTasksPanel from '../components/game/DailyTasksPanel';
import DailyLoginPanel from '../components/game/DailyLoginPanel';
import SpaceBackground from '../components/game/SpaceBackground';
import CurrencyHeader from '../components/game/CurrencyHeader';
import OmenXGate from '../components/game/OmenXGate';
import { useOmenXConfirmation } from '@/hooks/useOmenXConfirmation';
import OmenXConfirmation from '../components/game/OmenXConfirmation';

export default function Dailys({ isCarousel }) {
    const navigate = useNavigate();
    const [save, setSave] = useState(SaveManager.load());
    const { pending, setPending } = useOmenXConfirmation('dailys-page');

    useEffect(() => {
        const handleSaveUpdated = (e) => setSave(e.detail);
        window.addEventListener('saveUpdated', handleSaveUpdated);
        return () => window.removeEventListener('saveUpdated', handleSaveUpdated);
    }, []);

    return (
        <OmenXGate isCarousel={isCarousel}>
        <div className={`${isCarousel ? 'min-h-full' : 'min-h-screen'} relative text-slate-200 p-2 pb-20 md:p-6 font-sans`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-5xl mx-auto h-full flex flex-col">
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
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-2" style={{ background: 'linear-gradient(90deg, #34D399, #10B981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(52,211,153,0.5))' }}>
                            <Target className="w-6 h-6 md:w-8 md:h-8 text-emerald-400" /> STAR OPS
                        </h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">Complete daily missions and bounties for rewards.</p>
                    </div>
                    <CurrencyHeader />
                </header>
                
                <div className="flex-1 overflow-y-auto">
                    <DailyLoginPanel save={save} setSave={setSave} />
                    <BountiesPanel save={save} setSave={setSave} />
                    <DailyTasksPanel save={save} setSave={setSave} />
                </div>
            </div>
        </div>
        
        {pending && (
            <OmenXConfirmation
                amount={pending.amount}
                itemName={pending.itemName}
                onConfirm={pending.onConfirm}
                onCancel={pending.onCancel}
                pageId="dailys-page"
            />
        )}
        </OmenXGate>
    );
}