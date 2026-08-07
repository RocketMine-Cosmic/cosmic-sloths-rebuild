import React, { useMemo, useEffect, useState } from 'react';
import { RELICS, getCharacterMastery, CHARACTER_TALENTS } from '../../game/Constants';
import { NFTPerkManager } from '../../game/NFTPerks';
import { getTitleBuff } from '@/lib/playerTitles';
import { useOmenXVip } from '@/hooks/useOmenXVip';
import { useCurrency } from '@/lib/CurrencyContext';
import { useOmenXUser } from '@/hooks/useOmenXUser';
import { getStatus as getMaintStatus, subscribe as subscribeMaint } from '@/lib/maintenanceStatus';

// Maps title-buff & talent stat keys to BuildSummary stat keys
const STAT_KEY_MAP = {
    damageMult: 'damageMult',
    speedMult: 'speedMult',
    areaMult: 'areaMult',
    cooldownMult: 'cooldownMult',
    hpMult: 'hpMult',
    goldMult: 'goldMult',
    xpMult: 'xpMult',
    luck: 'luck',
    regen: 'regen',
    armor: 'armor',
    magnetRange: 'magnet',     // titles
    magnet: 'magnet',          // talents (alt key)
    projSpeedMult: 'projSpeedMult',
    maxHp: 'maxHp',            // talents (flat HP)
    critBonus: 'critBonus',
};

// Stat metadata: label, icon, formatter, color theme
const STAT_DEFS = {
    damageMult: { label: 'Damage', icon: '⚡', color: 'text-red-300',     border: 'border-red-500/40',     bg: 'bg-red-950/30',     fmt: (v) => `+${Math.round(v * 100)}%` },
    speedMult:  { label: 'Speed',  icon: '💨', color: 'text-cyan-300',    border: 'border-cyan-500/40',    bg: 'bg-cyan-950/30',    fmt: (v) => `+${Math.round(v * 100)}%` },
    areaMult:   { label: 'Area',   icon: '💥', color: 'text-amber-300',   border: 'border-amber-500/40',   bg: 'bg-amber-950/30',   fmt: (v) => `+${Math.round(v * 100)}%` },
    cooldownMult: { label: 'Cooldown', icon: '⏱️', color: 'text-blue-300', border: 'border-blue-500/40',   bg: 'bg-blue-950/30',    fmt: (v) => `${v < 0 ? '' : '+'}${Math.round(v * 100)}%` },
    hpMult:     { label: 'Max HP', icon: '❤️‍🔥', color: 'text-rose-300', border: 'border-rose-500/40',   bg: 'bg-rose-950/30',    fmt: (v) => `+${Math.round(v * 100)}%` },
    goldMult:   { label: 'Gold',   icon: '🪙', color: 'text-yellow-300',  border: 'border-yellow-500/40',  bg: 'bg-yellow-950/30',  fmt: (v) => `+${Math.round(v * 100)}%` },
    xpMult:     { label: 'XP',     icon: '✨', color: 'text-emerald-300', border: 'border-emerald-500/40', bg: 'bg-emerald-950/30', fmt: (v) => `+${Math.round(v * 100)}%` },
    relicFragMult: { label: 'Relic Frags', icon: '🧩', color: 'text-fuchsia-300', border: 'border-fuchsia-500/40', bg: 'bg-fuchsia-950/30', fmt: (v) => `+${Math.round(v * 100)}%` },
    projSpeedMult: { label: 'Proj Speed', icon: '🚀', color: 'text-sky-300', border: 'border-sky-500/40',     bg: 'bg-sky-950/30',     fmt: (v) => `+${Math.round(v * 100)}%` },
    critBonus:  { label: 'Crit',   icon: '🎯', color: 'text-orange-300',  border: 'border-orange-500/40',  bg: 'bg-orange-950/30',  fmt: (v) => `+${Math.round(v * 100)}%` },
    luck:       { label: 'Luck',   icon: '🍀', color: 'text-lime-300',    border: 'border-lime-500/40',    bg: 'bg-lime-950/30',    fmt: (v) => `+${Number(v.toFixed(1))}` },
    regen:      { label: 'Regen',  icon: '❤️', color: 'text-pink-300',    border: 'border-pink-500/40',    bg: 'bg-pink-950/30',    fmt: (v) => `+${v.toFixed(1)}/s` },
    armor:      { label: 'Armor',  icon: '🛡️', color: 'text-slate-300',  border: 'border-slate-500/40',   bg: 'bg-slate-900/50',   fmt: (v) => `+${Math.round(v)}` },
    magnet:     { label: 'Magnet', icon: '🧲', color: 'text-indigo-300',  border: 'border-indigo-500/40',  bg: 'bg-indigo-950/30',  fmt: (v) => `+${Math.round(v)}` },
    maxHp:      { label: 'Max HP+', icon: '💗', color: 'text-rose-300',   border: 'border-rose-500/40',    bg: 'bg-rose-950/30',    fmt: (v) => `+${Math.round(v)}` },
};

// Order in which to render stats (only those with non-zero totals appear)
const STAT_ORDER = ['damageMult', 'speedMult', 'areaMult', 'cooldownMult', 'hpMult', 'maxHp', 'goldMult', 'xpMult', 'relicFragMult', 'projSpeedMult', 'critBonus', 'luck', 'regen', 'armor', 'magnet'];

export default function BuildSummary({ save, selectedChar, currentTime }) {
    const { vip: vipLevel } = useOmenXVip();
    const { nfts } = useCurrency();
    const { user: omenxUser } = useOmenXUser();

    // Global XP buff — admin-set server-wide multiplier (e.g. 2× XP for 24h).
    // The GameEngine folds this into player.xpMult at run-start (see GameEngine.js
    // ~line 311), so the build preview must too — otherwise players see no
    // indication of the bonus they're actively receiving.
    const [globalXpBuff, setGlobalXpBuff] = useState(() => getMaintStatus().globalXpBuff);
    useEffect(() => subscribeMaint((s) => setGlobalXpBuff(s.globalXpBuff)), []);

    const { totals, sourceCount, xpBuffTimeLeft, globalXpBuffTimeLeft } = useMemo(() => {
        const totals = {};
        let sourceCount = 0;
        let xpBuffTimeLeft = null;

        // 1. Equipped relics
        const equipped = save.equippedRelics || [];
        const relicLevels = save.relicLevels || {};
        equipped.forEach((relicId) => {
            const relic = RELICS.find((r) => r.id === relicId);
            if (!relic) return;
            const level = relicLevels[relicId] || 1;
            const value = relic.values[level - 1] || 0;
            totals[relic.stat] = (totals[relic.stat] || 0) + value;
            sourceCount++;
        });

        // 2. Permanent stat upgrades (each level translates to a flat bonus).
        // Diminishing returns when stacking weekly+seasonal on top of permanent —
        // MUST mirror GameEngine's STACK_FACTOR (0.66) so the build preview matches
        // what the engine actually applies in-run.
        const STACK_FACTOR = 0.66;
        const sumLevels = (key) =>
            (save.permanentUpgrades?.[key] || 0) +
            ((save.weeklyUpgrades?.[key] || 0) + (save.seasonalUpgrades?.[key] || 0)) * STACK_FACTOR;

        const dmgLvl = sumLevels('damage');
        const spdLvl = sumLevels('speed');
        const cdLvl = sumLevels('cooldown');
        const luckLvl = sumLevels('luck');
        const regenLvl = sumLevels('regen');
        const armorLvl = sumLevels('armor');
        const magnetLvl = sumLevels('magnet');

        // Permanent upgrades use roughly 2%/lvl (perm) + 5%/lvl (week) + 10%/lvl (season).
        // For a simple summary we approximate as the linear sum with the "permanent" rate as base.
        if (dmgLvl) { totals.damageMult = (totals.damageMult || 0) + dmgLvl * 0.02; sourceCount++; }
        if (spdLvl) { totals.speedMult  = (totals.speedMult  || 0) + spdLvl * 0.02; sourceCount++; }
        if (cdLvl)  { totals.cooldownMult = (totals.cooldownMult || 0) + cdLvl * -0.02; sourceCount++; }
        if (luckLvl) { totals.luck = (totals.luck || 0) + luckLvl; sourceCount++; }
        if (regenLvl) { totals.regen = (totals.regen || 0) + regenLvl * 0.1; sourceCount++; }
        if (armorLvl) { totals.armor = (totals.armor || 0) + armorLvl; sourceCount++; }
        if (magnetLvl) { totals.magnet = (totals.magnet || 0) + magnetLvl * 5; sourceCount++; }

        // 3. Character mastery bonuses (all unlocked tiers stack — including character-specific T6/T7)
        const charKills = save.characterKills?.[selectedChar] || 0;
        const mastery = getCharacterMastery(charKills, selectedChar);
        let masteryApplied = false;
        (mastery.unlockedTiers || []).forEach(tier => {
            if (tier.stat && tier.value && tier.stat !== 'allStats') {
                totals[tier.stat] = (totals[tier.stat] || 0) + tier.value;
                masteryApplied = true;
            }
            if (tier.multiStat) {
                for (const [k, v] of Object.entries(tier.multiStat)) {
                    totals[k] = (totals[k] || 0) + v;
                    masteryApplied = true;
                }
            }
            if (tier.stat === 'allStats' && tier.value) {
                ['speedMult','damageMult','areaMult','xpMult','goldMult'].forEach(k => {
                    totals[k] = (totals[k] || 0) + tier.value;
                });
                totals.cooldownMult = (totals.cooldownMult || 0) - tier.value;
                masteryApplied = true;
            }
        });
        if (masteryApplied) sourceCount++;

        // 4. VIP bonuses — +1% damage and +1% max HP per VIP level
        if (vipLevel && vipLevel > 0) {
            totals.damageMult = (totals.damageMult || 0) + vipLevel * 0.01;
            totals.hpMult = (totals.hpMult || 0) + vipLevel * 0.01;
            sourceCount++;
        }

        // 5. NFT perks — gold + relic-fragment bonuses for the selected character (rarity-based)
        const charPerks = NFTPerkManager.getCharacterPerks(selectedChar, nfts);
        const nftGoldBonus = (charPerks.goldMultiplier || 1) - 1;
        const nftRelicBonus = (charPerks.relicFragmentMultiplier || 1) - 1;
        if (nftGoldBonus > 0 || nftRelicBonus > 0) {
            if (nftGoldBonus > 0) totals.goldMult = (totals.goldMult || 0) + nftGoldBonus;
            if (nftRelicBonus > 0) totals.relicFragMult = (totals.relicFragMult || 0) + nftRelicBonus;
            sourceCount++;
        }

        // 6. Equipped title buff
        const titleId = omenxUser?.data?.player_title;
        const titleBuff = getTitleBuff(titleId);
        if (titleBuff) {
            let titleApplied = false;
            for (const [key, val] of Object.entries(titleBuff)) {
                if (!val) continue;
                const mapped = STAT_KEY_MAP[key];
                if (!mapped) continue;
                totals[mapped] = (totals[mapped] || 0) + val;
                titleApplied = true;
            }
            if (titleApplied) sourceCount++;
        }

        // 7. Character talents (permanent + weekly + seasonal — unique union)
        const allTalentIds = new Set([
            ...(save.permanentTalents?.[selectedChar] || []),
            ...(save.weeklyTalents?.[selectedChar] || []),
            ...(save.seasonalTalents?.[selectedChar] || []),
        ]);
        const charTalentDefs = CHARACTER_TALENTS[selectedChar] || [];
        if (allTalentIds.size > 0) {
            for (const talent of charTalentDefs) {
                if (!allTalentIds.has(talent.id)) continue;
                if (!talent.stat || !talent.value) continue;
                const mapped = STAT_KEY_MAP[talent.stat];
                if (!mapped) continue;
                totals[mapped] = (totals[mapped] || 0) + talent.value;
            }
            sourceCount++;
        }

        // 8. Active session buffs (XP buff: +50%)
        const xpExpiry = save.sessionBuffs?.xpExpiry || 0;
        if (xpExpiry > currentTime) {
            totals.xpMult = (totals.xpMult || 0) + 0.5;
            sourceCount++;
            const msLeft = xpExpiry - currentTime;
            const mins = Math.floor(msLeft / 60000);
            const secs = Math.floor((msLeft % 60000) / 1000);
            xpBuffTimeLeft = `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        // 9. Global XP buff (admin-set server-wide). Multiplier 1.5 = +50%, 2 = +100%, etc.
        // Added as an additive bonus to xpMult for display parity with the other sources.
        let globalXpBuffTimeLeft = null;
        if (globalXpBuff && globalXpBuff.multiplier > 1 && globalXpBuff.expiresAt > currentTime) {
            totals.xpMult = (totals.xpMult || 0) + (globalXpBuff.multiplier - 1);
            sourceCount++;
            const msLeft = globalXpBuff.expiresAt - currentTime;
            const hrs = Math.floor(msLeft / 3600000);
            const mins = Math.floor((msLeft % 3600000) / 60000);
            globalXpBuffTimeLeft = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        }

        return { totals, sourceCount, xpBuffTimeLeft, globalXpBuffTimeLeft };
    }, [save.equippedRelics, save.relicLevels, save.characterKills, save.sessionBuffs, save.permanentUpgrades, save.weeklyUpgrades, save.seasonalUpgrades, save.permanentTalents, save.weeklyTalents, save.seasonalTalents, selectedChar, currentTime, vipLevel, nfts, omenxUser?.data?.player_title, globalXpBuff]);

    const activeStats = STAT_ORDER.filter((k) => totals[k]);

    if (activeStats.length === 0) {
        return (
            <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg px-3 py-2 text-center">
                <span className="text-[10px] md:text-xs text-slate-500 font-bold tracking-widest uppercase">
                    📊 No active build bonuses — equip relics or buy buffs to power up
                </span>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-[#0b0416]/80 to-slate-950/80 backdrop-blur-xl border border-purple-500/30 rounded-lg p-2.5 md:p-4 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
            <div className="flex items-center justify-between mb-2 md:mb-3">
                <span className="text-xs md:text-sm font-black tracking-widest uppercase text-purple-300 flex items-center gap-1.5">
                    📊 Build Bonuses
                </span>
                <span className="text-[10px] md:text-xs text-slate-500 font-bold tracking-wider uppercase">
                    {sourceCount} {sourceCount === 1 ? 'src' : 'srcs'}
                    {xpBuffTimeLeft && <span className="text-emerald-400 ml-1.5">· XP {xpBuffTimeLeft}</span>}
                    {globalXpBuffTimeLeft && <span className="text-amber-300 ml-1.5">· 🌐 {globalXpBuffTimeLeft}</span>}
                </span>
            </div>

            <div className="flex flex-wrap gap-1.5 md:gap-2">
                {activeStats.map((statKey) => {
                    const def = STAT_DEFS[statKey];
                    if (!def) return null;
                    const formatted = def.fmt(totals[statKey]);
                    return (
                        <div
                            key={statKey}
                            title={`${def.label}: ${formatted}`}
                            aria-label={`${def.label}: ${formatted}`}
                            className={`flex items-center gap-1.5 md:gap-2 px-2 md:px-2.5 py-1 md:py-1.5 rounded-md border ${def.border} ${def.bg} cursor-help`}
                        >
                            <span className="text-xs md:text-sm">{def.icon}</span>
                            <span className="text-[10px] md:text-xs uppercase tracking-wider font-bold text-slate-400 hidden sm:inline">
                                {def.label}
                            </span>
                            <span className={`text-xs md:text-base font-black font-mono ${def.color}`}>
                                {formatted}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}