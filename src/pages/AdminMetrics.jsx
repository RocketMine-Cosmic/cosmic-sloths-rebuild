import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { SoundManager } from '../game/SoundManager';
import SpaceBackground from '../components/game/SpaceBackground';
import { base44 } from '@/api/base44Client';
import AdminRetention from '../components/admin/AdminRetention';
import AdminDeepMetrics from '../components/admin/AdminDeepMetrics';

// Dedicated player-metrics page. Sits outside the AdminDashboard tab system so
// it can grow (cohorts, funnels, segmentation) without crowding the admin nav.
// Auth uses the same pattern as AdminDashboard: Base44 session → AdminWallet
// lookup via getAdminData('isAdmin'). Anyone with 'view_data' (or owner) sees it.
export default function AdminMetrics() {
    const navigate = useNavigate();
    const [adminWallet, setAdminWallet] = useState(() => sessionStorage.getItem('admin_wallet') || '');
    const [callerPerms, setCallerPerms] = useState(null);
    const [authError, setAuthError] = useState('');
    const isEmergencyKey = adminWallet === 'admin_mode';

    useEffect(() => {
        if (!adminWallet || isEmergencyKey) {
            setCallerPerms(isEmergencyKey ? ['__emergency__'] : null);
            return;
        }
        base44.functions.invoke('getAdminData', { type: 'isAdmin' })
            .then(r => setCallerPerms(r.data?.permissions || []))
            .catch(() => setCallerPerms([]));
    }, [adminWallet, isEmergencyKey]);

    // Not signed in yet — bounce back to AdminDashboard for the auth flow.
    if (!adminWallet) {
        return (
            <div className="min-h-screen relative text-slate-200 flex items-center justify-center font-sans p-4">
                <SpaceBackground />
                <div className="relative z-10 w-full max-w-sm bg-[#0b0416]/90 border border-red-900/50 rounded-xl p-6 text-center">
                    <h1 className="text-xl font-black uppercase tracking-widest text-red-400 mb-3">Admin Sign-In Required</h1>
                    <p className="text-xs text-slate-400 mb-4">Sign in via the Admin Dashboard first.</p>
                    <button
                        onClick={() => { SoundManager.playUIClick(); navigate('/admin'); }}
                        className="bg-cyan-700 hover:bg-cyan-600 text-white font-bold px-4 py-2 rounded text-sm"
                    >
                        Go to Admin Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const hasAccess = isEmergencyKey || (callerPerms || []).includes('owner') || (callerPerms || []).includes('view_data');

    if (callerPerms === null) {
        return (
            <div className="min-h-screen relative text-slate-200 flex items-center justify-center font-sans">
                <SpaceBackground />
                <div className="relative z-10 w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!hasAccess) {
        return (
            <div className="min-h-screen relative text-slate-200 flex items-center justify-center font-sans p-4">
                <SpaceBackground />
                <div className="relative z-10 max-w-sm bg-[#0b0416]/90 border border-red-900/50 rounded-xl p-6 text-center">
                    <h1 className="text-xl font-black uppercase tracking-widest text-red-400 mb-2">Access Denied</h1>
                    <p className="text-xs text-slate-400 mb-4">You need <span className="font-mono text-cyan-400">view_data</span> permission to view player metrics.</p>
                    <button
                        onClick={() => navigate('/admin')}
                        className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded text-sm"
                    >
                        Back to Admin Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const label = isEmergencyKey
        ? '🔑 Emergency Key Mode'
        : (callerPerms || []).includes('owner')
            ? `👑 Owner — ${adminWallet.slice(0, 6)}...${adminWallet.slice(-4)}`
            : `Staff — ${adminWallet.slice(0, 6)}...${adminWallet.slice(-4)}`;

    return (
        <div className="min-h-screen relative text-slate-200 font-sans">
            <SpaceBackground />
            <div className="max-w-7xl mx-auto relative z-10 p-3 md:p-6 pb-20">
                <header className="flex items-center justify-between mb-6 border-b border-cyan-900/40 pb-3 gap-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            onClick={() => { SoundManager.playUIClick(); navigate('/admin'); }}
                            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors font-bold text-xs bg-slate-900 px-2 py-1 rounded border border-slate-700"
                        >
                            <ArrowLeft className="w-3 h-3" /> Back to Admin
                        </button>
                        <h1 className="text-lg md:text-3xl font-black tracking-widest uppercase flex items-center gap-2" style={{ color: '#06b6d4', textShadow: '0 0 10px rgba(6,182,212,0.5)' }}>
                            <BarChart3 className="w-5 h-5 md:w-7 md:h-7" /> Player Metrics
                        </h1>
                        <span className="text-[10px] md:text-xs font-mono text-slate-500 hidden md:inline">{label}</span>
                    </div>
                </header>

                <AdminRetention />
                <div className="h-6" />
                <AdminDeepMetrics />
            </div>
        </div>
    );
}