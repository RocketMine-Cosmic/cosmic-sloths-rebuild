import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Crown, ShieldOff } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getOmenXUserSync } from '@/lib/omenxUser';
import { SoundManager } from '../game/SoundManager';
import SpaceBackground from '../components/game/SpaceBackground';
import OmenXGate from '../components/game/OmenXGate';
import SetDailyGoalPanel from '../components/squads/leader/SetDailyGoalPanel';
import MemberActivityFeed from '../components/squads/leader/MemberActivityFeed';
import InactiveMembersPanel from '../components/squads/leader/InactiveMembersPanel';

// Leader-only dashboard. Read-only members get redirected to /squads.
export default function SquadLeaderDashboard() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [squadId, setSquadId] = useState(null);
    const [squad, setSquad] = useState(null);
    const [activity, setActivity] = useState([]);
    const [members, setMembers] = useState([]);
    const [goal, setGoal] = useState(null);

    const refreshActivity = useCallback(async (sId) => {
        if (!sId) return;
        try {
            const res = await base44.functions.invoke('squadActions', { action: 'getMemberActivity', squadId: sId });
            if (res.data?.error) throw new Error(res.data.error);
            setActivity(res.data?.activity || []);
            setMembers(res.data?.members || []);
        } catch (e) {
            console.error('[LeaderDashboard] activity load failed:', e);
        }
    }, []);

    const refreshGoal = useCallback(async (sId) => {
        if (!sId) return;
        try {
            const res = await base44.functions.invoke('squadActions', { action: 'getDailyGoal', squadId: sId });
            setGoal(res.data?.goal || null);
        } catch {}
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const user = getOmenXUserSync();
                const wallet = user?.walletAddress;
                if (!wallet) {
                    if (!cancelled) { setError('Sign in to view your dashboard.'); setLoading(false); }
                    return;
                }
                const memberRecords = await base44.entities.SquadMember.filter({ wallet_address: wallet });
                if (!memberRecords || memberRecords.length === 0) {
                    if (!cancelled) { setError('You\'re not in a squad.'); setLoading(false); }
                    return;
                }
                const me = memberRecords[0];
                if (me.role !== 'leader') {
                    if (!cancelled) { setError('Only the squad leader can access this dashboard.'); setLoading(false); }
                    return;
                }
                const sq = await base44.entities.Squad.get(me.squad_id);
                if (cancelled) return;
                setSquadId(me.squad_id);
                setSquad(sq);
                await Promise.all([refreshActivity(me.squad_id), refreshGoal(me.squad_id)]);
            } catch (e) {
                if (!cancelled) setError(e.message || 'Failed to load dashboard.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [refreshActivity, refreshGoal]);

    return (
        <OmenXGate>
            <div className="min-h-screen relative text-slate-200 font-sans">
                <SpaceBackground />
                <div className="relative z-10 max-w-5xl mx-auto px-3 md:px-6 pt-4 pb-20">
                    <button
                        onClick={() => { SoundManager.playUIClick(); navigate('/squads'); }}
                        className="mb-3 flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors font-bold text-xs bg-slate-900 px-2 py-1 rounded border border-slate-700"
                    >
                        <ArrowLeft className="w-3 h-3" /> Back to Squads
                    </button>

                    <div className="mb-5 flex items-center gap-3 flex-wrap">
                        <Crown className="w-6 h-6 text-amber-400" />
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
                                Leader Dashboard
                            </h1>
                            {squad && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {squad.icon || '🛡️'} <span className="text-white font-bold">[{squad.tag}] {squad.name}</span>
                                    <span className="text-slate-500"> · Lv {squad.level || 1} · {squad.member_count || 0} members</span>
                                </p>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center text-slate-400 italic py-12">Loading dashboard…</div>
                    ) : error ? (
                        <div className="bg-rose-950/30 border border-rose-700/50 rounded-xl p-6 text-center">
                            <ShieldOff className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                            <div className="text-rose-300 font-bold">{error}</div>
                            <button
                                onClick={() => navigate('/squads')}
                                className="mt-3 text-xs bg-rose-700 hover:bg-rose-600 text-white px-4 py-2 rounded font-bold"
                            >
                                Go to Squads
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                            <SetDailyGoalPanel
                                squadId={squadId}
                                currentGoal={goal}
                                onChange={(g) => setGoal(g)}
                            />
                            <InactiveMembersPanel
                                squadId={squadId}
                                members={members}
                                onKicked={() => refreshActivity(squadId)}
                            />
                            <div className="lg:col-span-2">
                                <MemberActivityFeed activity={activity} loading={false} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </OmenXGate>
    );
}