import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Crown, ArrowLeft, Search, Filter } from 'lucide-react';
import { SoundManager } from '../game/SoundManager';
import { useOmenXUser } from '@/hooks/useOmenXUser';
import SpaceBackground from '../components/game/SpaceBackground';
import OmenXGate from '../components/game/OmenXGate';
import CurrencyHeader from '../components/game/CurrencyHeader';
import WarArchiveRow from '../components/squadwars/WarArchiveRow';

// Global archive of every resolved Squad War. Lets players see full history,
// filter by week or squad name, and clearly see who won each encounter.
export default function WarArchive({ isCarousel }) {
    const navigate = useNavigate();
    const { user: omenxUser } = useOmenXUser();

    const [wars, setWars] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mySquadId, setMySquadId] = useState(null);
    const [filterText, setFilterText] = useState('');
    const [weekFilter, setWeekFilter] = useState('all');
    const [resultFilter, setResultFilter] = useState('all'); // all | decisive | tie | bye

    // Resolve own squad id (for the "YOU" highlight)
    useEffect(() => {
        const rawWallet = omenxUser?.wallet_address || omenxUser?.walletAddress || omenxUser?.data?.wallet_address || '';
        if (!rawWallet) return;
        (async () => {
            try {
                const wallet = rawWallet.toLowerCase();
                let members = await base44.entities.SquadMember.filter({ wallet_address: wallet });
                if (members.length === 0 && wallet !== rawWallet) {
                    members = await base44.entities.SquadMember.filter({ wallet_address: rawWallet });
                }
                if (members.length > 0) setMySquadId(members[0].squad_id);
            } catch (e) {
                console.error('[WarArchive] membership lookup failed', e);
            }
        })();
    }, [omenxUser]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const res = await base44.functions.invoke('squadWarEngine', { action: 'getArchive', limit: 300 });
                setWars(res.data?.wars || []);
            } catch (e) {
                console.error('[WarArchive] load failed', e);
            }
            setLoading(false);
        })();
    }, []);

    const allWeeks = useMemo(() => {
        const set = new Set(wars.map(w => w.week_id).filter(Boolean));
        return Array.from(set).sort().reverse();
    }, [wars]);

    const filtered = useMemo(() => {
        const q = filterText.trim().toLowerCase();
        return wars.filter(w => {
            if (weekFilter !== 'all' && w.week_id !== weekFilter) return false;
            if (resultFilter === 'decisive' && (w.result_kind === 'tie' || w.result_kind === 'bye')) return false;
            if (resultFilter === 'tie' && w.result_kind !== 'tie') return false;
            if (resultFilter === 'bye' && w.result_kind !== 'bye') return false;
            if (q) {
                const blob = `${w.squad_a_name} ${w.squad_a_tag} ${w.squad_b_name} ${w.squad_b_tag} ${w.week_id}`.toLowerCase();
                if (!blob.includes(q)) return false;
            }
            return true;
        });
    }, [wars, filterText, weekFilter, resultFilter]);

    return (
        <OmenXGate isCarousel={isCarousel}>
        <div className={`${isCarousel ? 'h-full flex flex-col' : 'min-h-screen'} relative text-slate-200 p-2 pb-20 md:p-6 font-sans`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col min-h-0 relative z-10">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 mb-4 border-b border-slate-800 pb-2 md:pb-4 shrink-0">
                    <div>
                        <div className="mb-2 flex items-center gap-2 flex-wrap">
                            <button onClick={() => { SoundManager.playUIClick(); navigate(-1); }}
                                className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors font-bold text-xs bg-slate-900 px-2 py-1 rounded border border-slate-700 w-fit">
                                <ArrowLeft className="w-3 h-3" /> Back
                            </button>
                            <button onClick={() => { SoundManager.playUIClick(); navigate('/'); }}
                                className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors font-bold text-xs bg-slate-900 px-2 py-1 rounded border border-slate-700 w-fit">
                                <ArrowLeft className="w-3 h-3" /> Main Menu
                            </button>
                        </div>
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-2"
                            style={{ background: 'linear-gradient(90deg, #F59E0B, #EF4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(245,158,11,0.5))' }}>
                            <Crown className="w-6 h-6 md:w-8 md:h-8 text-amber-400" /> WAR ARCHIVE
                        </h1>
                        <p className="text-slate-400 mt-0.5 text-xs md:text-sm tracking-widest uppercase">
                            Every resolved war — kills, winners, history.
                        </p>
                    </div>
                    <CurrencyHeader />
                </header>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4 shrink-0">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                            value={filterText}
                            onChange={e => setFilterText(e.target.value)}
                            placeholder="Search squad name, tag, or week…"
                            className="w-full bg-slate-900/70 border border-slate-700 text-white rounded-lg pl-8 pr-3 py-2 text-xs md:text-sm focus:outline-none focus:border-amber-500"
                        />
                    </div>
                    <select value={weekFilter} onChange={e => setWeekFilter(e.target.value)}
                        className="bg-slate-900/70 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs md:text-sm focus:outline-none focus:border-amber-500">
                        <option value="all">All weeks</option>
                        {allWeeks.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                    <select value={resultFilter} onChange={e => setResultFilter(e.target.value)}
                        className="bg-slate-900/70 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs md:text-sm focus:outline-none focus:border-amber-500">
                        <option value="all">All results</option>
                        <option value="decisive">🏆 Decisive wins</option>
                        <option value="tie">🤝 Ties</option>
                        <option value="bye">✓ Byes</option>
                    </select>
                </div>

                <div className="flex-1 bg-[#0b0416]/60 backdrop-blur-xl rounded-xl border border-amber-500/20 p-3 md:p-5 shadow-[0_0_30px_rgba(245,158,11,0.08)] overflow-y-auto min-h-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16 text-slate-500">
                            <Filter className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                            <div>No wars match your filters.</div>
                        </div>
                    ) : (
                        <>
                            <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-widest">
                                Showing {filtered.length} resolved war{filtered.length === 1 ? '' : 's'}
                            </div>
                            <div className="space-y-2 md:space-y-3">
                                {filtered.map(w => (
                                    <WarArchiveRow key={w.id} war={w} mySquadId={mySquadId} />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
        </OmenXGate>
    );
}