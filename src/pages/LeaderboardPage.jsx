import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Crown, Trophy } from 'lucide-react';
import Leaderboard from '../components/game/Leaderboard';
import ChampionsPanel from '../components/squadwars/ChampionsPanel';
import { SoundManager } from '../game/SoundManager';
import SpaceBackground from '../components/game/SpaceBackground';
import CurrencyHeader from '../components/game/CurrencyHeader';
import OmenXGate from '../components/game/OmenXGate';
import { base44 } from '@/api/base44Client';
import { getOmenXUserSync } from '@/lib/omenxUser';

export default function LeaderboardPage({ isCarousel }) {
    const navigate = useNavigate();
    const [tab, setTab] = useState('players'); // 'players' | 'champions'
    const [mySquadId, setMySquadId] = useState(null);

    // Look up the current player's squad id so the Champions panel can highlight it.
    useEffect(() => {
        const user = getOmenXUserSync();
        const wallet = user?.walletAddress;
        if (!wallet) return;
        // Use cached membership first to avoid an extra round-trip.
        try {
            const cached = localStorage.getItem(`squad_membership_${wallet}`);
            if (cached) {
                setMySquadId(JSON.parse(cached).squad_id);
                return;
            }
        } catch (_) {}
        (async () => {
            try {
                const members = await base44.entities.SquadMember.filter({ wallet_address: wallet });
                if (members.length > 0) setMySquadId(members[0].squad_id);
            } catch (_) {}
        })();
    }, []);

    return (
        <OmenXGate isCarousel={isCarousel}>
        <div className={`${isCarousel ? 'min-h-full' : 'min-h-screen'} relative text-slate-200 p-2 pb-20 md:p-6 font-sans`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-5xl mx-auto">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 mb-4 md:mb-6 border-b border-slate-800 pb-2 md:pb-4">
                    <div>
                        {!isCarousel && (
                            <button 
                                onClick={() => { SoundManager.playUIClick(); navigate('/'); }}
                                className="mb-2 md:mb-4 flex items-center gap-1.5 md:gap-2 text-slate-400 hover:text-white transition-colors font-bold text-xs md:text-sm bg-slate-900 px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-slate-700 w-fit"
                            >
                                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Main Menu
                            </button>
                        )}
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest" style={{ background: 'linear-gradient(90deg, #FBBF24, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.5))' }}>HALL OF FAME</h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">The greatest cosmic sloths of all time.</p>
                    </div>
                    <CurrencyHeader />
                </header>

                {/* Tabs */}
                <div className="flex gap-2 mb-3 md:mb-4">
                    <button
                        onClick={() => { SoundManager.playUIClick(); setTab('players'); }}
                        className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-lg font-bold text-xs md:text-sm border transition-all ${tab === 'players' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-200' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
                    >
                        <Trophy className="w-3.5 h-3.5 md:w-4 md:h-4" /> Players
                    </button>
                    <button
                        onClick={() => { SoundManager.playUIClick(); setTab('champions'); }}
                        className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-lg font-bold text-xs md:text-sm border transition-all ${tab === 'champions' ? 'bg-amber-500/20 border-amber-500 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
                    >
                        <Crown className="w-3.5 h-3.5 md:w-4 md:h-4" /> Champions Pool
                    </button>
                </div>

                <div className="bg-[#0b0416]/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-3 md:p-6 border border-yellow-500/50 shadow-[0_0_60px_rgba(245,158,11,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] min-h-[400px] md:min-h-[600px]">
                    {tab === 'players' ? <Leaderboard /> : <ChampionsPanel mySquadId={mySquadId} />}
                </div>
            </div>
        </div>
        </OmenXGate>
    );
}