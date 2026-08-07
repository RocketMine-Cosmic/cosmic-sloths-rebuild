import React, { useState } from 'react';
import { SaveManager } from '../../game/SaveManager';
import { CHARACTERS, WEAPONS } from '../../game/Constants';
import { SoundManager } from '../../game/SoundManager';
import { base44 } from '@/api/base44Client';
import { ChevronLeft, ChevronRight, Hammer, Zap, Timer, Sparkles, Star, Coins, Hexagon } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import { normalizeNftCharacterName } from '@/lib/nftNameNormalize';
import MysteryForgeCard from './MysteryForgeCard';
import FragmentExpressCard from './FragmentExpressCard';

const GOLD_PER_FRAGMENT = 10000;
const DAILY_CONVERT_CAP = 30; // max fragments from conversion per day

// Weapon forge augments (stacks on top of existing upgrades, stored in save.forgeWeaponAugments)
const WEAPON_AUGMENTS = [
    { id: 'damage_1', weaponStat: 'damage', name: 'Refined Plasma Core',   desc: '+15% base damage permanently',      cost: 3,  rarity: 'Common',    effect: { stat: 'damageMult', value: 0.15 } },
    { id: 'damage_2', weaponStat: 'damage', name: 'Volatile Plasma Core',  desc: '+35% base damage permanently',      cost: 8,  rarity: 'Rare',      effect: { stat: 'damageMult', value: 0.35 } },
    { id: 'damage_3', weaponStat: 'damage', name: 'Singularity Core',      desc: '+60% base damage permanently',      cost: 20, rarity: 'Epic',      effect: { stat: 'damageMult', value: 0.60 } },
    { id: 'area_1',   weaponStat: 'area',   name: 'Expanded Emitter',      desc: '+15% area permanently',             cost: 3,  rarity: 'Common',    effect: { stat: 'areaMult',   value: 0.15 } },
    { id: 'area_2',   weaponStat: 'area',   name: 'Flux Emitter',          desc: '+35% area permanently',             cost: 8,  rarity: 'Rare',      effect: { stat: 'areaMult',   value: 0.35 } },
    { id: 'area_3',   weaponStat: 'area',   name: 'Void Emitter',          desc: '+60% area permanently',             cost: 20, rarity: 'Epic',      effect: { stat: 'areaMult',   value: 0.60 } },
    { id: 'cd_1',     weaponStat: 'cd',     name: 'Cooled Capacitor',      desc: '-10% cooldown permanently',         cost: 3,  rarity: 'Common',    effect: { stat: 'cdMult',     value: 0.10 } },
    { id: 'cd_2',     weaponStat: 'cd',     name: 'Cryo Capacitor',        desc: '-20% cooldown permanently',         cost: 8,  rarity: 'Rare',      effect: { stat: 'cdMult',     value: 0.20 } },
    { id: 'cd_3',     weaponStat: 'cd',     name: 'Zero-Point Capacitor',  desc: '-35% cooldown permanently',         cost: 20, rarity: 'Epic',      effect: { stat: 'cdMult',     value: 0.35 } },
];

// Character augments (stored in save.forgeCharAugments[charId] = [augId, ...])
const CHAR_AUGMENTS = {
    neobyte:     [
        { id: 'neo_crit',    name: 'Overclocked Circuits',  desc: '+8% crit chance on all runs',          cost: 5,  rarity: 'Common' },
        { id: 'neo_chain',   name: 'Chain Reaction Protocol',desc: 'Projectiles chain to 1 extra enemy',   cost: 15, rarity: 'Rare'   },
        { id: 'neo_surge',   name: 'Voltage Surge',         desc: '+25% damage on the first 30 seconds',  cost: 30, rarity: 'Epic'   },
    ],
    pandypaws:   [
        { id: 'pan_armor',   name: 'Reactive Plating',      desc: '+3 armor permanently',                  cost: 5,  rarity: 'Common' },
        { id: 'pan_stomp',   name: 'Seismic Stomp',         desc: 'Melee hits slow enemies by 50% for 2s', cost: 15, rarity: 'Rare'   },
        { id: 'pan_fortress',name: 'Iron Fortress',         desc: 'Take 15% less damage at full health',   cost: 30, rarity: 'Epic'   },
    ],
    novabyte:    [
        { id: 'nova_aoe',    name: 'Overpressure Warhead',  desc: '+20% explosion area permanently',       cost: 5,  rarity: 'Common' },
        { id: 'nova_chain',  name: 'Fragmentation Protocol',desc: 'Explosions spawn 2 mini-missiles',      cost: 15, rarity: 'Rare'   },
        { id: 'nova_nuke',   name: 'Tactical Nuke',         desc: 'Boss spawns trigger 7% max HP nova burst', cost: 30, rarity: 'Epic'   },
    ],
    glitch:      [
        { id: 'glt_phase',   name: 'Phase Shift',           desc: '10% chance to phase through damage',    cost: 5,  rarity: 'Common' },
        { id: 'glt_corrupt', name: 'Data Corruption',       desc: 'Hits have 15% chance to confuse enemy', cost: 15, rarity: 'Rare'   },
        { id: 'glt_copy',    name: 'Mirror Copy',           desc: 'Spawn a ghost clone every 60 seconds',  cost: 30, rarity: 'Epic'   },
    ],
    holodrift:   [
        { id: 'holo_regen',  name: 'Holographic Repair',    desc: '+0.3 HP regen per second',              cost: 5,  rarity: 'Common' },
        { id: 'holo_speed',  name: 'Drift Boosters',        desc: '+10% movement speed permanently',       cost: 15, rarity: 'Rare'   },
        { id: 'holo_revive', name: 'Emergency Protocol',    desc: 'Revive once per run at 10% HP',         cost: 30, rarity: 'Epic'   },
    ],
    codebreaker: [
        { id: 'code_xp',     name: 'XP Exploit',            desc: '+15% XP gain permanently',              cost: 5,  rarity: 'Common' },
        { id: 'code_hack',   name: 'System Hack',           desc: 'Kills have 5% chance to spawn gold',    cost: 15, rarity: 'Rare'   },
        { id: 'code_virus',  name: 'Cascade Virus',         desc: 'Kills infect nearby enemies — they fight each other', cost: 30, rarity: 'Epic'   },
    ],
    dataphantom: [
        { id: 'dat_ghost',   name: 'Ghost Protocol',        desc: 'Start each run with 5s invincibility',  cost: 5,  rarity: 'Common' },
        { id: 'dat_drain',   name: 'Life Drain Matrix',     desc: 'Heal 1% max HP on every 10 kills',      cost: 15, rarity: 'Rare'   },
        { id: 'dat_shade',   name: 'Shadow Realm',          desc: 'Disappear for 2s after taking damage',  cost: 30, rarity: 'Epic'   },
    ],
    neonvortex:  [
        { id: 'neo_range',   name: 'Extended Barrel',       desc: '+20% projectile range permanently',     cost: 5,  rarity: 'Common' },
        { id: 'neo_pierce',  name: 'Tungsten Rounds',       desc: '+1 pierce to all projectiles',          cost: 15, rarity: 'Rare'   },
        { id: 'neo_rail',    name: 'Railgun Calibration',   desc: 'Every 5th shot deals 3x damage',        cost: 30, rarity: 'Epic'   },
    ],
    synthbeats:  [
        { id: 'syn_gold',    name: 'Gold Frequency',        desc: '+20% gold pickups permanently',         cost: 5,  rarity: 'Common' },
        { id: 'syn_beat',    name: 'Bass Cannon',           desc: 'Every 4th attack pushes enemies back',  cost: 15, rarity: 'Rare'   },
        { id: 'syn_amp',     name: 'Amplifier Overload',    desc: 'Double weapon area for 5s after level', cost: 30, rarity: 'Epic'   },
    ],
    skybyte:     [
        { id: 'sky_speed',   name: 'Afterburners',          desc: '+15% movement speed permanently',       cost: 5,  rarity: 'Common' },
        { id: 'sky_twin',    name: 'Twin Laser Array',      desc: 'Fires twin parallel lasers every shot. With mastered Blaster: 6-shot fan.', cost: 15, rarity: 'Rare'   },
        { id: 'sky_ace',     name: 'Ace Maneuver',          desc: 'Briefly become invincible on level up', cost: 30, rarity: 'Epic'   },
    ],
};

const RARITY_COLORS = {
    Common: 'text-slate-300 border-slate-500',
    Rare:   'text-blue-400 border-blue-500',
    Epic:   'text-purple-400 border-purple-500',
};

// Tier prereqs — must mirror server (functions/forgeAction). Tier 2 needs tier 1
// on the SAME weapon; tier 3 needs tier 2. Same per-character for char augments.
const WEAPON_AUGMENT_PREREQS = {
    damage_2: 'damage_1', damage_3: 'damage_2',
    area_2:   'area_1',   area_3:   'area_2',
    cd_2:     'cd_1',     cd_3:     'cd_2',
};
const CHAR_AUGMENT_PREREQS = {
    neo_chain: 'neo_crit',   neo_surge: 'neo_chain',
    pan_stomp: 'pan_armor',  pan_fortress: 'pan_stomp',
    nova_chain: 'nova_aoe',  nova_nuke: 'nova_chain',
    glt_corrupt: 'glt_phase',glt_copy: 'glt_corrupt',
    holo_speed: 'holo_regen',holo_revive: 'holo_speed',
    code_hack: 'code_xp',    code_virus: 'code_hack',
    dat_drain: 'dat_ghost',  dat_shade: 'dat_drain',
    neo_pierce: 'neo_range', neo_rail: 'neo_pierce',
    syn_beat: 'syn_gold',    syn_amp: 'syn_beat',
    sky_twin: 'sky_speed',   sky_ace: 'sky_twin',
};

const RARITY_BG = {
    Common: 'bg-slate-800',
    Rare:   'bg-blue-950',
    Epic:   'bg-purple-950',
};

function getToday() {
    return new Date().toISOString().slice(0, 10);
}

export default function ForgePanel({ save, setSave }) {
    const [forgeTab, setForgeTab] = useState('convert'); // 'convert', 'weapon', 'char'
    const [selectedWeaponId, setSelectedWeaponId] = useState('napBeam');
    const [selectedCharIndex, setSelectedCharIndex] = useState(0);
    const [convertAmount, setConvertAmount] = useState(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const applyServerSave = (data) => {
        if (!data?.saveData) return;
        const s = SaveManager.load();
        s.gold = data.saveData.gold ?? s.gold;
        s.starFragments = data.saveData.starFragments ?? s.starFragments;
        s.forgeWeaponAugments = data.saveData.forgeWeaponAugments ?? s.forgeWeaponAugments;
        s.forgeCharAugments = data.saveData.forgeCharAugments ?? s.forgeCharAugments;
        s.forgeConvertedToday = data.saveData.forgeConvertedToday ?? s.forgeConvertedToday;
        SaveManager.save(s);
        setSave(s);
    };

    const callForge = async (action, payload) => {
        setError(null);
        setBusy(true);
        try {
            const res = await base44.functions.invoke('forgeAction', { action, payload });
            const data = res.data;
            if (!data?.success) {
                setError(data?.error || 'Forge failed');
                return false;
            }
            applyServerSave(data);
            return true;
        } catch (e) {
            setError(e.message || 'Forge failed');
            return false;
        } finally {
            setBusy(false);
        }
    };

    const fragments = save.starFragments || 0;
    const convertedToday = save.forgeConvertedToday?.date === getToday()
        ? (save.forgeConvertedToday.count || 0)
        : 0;
    const canConvertMore = convertedToday < DAILY_CONVERT_CAP;

    const maxConvert = Math.min(
        Math.floor(save.gold / GOLD_PER_FRAGMENT),
        DAILY_CONVERT_CAP - convertedToday
    );

    const handleConvert = async () => {
        const amount = Math.min(convertAmount, maxConvert);
        if (amount <= 0 || busy) return;
        SoundManager.playUIClick();
        await callForge('convert', { amount });
    };

    const handleForgeWeaponAugment = async (augment, overforge = false) => {
        if (busy) return;
        const owned = save.forgeWeaponAugments?.[selectedWeaponId] || [];
        if (overforge) {
            // Outer Galaxy overforge — tier 3 only, max 2 copies, 2× cost.
            if (!augment.id.endsWith('_3')) return;
            const ownCount = owned.filter(x => x === augment.id).length;
            if (ownCount === 0 || ownCount >= 2) return;
            if (fragments < augment.cost * 2) return;
        } else {
            if (owned.includes(augment.id)) return;
            if (fragments < augment.cost) return;
        }
        SoundManager.playUIClick();
        await callForge('forgeWeaponAugment', { weaponId: selectedWeaponId, augmentId: augment.id, overforge });
    };

    const handleForgeCharAugment = async (charId, augment) => {
        if (busy) return;
        const owned = save.forgeCharAugments?.[charId] || [];
        if (owned.includes(augment.id)) return;
        if (fragments < augment.cost) return;
        SoundManager.playUIClick();
        await callForge('forgeCharAugment', { charId, augmentId: augment.id });
    };

    const baseWeapons = Object.values(WEAPONS).filter(w => !w.isSynergy);
    const currentWeaponIndex = baseWeapons.findIndex(w => w.id === selectedWeaponId);

    // Merge save's cloud-authoritative unlockedCharacters with NFT-unlocked chars (UI only).
    // Server's ownsCharacter() already accepts NFT owners, but the client cycler was
    // hiding them from the list — players couldn't pick them to forge augments.
    const { nfts } = useCurrency();
    // Use normalizeNftCharacterName so VIP/NFT names with prefixes resolve to the
    // matching CHARACTERS id — same fix as Hub/Armory (Texxy bug 2026-05-29).
    const nftUnlockedChars = React.useMemo(() => (
        (nfts || [])
            .map(nft => normalizeNftCharacterName(nft.metadata?.name))
            .filter(charId => charId && CHARACTERS.find(c => c.id === charId))
    ), [nfts]);
    const unlockedChars = React.useMemo(() => (
        [...new Set(['neobyte', ...(save.unlockedCharacters || []), ...nftUnlockedChars])]
    ), [save.unlockedCharacters, nftUnlockedChars]);
    const currentCharId = unlockedChars[selectedCharIndex % unlockedChars.length] || 'neobyte';
    const currentChar = CHARACTERS.find(c => c.id === currentCharId) || CHARACTERS[0];

    return (
        <div>
            {error && (
                <div className="mb-3 bg-red-900/50 border border-red-500 text-red-200 px-3 py-2 rounded-lg text-xs flex items-center justify-between">
                    <span>❌ {error}</span>
                    <button onClick={() => setError(null)} className="text-red-300 hover:text-white ml-2">✕</button>
                </div>
            )}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl md:text-2xl font-bold text-yellow-400 flex items-center gap-2">
                    <Hammer className="w-6 h-6" /> The Forge
                </h2>
                <div className="flex items-center gap-2 bg-slate-800 border border-yellow-500/50 px-3 py-1.5 rounded-lg">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <span className="font-bold text-yellow-400 text-lg">{fragments}</span>
                    <span className="text-slate-400 text-xs">Fragments</span>
                </div>
            </div>

            <div className="flex gap-2 mb-4 border-b border-slate-800 pb-2">
                {[
                    { id: 'convert', label: '🔄 Convert' },
                    { id: 'weapon',  label: '⚔️ Weapon Forge' },
                    { id: 'char',    label: '🧬 Augments' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { SoundManager.playUIClick(); setForgeTab(tab.id); }}
                        className={`px-3 py-2 rounded-lg font-bold text-sm transition-colors ${forgeTab === tab.id ? 'bg-yellow-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* CONVERT TAB */}
            {forgeTab === 'convert' && (
                <div className="space-y-4">
                    <div className="bg-slate-800 rounded-xl border border-yellow-500/30 p-4 md:p-6">
                        <h3 className="font-bold text-white text-lg mb-1 flex items-center gap-2">
                            <Star className="w-5 h-5 text-yellow-400" /> Gold → Star Fragments
                        </h3>
                        <p className="text-slate-400 text-sm mb-4">
                            Convert excess Gold into Star Fragments 🌟 used to permanently forge weapon upgrades and character augments.<br/>
                            <span className="text-yellow-400 font-bold">Rate: {GOLD_PER_FRAGMENT.toLocaleString()} Gold = 1 🌟</span>
                            <span className="ml-3 text-slate-500">Daily cap: {DAILY_CONVERT_CAP} fragments · resets at <span className="text-slate-300 font-bold">00:00 UTC</span></span>
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-400 mb-2">
                                    Amount to convert ({convertedToday}/{DAILY_CONVERT_CAP} converted today)
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setConvertAmount(a => Math.max(1, a - 1))}
                                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold"
                                    >-</button>
                                    <input
                                        type="number"
                                        min={1}
                                        max={maxConvert}
                                        value={convertAmount}
                                        onChange={e => setConvertAmount(Math.max(1, Math.min(maxConvert, parseInt(e.target.value) || 1)))}
                                        className="w-20 text-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white font-mono font-bold outline-none focus:border-yellow-500"
                                    />
                                    <button
                                        onClick={() => setConvertAmount(a => Math.min(maxConvert, a + 1))}
                                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold"
                                    >+</button>
                                    <button
                                        onClick={() => setConvertAmount(maxConvert)}
                                        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-slate-300"
                                    >MAX</button>
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="text-xs text-slate-400 mb-1">Cost</div>
                                <div className="text-yellow-400 font-bold font-mono flex items-center justify-center gap-1"><Coins className="w-4 h-4 fill-yellow-500" /> {(convertAmount * GOLD_PER_FRAGMENT).toLocaleString()}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xs text-slate-400 mb-1">You receive</div>
                                <div className="text-yellow-400 font-bold font-mono flex items-center justify-center gap-1"><Star className="w-4 h-4 fill-yellow-400 text-yellow-400" /> {convertAmount}</div>
                            </div>
                            <button
                                onClick={handleConvert}
                                disabled={maxConvert <= 0 || !canConvertMore}
                                className="px-6 py-3 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors shadow-[0_0_15px_rgba(234,179,8,0.2)]"
                            >
                                {!canConvertMore ? 'Daily Cap Reached' : maxConvert <= 0 ? 'Not Enough Gold' : 'Convert'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                        <h4 className="font-bold text-slate-300 mb-2 text-sm">What are Star Fragments used for?</h4>
                        <ul className="space-y-1 text-xs text-slate-400">
                            <li>⚔️ <span className="text-slate-300 font-bold">Weapon Forge</span> — permanently enhance a weapon's damage, area, or cooldown beyond the normal cap</li>
                            <li>🧬 <span className="text-slate-300 font-bold">Character Augments</span> — unlock a powerful, permanent passive trait for a specific operative</li>
                            <li>🌟 Augments carry over forever — they never reset with weekly/seasonal upgrades</li>
                        </ul>
                    </div>

                    {/* S8 Fragment Express Lane — self-gates to S8+ and hides pre-S8.
                        Sits right below the gold-convert flow because it targets the
                        same "I need more fragments" moment (see PLAN §Sink 2). */}
                    <FragmentExpressCard save={save} setSave={setSave} />

                    {/* S6 Phase 3b — Mystery Forge gold sink. Component handles its own
                        S5/S6 gating + roll UI. Slotted here so it lives alongside the
                        existing Convert flow (related "spend gold for forge progress"
                        action). */}
                    <MysteryForgeCard save={save} setSave={setSave} />
                </div>
            )}

            {/* WEAPON FORGE TAB */}
            {forgeTab === 'weapon' && (
                <div className="space-y-4">
                    {/* Weapon selector */}
                    <div className="flex items-center justify-between bg-slate-800 p-2 rounded-xl border border-slate-700">
                        <button
                            onClick={() => { SoundManager.playUIClick(); setSelectedWeaponId(baseWeapons[(currentWeaponIndex - 1 + baseWeapons.length) % baseWeapons.length].id); }}
                            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <div className="text-center font-bold text-yellow-400 text-lg">
                            {baseWeapons[currentWeaponIndex]?.name}
                            <div className="text-xs text-slate-500 font-normal mt-0.5">{currentWeaponIndex + 1} / {baseWeapons.length}</div>
                        </div>
                        <button
                            onClick={() => { SoundManager.playUIClick(); setSelectedWeaponId(baseWeapons[(currentWeaponIndex + 1) % baseWeapons.length].id); }}
                            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
                        >
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {WEAPON_AUGMENTS.map(aug => {
                            const owned = save.forgeWeaponAugments?.[selectedWeaponId] || [];
                            const ownCount = owned.filter(x => x === aug.id).length;
                            const isOwned = ownCount >= 1;
                            const canAfford = fragments >= aug.cost;
                            const prereqId = WEAPON_AUGMENT_PREREQS[aug.id];
                            const isLocked = prereqId && !owned.includes(prereqId);
                            const prereqName = prereqId ? WEAPON_AUGMENTS.find(a => a.id === prereqId)?.name : null;
                            const Icon = aug.weaponStat === 'damage' ? Zap : aug.weaponStat === 'area' ? Sparkles : Timer;
                            // Overforge — Outer Galaxy mechanic. Tier 3 only, max 2 copies, 2× fragment cost.
                            // Bonus stacks to 2× ONLY on S11+ runs; Inner Galaxy treats the 2nd copy as a no-op.
                            const isOverforgeEligible = aug.id.endsWith('_3');
                            const isOverforged = ownCount >= 2;
                            const canOverforge = isOverforgeEligible && isOwned && !isOverforged;
                            const overforgeCost = aug.cost * 2;
                            const canAffordOverforge = fragments >= overforgeCost;
                            return (
                                <div key={aug.id} className={`rounded-xl border-2 p-3 flex flex-col gap-2 ${isOverforged ? 'border-violet-500 bg-violet-950/40' : isOwned ? 'border-yellow-500 bg-yellow-950/30' : isLocked ? 'border-slate-800 bg-slate-950/40 opacity-60' : `${RARITY_COLORS[aug.rarity].split(' ')[1]} ${RARITY_BG[aug.rarity]}`}`}>
                                    <div className="flex items-center gap-2">
                                        <Icon className={`w-4 h-4 shrink-0 ${isOverforged ? 'text-violet-300' : isOwned ? 'text-yellow-400' : isLocked ? 'text-slate-600' : RARITY_COLORS[aug.rarity].split(' ')[0]}`} />
                                        <div>
                                            <div className={`font-bold text-sm leading-tight ${isOverforged ? 'text-violet-200' : isOwned ? 'text-yellow-300' : isLocked ? 'text-slate-500' : 'text-white'}`}>{aug.name}</div>
                                            <div className={`text-[10px] font-bold uppercase ${RARITY_COLORS[aug.rarity].split(' ')[0]}`}>{aug.rarity}</div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-300 flex-1">{aug.desc}</p>
                                    {/* Per-stat overforge bonus — mirrors Constants.js multipliers.
                                        Tier-3 alone grants basePct; overforging (Outer Galaxy only) adds +50% of that. */}
                                    {isOverforged ? (
                                        (() => {
                                            const baseByStat = { damage: 60, area: 60, cd: 35 };
                                            const basePct = baseByStat[aug.weaponStat] || 0;
                                            const overforgedPct = Math.round(basePct * 1.5);
                                            const statLabel = aug.weaponStat === 'cd' ? 'cooldown reduction' : aug.weaponStat;
                                            return (
                                                <div
                                                    className="text-[11px] font-bold text-violet-300 text-center bg-violet-900/40 py-1.5 px-2 rounded-lg border border-violet-500/60 shadow-[0_0_10px_rgba(139,92,246,0.3)] leading-tight"
                                                    title={`Overforged: ${overforgedPct}% ${statLabel} on Outer Galaxy (S11+) sectors.`}
                                                >
                                                    ★★ OVERFORGED
                                                    <div className="text-[9px] text-violet-400 font-mono mt-0.5">S11+: {overforgedPct}% {statLabel}</div>
                                                </div>
                                            );
                                        })()
                                    ) : isOwned ? (
                                        <>
                                            <div className="text-xs font-bold text-yellow-400 text-center bg-yellow-900/30 py-1 rounded-lg border border-yellow-500/50">✓ FORGED</div>
                                            {canOverforge && (() => {
                                                const baseByStat = { damage: 60, area: 60, cd: 35 };
                                                const basePct = baseByStat[aug.weaponStat] || 0;
                                                const overforgedPct = Math.round(basePct * 1.5);
                                                const statLabel = aug.weaponStat === 'cd' ? 'cooldown reduction' : aug.weaponStat;
                                                return (
                                                    <button
                                                        onClick={() => handleForgeWeaponAugment(aug, true)}
                                                        disabled={!canAffordOverforge}
                                                        title={`Outer Galaxy (S11+) only — boosts this augment to ${overforgedPct}% ${statLabel}.`}
                                                        className={`py-1.5 px-2 rounded-lg font-bold text-[11px] transition-colors flex flex-col items-center justify-center gap-0.5 ${canAffordOverforge ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_8px_rgba(139,92,246,0.4)]' : 'bg-slate-900 text-slate-500 border border-slate-700'}`}
                                                    >
                                                        <span className="flex items-center gap-1.5">
                                                            <Star className="w-3 h-3 fill-current" /> Overforge · {overforgeCost} <span className="text-[8px] opacity-80 font-black tracking-wider">S11+</span>
                                                        </span>
                                                        <span className="text-[9px] font-mono opacity-90">{overforgedPct}% {statLabel}</span>
                                                    </button>
                                                );
                                            })()}
                                        </>
                                    ) : isLocked ? (
                                        <div className="text-[11px] font-bold text-slate-500 text-center bg-slate-900/60 py-1.5 rounded-lg border border-slate-800">🔒 Forge {prereqName} first</div>
                                    ) : (
                                        <button
                                            onClick={() => handleForgeWeaponAugment(aug)}
                                            disabled={!canAfford}
                                            className={`py-1.5 rounded-lg font-bold text-xs transition-colors flex items-center justify-center gap-1 ${canAfford ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : 'bg-slate-900 text-slate-500 border border-slate-700'}`}
                                        >
                                            <Star className="w-4 h-4 fill-current" /> {aug.cost} Fragments
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* CHAR AUGMENTS TAB */}
            {forgeTab === 'char' && (
                <div className="space-y-4">
                    {/* Character selector */}
                    <div className="flex items-center justify-between bg-slate-800 p-2 rounded-xl border border-slate-700">
                        <button
                            onClick={() => { SoundManager.playUIClick(); setSelectedCharIndex(i => (i - 1 + unlockedChars.length) % unlockedChars.length); }}
                            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden border-2" style={{ borderColor: currentChar.color }}>
                                {currentChar.image ? <img src={currentChar.image} alt={currentChar.name} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800" />}
                            </div>
                            <div className="font-bold text-yellow-400 text-lg">
                                {currentChar.name}
                                <div className="text-xs text-slate-500 font-normal">{selectedCharIndex % unlockedChars.length + 1} / {unlockedChars.length}</div>
                            </div>
                        </div>
                        <button
                            onClick={() => { SoundManager.playUIClick(); setSelectedCharIndex(i => (i + 1) % unlockedChars.length); }}
                            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
                        >
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {(CHAR_AUGMENTS[currentCharId] || []).map(aug => {
                            const owned = save.forgeCharAugments?.[currentCharId] || [];
                            const isOwned = owned.includes(aug.id);
                            const canAfford = fragments >= aug.cost;
                            const prereqId = CHAR_AUGMENT_PREREQS[aug.id];
                            const isLocked = prereqId && !owned.includes(prereqId);
                            const prereqName = prereqId ? (CHAR_AUGMENTS[currentCharId] || []).find(a => a.id === prereqId)?.name : null;
                            return (
                                <div key={aug.id} className={`rounded-xl border-2 p-3 flex flex-col gap-2 ${isOwned ? 'border-yellow-500 bg-yellow-950/30' : isLocked ? 'border-slate-800 bg-slate-950/40 opacity-60' : `${RARITY_COLORS[aug.rarity].split(' ')[1]} ${RARITY_BG[aug.rarity]}`}`}>
                                    <div>
                                        <div className={`font-bold text-sm leading-tight ${isOwned ? 'text-yellow-300' : isLocked ? 'text-slate-500' : 'text-white'}`}>{aug.name}</div>
                                        <div className={`text-[10px] font-bold uppercase ${RARITY_COLORS[aug.rarity].split(' ')[0]}`}>{aug.rarity}</div>
                                    </div>
                                    <p className="text-xs text-slate-300 flex-1">{aug.desc}</p>
                                    {isOwned ? (
                                        <div className="text-xs font-bold text-yellow-400 text-center bg-yellow-900/30 py-1.5 rounded-lg border border-yellow-500/50">✓ AUGMENTED</div>
                                    ) : isLocked ? (
                                        <div className="text-[11px] font-bold text-slate-500 text-center bg-slate-900/60 py-1.5 rounded-lg border border-slate-800">🔒 Forge {prereqName} first</div>
                                    ) : (
                                        <button
                                            onClick={() => handleForgeCharAugment(currentCharId, aug)}
                                            disabled={!canAfford}
                                            className={`py-1.5 rounded-lg font-bold text-xs transition-colors flex items-center justify-center gap-1 ${canAfford ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : 'bg-slate-900 text-slate-500 border border-slate-700'}`}
                                        >
                                            <Star className="w-4 h-4 fill-current" /> {aug.cost} Fragments
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                        {!(CHAR_AUGMENTS[currentCharId]) && (
                            <div className="col-span-3 text-center text-slate-500 py-8">No augments available for this operative yet.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}