import React from 'react';
import { WEAPONS } from '../../game/Constants';

// Pseudo-weapon ids — damage sources that aren't traditional weapons but should
// still appear in the post-run breakdown so the listed weapons add up to ~100%.
// Keeps Texxy's "I'm missing 50% of damage" bug from recurring.
const PSEUDO_WEAPON_NAMES = {
    squadUltimate:  'Squad Ultimate',
    neonExecute:    'NeonVortex Execute',
    hackedInfight:  'Hacked Enemies (Infighting)',
    novabyteChain:  'NovaByte Chain Explosion',
    sonicBoom:      'Skybyte Sonic Boom',
    nukePickup:     'Nuke Pickup',
    aegisMatrix:    'Aegis Retaliation',
    untaggedAoE:    'Untagged AoE Damage',
    other:          'Untracked Damage',
};

// Short hint shown under pseudo-weapon names so players understand what each
// non-weapon damage bucket represents (was the "What is other sources?"
// confusion in #general 2026-05-17).
const PSEUDO_WEAPON_HINTS = {
    squadUltimate:  "Damage from your squad's ultimate ability",
    neonExecute:    'NeonVortex execute splash + finisher shots',
    hackedInfight:  'Damage dealt by hacked enemies attacking each other (CodeBreaker)',
    novabyteChain:  "Chain explosions that fire on NovaByte's kills",
    sonicBoom:      'Skybyte\'s charge-release shockwave',
    nukePickup:     'Nuclear detonation pickups (☢️) that clear the screen',
    aegisMatrix:    'Aegis Matrix retaliation missiles fired when you take damage',
    untaggedAoE:    'AoE damage from a source the engine couldn\'t identify — report this to the team if it\'s a large %',
    other:          'Cosmic hazards + any remaining unclassified damage',
};

const formatWeaponName = (id) => PSEUDO_WEAPON_NAMES[id]
    || WEAPONS[id]?.name
    || id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();

// Shared scrollable stats box used by both GameOverModal and VictoryModal.
// Shows headline stats + an extended stats section (scrollable).
export default function RunStatsBox({ stats, accentClass = 'border-slate-700', hideKilledBy = false }) {
    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    // The server is the sole source of truth for credited gold/kills/fragments/score.
    // Until the saveScore response lands, those rows show a spinner placeholder
    // instead of fake client-side numbers (was the source of the "+3528 gold (capped)"
    // bug where the modal lied about what was actually banked).
    const serverConfirmed = !!stats._serverConfirmed;
    const saveFailed = !!stats._saveFailed;

    const totalDamage = Math.floor(stats.totalDamageDealt || 0);
    const dps = stats.time > 0 ? Math.floor(totalDamage / stats.time) : 0;
    const kpm = stats.time > 0 ? Math.floor((stats.kills / stats.time) * 60) : 0;
    const gpm = stats.time > 0 ? Math.floor((stats.gold / stats.time) * 60) : 0;
    const dmgPerKill = stats.kills > 0 ? Math.floor(totalDamage / stats.kills) : 0;
    const timePerLevel = stats.level > 0 ? Math.floor(stats.time / stats.level) : 0;
    const uniqueEnemyTypes = (stats.encountered && stats.encountered.length) || Object.keys(stats.enemyKills || {}).length;

    const allEnemies = Object.entries(stats.enemyKills || {}).sort((a, b) => b[1] - a[1]);
    const topEnemies = allEnemies.slice(0, 3);
    const formatEnemyName = (id) => id.replace(/^boss_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    // Per-weapon stats — combine damage + kills for the equipped weapons (sorted by damage).
    const weaponDamage = stats.weaponDamage || {};
    const weaponKills = stats.weaponKills || {};
    const weaponIds = new Set([...Object.keys(weaponDamage), ...Object.keys(weaponKills)]);
    const weaponBreakdown = Array.from(weaponIds).map(id => ({
        id,
        damage: Math.floor(weaponDamage[id] || 0),
        kills: weaponKills[id] || 0,
        share: totalDamage > 0 ? ((weaponDamage[id] || 0) / totalDamage) * 100 : 0,
    })).sort((a, b) => b.damage - a.damage);

    // Any total damage that wasn't credited to a specific weapon goes into an
    // "Other Sources" bucket — covers hacked-enemy infighting and any future
    // damage path that forgets to tag a weaponId. Only shown when it's >= 1%.
    const trackedDamageSum = weaponBreakdown.reduce((a, w) => a + w.damage, 0);
    const otherDamage = Math.max(0, totalDamage - trackedDamageSum);
    if (totalDamage > 0 && otherDamage / totalDamage >= 0.01) {
        weaponBreakdown.push({
            id: 'other',
            damage: otherDamage,
            kills: 0,
            share: (otherDamage / totalDamage) * 100,
        });
    }
    const mvpWeapon = weaponBreakdown[0];

    return (
        <div className={`mb-6 md:mb-8 text-left bg-slate-800 p-4 md:p-6 rounded-lg border ${accentClass}`}>
            {/* Headline stats — always visible */}
            <div className="space-y-3 md:space-y-4">
                {!hideKilledBy && stats.killedBy && (
                    <div className="flex justify-between items-center bg-red-950/40 border border-red-500/40 rounded-lg px-3 py-2 -mt-1 mb-1">
                        <span className="text-xs md:text-sm font-bold uppercase tracking-widest text-red-300 flex items-center gap-2">💀 Killed By</span>
                        <span className="text-red-200 font-bold text-sm md:text-base text-right truncate ml-2">{stats.killedBy}</span>
                    </div>
                )}
                <div className="flex justify-between items-center">
                    <span className="text-sm md:text-base text-slate-400">Time Survived</span>
                    <span className="text-white font-mono text-lg md:text-xl">{formatTime(stats.time)}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-sm md:text-base text-slate-400">Level Reached</span>
                    <span className="text-cyan-400 font-mono text-lg md:text-xl">{stats.level}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-sm md:text-base text-slate-400">
                        Enemies Defeated{serverConfirmed && stats.endlessKillsCapped && <span className="text-[9px] text-amber-400 ml-1">(credited)</span>}
                    </span>
                    <span className="text-white font-mono text-lg md:text-xl">{stats.kills} <span className="text-[10px] text-slate-500">({kpm}/min)</span></span>
                </div>
                <div className="flex justify-between items-center pt-3 md:pt-4 border-t border-slate-700">
                    <span className="text-sm md:text-base text-slate-400">Total Damage</span>
                    <span className="text-orange-400 font-mono text-lg md:text-xl">{totalDamage.toLocaleString()}</span>
                </div>
                {/* Squad Meteor runs are damage-contribution only — they don't credit
                    gold, fragments, or submit a leaderboard score. Show meteor damage
                    instead of those misleading rows. */}
                {stats.arenaId === 'quantum_meteor' ? (
                    <div className="flex justify-between items-center pt-3 md:pt-4 border-t border-slate-700">
                        <span className="text-sm md:text-base text-slate-400">Meteor Damage Dealt</span>
                        <span className="text-orange-400 font-mono text-xl md:text-2xl font-bold">{Math.floor(stats.meteorDamage || 0).toLocaleString()}</span>
                    </div>
                ) : (
                    <>
                        {stats.arenaId !== 'world_boss_arena' && (
                            <div className="flex justify-between items-center pt-3 md:pt-4 border-t border-slate-700">
                                <span className="text-sm md:text-base text-slate-400">
                                    Gold Credited
                                    {serverConfirmed && stats.endlessGoldCapped && <span className="text-[9px] text-amber-400 ml-1">(capped)</span>}
                                </span>
                                {serverConfirmed ? (
                                    <span className="text-yellow-400 font-mono text-lg md:text-xl">+{stats.gold}</span>
                                ) : saveFailed ? (
                                    <span className="text-emerald-300 font-mono text-xs italic">saving shortly ✓</span>
                                ) : (
                                    <span className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin inline-block" />
                                )}
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-3 md:pt-4 border-t border-slate-700">
                            <span className="text-sm md:text-base text-slate-400">
                                Relic Fragments
                                {serverConfirmed && stats.fragmentsCapped && <span className="text-[9px] text-amber-400 ml-1">(capped)</span>}
                            </span>
                            {serverConfirmed ? (
                                <span className="text-fuchsia-400 font-mono text-lg md:text-xl">+{stats.fragments || 0}</span>
                            ) : saveFailed ? (
                                <span className="text-emerald-300 font-mono text-xs italic">saving shortly ✓</span>
                            ) : (
                                <span className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin inline-block" />
                            )}
                        </div>
                        {stats.worldBossDamage > 0 && (
                            <div className="flex justify-between items-center pt-3 md:pt-4 border-t border-slate-700">
                                <span className="text-sm md:text-base text-slate-400">Boss Damage Dealt</span>
                                <span className="text-red-500 font-mono text-xl md:text-2xl font-bold">{Math.floor(stats.worldBossDamage).toLocaleString()}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-3 md:pt-4 border-t border-slate-700">
                            <span className="text-sm md:text-base text-slate-400">Score Submitted</span>
                            {serverConfirmed && stats.score != null ? (
                                <span className="text-cyan-400 font-mono text-xl md:text-2xl font-bold">{stats.score.toLocaleString()}</span>
                            ) : saveFailed ? (
                                <span className="text-emerald-300 font-mono text-xs italic">saving shortly ✓</span>
                            ) : (
                                <span className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin inline-block" />
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Extended stats — scrollable */}
            <div className="mt-4 pt-3 border-t border-slate-700">
                <div className="text-[10px] md:text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Detailed Stats</div>
                <div className="bg-slate-900/60 rounded-md border border-slate-700/50 p-3 space-y-2">
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Average DPS</span>
                        <span className="text-orange-300 font-mono">{dps.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Damage / Kill</span>
                        <span className="text-orange-300 font-mono">{dmgPerKill.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Kills / Minute</span>
                        <span className="text-cyan-300 font-mono">{kpm}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Gold / Minute</span>
                        <span className="text-yellow-300 font-mono">{gpm}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Avg Time / Level</span>
                        <span className="text-cyan-300 font-mono">{formatTime(timePerLevel)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Bosses Killed</span>
                        <span className="text-rose-400 font-mono">{stats.bossesKilled || 0}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Elites Killed</span>
                        <span className="text-amber-400 font-mono">{stats.elitesKilled || 0}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Unique Enemy Types</span>
                        <span className="text-cyan-300 font-mono">{uniqueEnemyTypes}</span>
                    </div>

                    {weaponBreakdown.length > 0 && (
                        <div className="pt-2 mt-2 border-t border-slate-700/50">
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Weapon Performance</div>
                                {mvpWeapon && mvpWeapon.damage > 0 && (
                                    <div className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">
                                        MVP: {formatWeaponName(mvpWeapon.id)}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                {weaponBreakdown.map(w => (
                                    <div key={w.id} className="bg-slate-800/40 rounded px-2 py-1.5 border border-slate-700/40">
                                        <div className="flex justify-between items-center text-xs mb-0.5">
                                            <span className="text-cyan-300 font-bold truncate">{formatWeaponName(w.id)}</span>
                                            <span className="text-slate-400 font-mono ml-2 text-[10px]">{w.share.toFixed(0)}%</span>
                                        </div>
                                        {PSEUDO_WEAPON_HINTS[w.id] && (
                                            <div className="text-[9px] text-slate-500 italic mb-0.5 leading-tight">{PSEUDO_WEAPON_HINTS[w.id]}</div>
                                        )}
                                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                                            <span>DMG: <span className="text-orange-300">{w.damage.toLocaleString()}</span></span>
                                            <span>KILLS: <span className="text-rose-300">{w.kills}</span></span>
                                        </div>
                                        <div className="w-full bg-slate-900 h-1 rounded mt-1 overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${Math.min(100, w.share)}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {topEnemies.length > 0 && (
                        <div className="pt-2 mt-2 border-t border-slate-700/50">
                            <div className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">Most Hunted</div>
                            <div className="space-y-1">
                                {topEnemies.map(([id, count]) => (
                                    <div key={id} className="flex justify-between text-xs">
                                        <span className="text-slate-400 truncate">{formatEnemyName(id)}</span>
                                        <span className="text-cyan-300 font-mono ml-2">×{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {allEnemies.length > 3 && (
                        <div className="pt-2 mt-2 border-t border-slate-700/50">
                            <div className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">Full Kill Log ({allEnemies.length})</div>
                            <div className="space-y-1">
                                {allEnemies.map(([id, count]) => (
                                    <div key={id} className="flex justify-between text-[11px]">
                                        <span className="text-slate-500 truncate">{formatEnemyName(id)}</span>
                                        <span className="text-slate-400 font-mono ml-2">×{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {serverConfirmed && (stats.endlessGoldCapped || stats.endlessKillsCapped || stats.fragmentsCapped) && (
                <div className="mt-3 bg-amber-950/40 border border-amber-500/40 rounded-lg px-3 py-2 text-[10px] md:text-xs text-amber-300">
                    <span className="font-bold">Endless mode caps applied.</span> Your raw run earned more, but rewards are capped per playtime to keep the economy fair. The values shown are what was actually credited to your save.
                </div>
            )}
        </div>
    );
}