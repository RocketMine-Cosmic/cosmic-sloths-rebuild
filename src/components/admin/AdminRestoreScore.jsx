import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Search } from 'lucide-react';
import { useAvailablePeriods, getCurrentWeekId, getCurrentSeasonId, seasonIdFromWeekId } from './useAvailablePeriods';

const ARENAS = ['station', 'asteroid', 'nebula', 'voidring', 'singularity', 'endless'];
const CHARACTERS = ['neobyte', 'pandypaws', 'novabyte', 'glitch', 'holodrift', 'codebreaker', 'dataphantom', 'neonvortex', 'synthbeats', 'skybyte'];

export default function AdminRestoreScore({ walletAddress: adminWalletAddress }) {
    const [walletQuery, setWalletQuery] = useState('');
    const [player, setPlayer] = useState(null);
    const [searching, setSearching] = useState(false);
    const [msg, setMsg] = useState('');
    const { weeks, currentWeek } = useAvailablePeriods(adminWalletAddress);

    const [form, setForm] = useState({
        score: 15000,
        kills: 400,
        level: 20,
        time_survived: 600,
        character_id: 'skybyte',
        arena_id: 'nebula',
        week_id: getCurrentWeekId(),
        season_id: getCurrentSeasonId(),
    });
    const [submitting, setSubmitting] = useState(false);

    // Keep season_id in lockstep with week_id so staff can't desync them.
    const setWeek = (weekId) => {
        setForm(f => ({ ...f, week_id: weekId, season_id: seasonIdFromWeekId(weekId) || f.season_id }));
    };

    const findPlayer = async () => {
        const q = walletQuery.trim();
        if (!q) return;
        setSearching(true); setMsg(''); setPlayer(null);
        try {
            const res = await base44.functions.invoke('getAdminDataExtended', { type: 'playerSearch', query: q });
            const players = res.data?.players || [];
            if (players.length === 0) { setMsg('✗ No player found.'); }
            else { setPlayer(players[0]); }
        } catch (e) { setMsg(`✗ ${e.message}`); }
        setSearching(false);
    };

    const restore = async () => {
        if (!player) return;
        setSubmitting(true); setMsg('');
        try {
            const save = player.save_data || {};
            await base44.entities.RunScore.create({
                user_id: player.created_by_id || '',
                wallet_address: player.wallet_address,
                player_name: save.pilotName || save.player_name || player.player_name || 'Unknown',
                player_title: save.player_title || '',
                pilot_icon: save.pilot_icon || '',
                score: Number(form.score),
                kills: Number(form.kills),
                level: Number(form.level),
                time_survived: Number(form.time_survived),
                character_id: form.character_id,
                arena_id: form.arena_id,
                week_id: form.week_id.trim(),
                season_id: form.season_id.trim(),
            });
            await base44.entities.AdminChangesLog.create({
                wallet_address: adminWalletAddress,
                action_type: 'player_action',
                description: `Restored score for ${player.wallet_address}: ${form.score} (${form.week_id}/${form.arena_id})`,
                details: { ...form, target_wallet: player.wallet_address },
            });
            setMsg(`✓ Score of ${Number(form.score).toLocaleString()} restored for ${save.pilotName || player.wallet_address}`);
        } catch (e) { setMsg(`✗ ${e.message}`); }
        setSubmitting(false);
    };

    const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

    return (
        <div className="bg-[#0b0416]/80 border border-emerald-900/50 rounded-xl p-4">
            <h2 className="text-base font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Plus size={16} /> Restore Deleted Score
            </h2>
            <div className="text-xs text-slate-400 mb-4">
                Manually recreates a RunScore record (e.g. after accidentally deleting one in the duplicates tool).
                Only writes to the leaderboard — does not touch PlayerSave.
            </div>

            {/* Step 1: find player */}
            <div className="flex gap-2 mb-3">
                <input type="text" value={walletQuery} onChange={e => setWalletQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && findPlayer()}
                    placeholder="Wallet address or player name..."
                    className="flex-1 bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" />
                <button onClick={findPlayer} disabled={searching}
                    className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2">
                    <Search size={14} /> {searching ? '...' : 'Find'}
                </button>
            </div>

            {player && (
                <div className="bg-slate-900/60 border border-emerald-700/40 rounded-lg p-3 mb-3">
                    <div className="text-sm font-bold text-white">
                        {player.save_data?.pilotName || player.save_data?.player_name || player.player_name || 'Unnamed'}
                        <span className="ml-2 text-[10px] text-slate-500 font-mono">{player.wallet_address?.slice(0,10)}...{player.wallet_address?.slice(-6)}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                        Max lvl: {player.save_data?.maxLevelReached || 0} · Max time: {player.save_data?.maxTimeSurvived || 0}s · Total kills: {(player.save_data?.totalKills || 0).toLocaleString()}
                    </div>
                </div>
            )}

            {/* Step 2: form */}
            {player && (
                <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    <Field label="Score" value={form.score} onChange={set('score')} type="number" />
                    <Field label="Kills" value={form.kills} onChange={set('kills')} type="number" />
                    <Field label="Level" value={form.level} onChange={set('level')} type="number" />
                    <Field label="Time (sec)" value={form.time_survived} onChange={set('time_survived')} type="number" />
                    <SelectField label="Character" value={form.character_id} onChange={set('character_id')} options={CHARACTERS} />
                    <SelectField label="Arena" value={form.arena_id} onChange={set('arena_id')} options={ARENAS} />
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Week</span>
                        <select value={form.week_id} onChange={e => setWeek(e.target.value)} style={{ colorScheme: 'dark' }}
                            className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-500 font-mono">
                            {weeks.map(w => (
                                <option key={w} value={w}>{w}{w === currentWeek ? ' (current)' : ''}</option>
                            ))}
                            {!weeks.includes(form.week_id) && <option value={form.week_id}>{form.week_id}</option>}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Season (auto)</span>
                        <input type="text" value={form.season_id} readOnly
                            className="bg-slate-900/50 border border-slate-700 text-slate-400 rounded px-2 py-1 text-xs font-mono cursor-not-allowed" />
                    </label>
                </div>
                <button onClick={restore} disabled={submitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2 rounded text-sm">
                    {submitting ? 'Restoring...' : 'Restore Score'}
                </button>
                </>
            )}

            {msg && <div className={`mt-3 text-sm font-mono ${msg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</div>}
        </div>
    );
}

function Field({ label, value, onChange, type = 'text' }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
            <input type={type} value={value} onChange={onChange}
                className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-500" />
        </label>
    );
}
function SelectField({ label, value, onChange, options }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
            <select value={value} onChange={onChange} style={{ colorScheme: 'dark' }}
                className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-500">
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        </label>
    );
}