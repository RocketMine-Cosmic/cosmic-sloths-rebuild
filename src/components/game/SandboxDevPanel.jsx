import React, { useState, useMemo } from 'react';
import { Wrench, X, Zap, Shield, Skull, Sparkles, Trash2, FastForward, ArrowUp } from 'lucide-react';
import { ENEMIES, WEAPONS, UPGRADES } from '../../game/Constants';

// S8 Sandbox — in-run dev panel per docs/s8/PLAN_SANDBOX_TEST_PLAY.md §UX.
// Sits on the right edge of the canvas as a collapsed wrench icon; opens into
// a sidebar (desktop) / bottom sheet (mobile) with dev-tools that hit engine
// helper methods (sandboxSpawnEnemy / sandboxGrantWeapon / sandboxGrantPassive
// / sandboxForceLevelUp / sandboxClearEnemies etc). Only rendered when the
// engine is in sandbox mode; every action is a no-op if the engine ref is
// gone. NEVER included on real runs — Game.jsx gates on the sandbox flag.

const TIME_SCALES = [1, 2, 4];

export default function SandboxDevPanel({ engineRef }) {
    const [open, setOpen] = useState(false);
    // Track UI-only state so buttons show current toggle values. Engine holds
    // the real values; we just mirror them here.
    const [invincible, setInvincible] = useState(false);
    const [infiniteCd, setInfiniteCd] = useState(false);
    const [timeScale, setTimeScale] = useState(1);
    const [enemyPick, setEnemyPick] = useState('t1_void_glow');
    const [enemyCount, setEnemyCount] = useState(5);
    const [weaponPick, setWeaponPick] = useState('napBeam');
    const [passivePick, setPassivePick] = useState('dmg_up');

    // Available enemies — grouped by tier for the picker. Bosses last.
    const enemyOptions = useMemo(() => {
        return ENEMIES.filter(e => e.id !== 'squad_meteor_target');
    }, []);

    // Passive upgrades = UPGRADES entries with type='passive' (no weapon rows).
    const passiveOptions = useMemo(() => UPGRADES.filter(u => u.type === 'passive'), []);

    // Non-synergy / non-evolution weapons — synergies & evolutions are earned mid-run.
    const weaponOptions = useMemo(() => {
        return Object.values(WEAPONS).filter(w => !w.isSynergy && !w.isEvolution);
    }, []);

    const withEngine = (fn) => {
        const engine = engineRef.current;
        if (!engine) return;
        fn(engine);
    };

    const spawnEnemies = () => withEngine((engine) => {
        engine.sandboxSpawnEnemy?.(enemyPick, Math.max(1, Math.min(50, Number(enemyCount) || 1)));
    });

    const clearEnemies = () => withEngine((engine) => {
        engine.sandboxClearEnemies?.();
    });

    const grantWeapon = () => withEngine((engine) => {
        engine.sandboxGrantWeapon?.(weaponPick);
    });

    const grantPassive = () => withEngine((engine) => {
        engine.sandboxGrantPassive?.(passivePick);
    });

    const forceLevelUp = () => withEngine((engine) => {
        engine.sandboxForceLevelUp?.();
    });

    const toggleInvincible = () => withEngine((engine) => {
        const next = !invincible;
        setInvincible(next);
        engine.sandboxSetInvincible?.(next);
    });

    const toggleInfiniteCd = () => withEngine((engine) => {
        const next = !infiniteCd;
        setInfiniteCd(next);
        engine.sandboxSetInfiniteCooldowns?.(next);
    });

    const setSpeed = (mult) => withEngine((engine) => {
        setTimeScale(mult);
        engine.sandboxSetTimeScale?.(mult);
    });

    const healFull = () => withEngine((engine) => {
        engine.player.hp = engine.player.maxHp;
        engine.callbacks?.onHpChange?.(engine.player.hp, engine.player.maxHp);
    });

    return (
        <>
            {/* Trigger — small wrench pinned right side, always visible during sandbox */}
            {!open && (
                <button
                    onClick={() => setOpen(true)}
                    data-allow-edge-touch="true"
                    className="fixed right-2 top-1/2 -translate-y-1/2 z-[75] bg-yellow-600/90 hover:bg-yellow-500 text-slate-900 rounded-l-lg p-2 shadow-[0_0_15px_rgba(234,179,8,0.5)] border-2 border-yellow-400"
                    title="Open practice range dev tools"
                >
                    <Wrench className="w-5 h-5" />
                </button>
            )}

            {/* Panel — bottom sheet on mobile (< md), right sidebar on desktop */}
            {open && (
                <>
                    {/* backdrop — click to close */}
                    <div
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 bg-black/40 z-[74]"
                    />
                    <div className="fixed z-[76] bg-slate-950/95 backdrop-blur-xl border-2 border-yellow-500/60 shadow-[0_0_40px_rgba(234,179,8,0.3)] text-slate-100
                        left-0 right-0 bottom-0 max-h-[70vh] rounded-t-2xl
                        md:left-auto md:top-0 md:bottom-0 md:right-0 md:w-[360px] md:max-h-none md:rounded-none md:rounded-l-2xl
                        overflow-y-auto"
                        data-allow-edge-touch="true"
                    >
                        <div className="sticky top-0 bg-slate-950/95 backdrop-blur border-b border-yellow-500/40 px-4 py-3 flex items-center justify-between z-10">
                            <div className="flex items-center gap-2 text-yellow-300 font-black tracking-widest uppercase text-sm">
                                <Wrench className="w-4 h-4" /> Practice Tools
                            </div>
                            <button onClick={() => setOpen(false)} className="p-1 hover:bg-yellow-500/20 rounded text-yellow-300">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Spawn enemies */}
                            <Section icon={<Skull className="w-4 h-4" />} title="Spawn Enemies">
                                <select
                                    value={enemyPick}
                                    onChange={(e) => setEnemyPick(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm outline-none focus:border-yellow-500"
                                >
                                    {enemyOptions.map(e => (
                                        <option key={e.id} value={e.id}>
                                            {e.isBoss ? '👑 ' : ''}T{e.tier ?? '?'} · {e.name}
                                        </option>
                                    ))}
                                </select>
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-slate-400 shrink-0">Count</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={50}
                                        value={enemyCount}
                                        onChange={(e) => setEnemyCount(e.target.value)}
                                        className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm outline-none focus:border-yellow-500"
                                    />
                                    <button onClick={spawnEnemies} className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-slate-900 font-bold rounded-lg py-1.5 text-sm">Spawn</button>
                                </div>
                                <button onClick={clearEnemies} className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg py-1.5 text-sm border border-slate-700">
                                    <Trash2 className="w-4 h-4" /> Clear All Enemies
                                </button>
                            </Section>

                            {/* Grant weapon / passive */}
                            <Section icon={<Zap className="w-4 h-4" />} title="Grant Weapon">
                                <select
                                    value={weaponPick}
                                    onChange={(e) => setWeaponPick(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm outline-none focus:border-yellow-500"
                                >
                                    {weaponOptions.map(w => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                                <button onClick={grantWeapon} className="w-full bg-yellow-600 hover:bg-yellow-500 text-slate-900 font-bold rounded-lg py-1.5 text-sm">Add Weapon (or level up if owned)</button>
                            </Section>

                            <Section icon={<Sparkles className="w-4 h-4" />} title="Grant Passive">
                                <select
                                    value={passivePick}
                                    onChange={(e) => setPassivePick(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm outline-none focus:border-yellow-500"
                                >
                                    {passiveOptions.map(u => (
                                        <option key={u.id} value={u.id}>{u.name} — {u.desc}</option>
                                    ))}
                                </select>
                                <button onClick={grantPassive} className="w-full bg-yellow-600 hover:bg-yellow-500 text-slate-900 font-bold rounded-lg py-1.5 text-sm">Apply Passive</button>
                            </Section>

                            {/* Level up */}
                            <Section icon={<ArrowUp className="w-4 h-4" />} title="Progression">
                                <button onClick={forceLevelUp} className="w-full bg-yellow-600 hover:bg-yellow-500 text-slate-900 font-bold rounded-lg py-1.5 text-sm">Force Level Up (open modal)</button>
                                <button onClick={healFull} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg py-1.5 text-sm">Heal to Full HP</button>
                            </Section>

                            {/* Toggles */}
                            <Section icon={<Shield className="w-4 h-4" />} title="Toggles">
                                <button
                                    onClick={toggleInvincible}
                                    className={`w-full font-bold rounded-lg py-1.5 text-sm border transition-colors ${invincible ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-emerald-500'}`}
                                >
                                    Invincibility: {invincible ? 'ON' : 'OFF'}
                                </button>
                                <button
                                    onClick={toggleInfiniteCd}
                                    className={`w-full font-bold rounded-lg py-1.5 text-sm border transition-colors ${infiniteCd ? 'bg-fuchsia-600 border-fuchsia-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-fuchsia-500'}`}
                                >
                                    Infinite Cooldowns: {infiniteCd ? 'ON' : 'OFF'}
                                </button>
                            </Section>

                            {/* Time scale */}
                            <Section icon={<FastForward className="w-4 h-4" />} title="Time Scale">
                                <div className="flex gap-2">
                                    {TIME_SCALES.map(mult => (
                                        <button
                                            key={mult}
                                            onClick={() => setSpeed(mult)}
                                            className={`flex-1 font-black text-sm rounded-lg py-2 border transition-colors ${timeScale === mult ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-cyan-500'}`}
                                        >
                                            {mult}×
                                        </button>
                                    ))}
                                </div>
                            </Section>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}

function Section({ icon, title, children }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-yellow-300 text-[11px] font-black tracking-[0.2em] uppercase">
                {icon} {title}
            </div>
            <div className="space-y-2">{children}</div>
        </div>
    );
}