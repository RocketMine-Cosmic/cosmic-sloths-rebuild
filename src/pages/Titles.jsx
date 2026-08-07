import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Lock, Check, Award } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { SoundManager } from '../game/SoundManager';
import { SaveManager } from '../game/SaveManager';
import { updateOmenXUser } from '@/lib/omenxUser';
import { useOmenXUser } from '@/hooks/useOmenXUser';
import { useCurrency } from '@/lib/CurrencyContext';
import { CHARACTERS } from '../game/Constants';
import { PLAYER_TITLES, TITLE_TIERS, TIER_ORDER, formatBuff } from '@/lib/playerTitles';
import { normalizeNftCharacterName } from '@/lib/nftNameNormalize';
import SpaceBackground from '../components/game/SpaceBackground';
import CurrencyHeader from '../components/game/CurrencyHeader';
import OmenXGate from '../components/game/OmenXGate';

// Status filter (separate from rarity tabs)
const STATUS_TABS = [
    { id: 'all', label: 'All' },
    { id: 'unlocked', label: 'Unlocked' },
    { id: 'locked', label: 'Locked' },
];

export default function Titles({ isCarousel }) {
    const navigate = useNavigate();
    const { user: omenxUser } = useOmenXUser();
    const { nfts } = useCurrency();
    const [stats, setStats] = useState(null);
    const [equippedTitle, setEquippedTitle] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [tierFilter, setTierFilter] = useState('all');
    const [saving, setSaving] = useState(false);

    // Fetch player stats (mirrors what Profile does for title eval)
    useEffect(() => {
        if (!omenxUser) return;
        setEquippedTitle(omenxUser?.data?.player_title || '');

        (async () => {
            const save = SaveManager.load();
            let bestScore = 0;
            let leviathanKills = 0;
            let globalRaidDamage = 0;

            try {
                if (omenxUser.walletAddress) {
                    const top = await base44.entities.RunScore.filter({ wallet_address: omenxUser.walletAddress }, '-score', 1);
                    if (top.length) bestScore = top[0].score || 0;
                }
            } catch {}

            // Sum lifetime raid damage from GlobalBossContribution — single source of
            // truth for raid-related titles (Raid Recruit / Trooper / Captain / etc).
            // Was previously hardcoded to 0, so Texxy's 5.3M run never unlocked
            // World Eater Bane (Texxy bug 2026-05-03).
            // submitBossDamage stores user_id as the raw wallet (lowercased by the
            // Base44 user record). Try BOTH cases so legacy records with mixed-case
            // wallets are still picked up.
            try {
                if (omenxUser.walletAddress) {
                    const wallet = omenxUser.walletAddress;
                    const walletLower = wallet.toLowerCase();
                    const queries = wallet === walletLower
                        ? [{ user_id: walletLower }]
                        : [{ user_id: walletLower }, { user_id: wallet }];
                    const seen = new Set();
                    for (const q of queries) {
                        const rows = await base44.entities.GlobalBossContribution.filter(q, '-created_date', 500);
                        for (const c of rows) {
                            if (seen.has(c.id)) continue;
                            seen.add(c.id);
                            globalRaidDamage += Number(c.damage) || 0;
                        }
                    }
                }
            } catch (e) {
                console.error('[Titles] Failed to fetch raid damage:', e.message);
            }

            const enemyKills = save.enemyKills || {};
            leviathanKills = Object.keys(enemyKills)
                .filter(id => id.startsWith('boss_') || id === 'world_boss')
                .reduce((sum, id) => sum + (enemyKills[id] || 0), 0);

            // Count talents across permanent/weekly/seasonal containers (current schema)
            // plus the legacy `unlockedTalents` field. Each container is { charId: [talentIds] }
            // with a `weekId`/`seasonId` key we must skip. Dedupe by `${charId}:${talentId}` so
            // the same talent picked in two periods doesn't double-count.
            const talentKeys = new Set();
            const addTalents = (container, skipKey) => {
                if (!container || typeof container !== 'object') return;
                for (const charId of Object.keys(container)) {
                    if (charId === skipKey) continue;
                    const arr = container[charId];
                    if (Array.isArray(arr)) arr.forEach(t => talentKeys.add(`${charId}:${t}`));
                }
            };
            addTalents(save.permanentTalents, null);
            addTalents(save.weeklyTalents, 'weekId');
            addTalents(save.seasonalTalents, 'seasonId');
            addTalents(save.unlockedTalents, null); // legacy fallback
            const totalUnlockedTalents = talentKeys.size;

            // Count characters: gameplay-unlocked + NFT-granted (by name match, same as NFTPerks.js).
            // Must use normalizeNftCharacterName so Asset Manager NFTs (e.g. "novabyte_am",
            // added 2026-05-19) strip the _am suffix and count toward the Completionist title
            // — Briantjeuh bug 2026-06-10 Discord: had all 10 chars via NFTs but title stayed locked.
            const owned = new Set(save.unlockedCharacters || []);
            if (Array.isArray(nfts)) {
                const charIds = new Set(CHARACTERS.map(c => c.id.toLowerCase()));
                nfts.forEach(nft => {
                    const name = normalizeNftCharacterName(nft?.metadata?.name);
                    if (charIds.has(name)) owned.add(name);
                });
            }

            // Count unique cosmetics across every source so paid items are credited
            // even when the unlocked* arrays got out of sync with the equipped map.
            // Sources:
            //   - unlockedCosmetics (trails, includes 'default')
            //   - unlockedSkins, unlockedKillEffects (purchased)
            //   - cosmetics.skins values + cosmetics.killEffect (currently equipped —
            //     reliable proof of ownership; e.g. Anubis has paid skins equipped
            //     even though unlockedSkins is empty)
            //   - implicit defaults: 'none' kill effect + one <id>_default skin per
            //     unlocked character (free, never written to save)
            const cosmeticIds = new Set();
            (save.unlockedCosmetics || []).forEach(id => cosmeticIds.add(`trail:${id}`));
            (save.unlockedSkins || []).forEach(id => cosmeticIds.add(`skin:${id}`));
            (save.unlockedKillEffects || []).forEach(id => cosmeticIds.add(`kill:${id}`));
            const equippedSkins = save.cosmetics?.skins || {};
            Object.values(equippedSkins).forEach(id => { if (id) cosmeticIds.add(`skin:${id}`); });
            const equippedKill = save.cosmetics?.killEffect;
            if (equippedKill) cosmeticIds.add(`kill:${equippedKill}`);
            // Implicit defaults every player owns
            cosmeticIds.add(`kill:none`);
            owned.forEach(charId => cosmeticIds.add(`skin:${charId}_default`));
            const totalUnlockedCosmetics = cosmeticIds.size;

            setStats({
                totalKills: save.totalKills || 0,
                leviathanKills,
                bestScore,
                globalRaidDamage,
                gold: save.gold || 0,
                totalGoldEarned: save.totalGoldEarned || 0,
                maxLevelReached: save.maxLevelReached || 0,
                maxTimeSurvived: save.maxTimeSurvived || 0,
                unlockedCharactersCount: owned.size,
                totalUnlockedCosmetics,
                totalUnlockedTalents,
            });
        })();
    }, [omenxUser, nfts]);

    const rows = useMemo(() => {
        if (!stats) return [];
        return PLAYER_TITLES
            .map(t => ({ ...t, unlocked: t.isUnlocked(stats) }))
            .sort((a, b) => {
                const ai = TIER_ORDER.indexOf(a.tier);
                const bi = TIER_ORDER.indexOf(b.tier);
                if (ai !== bi) return ai - bi;
                if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
                return a.label.localeCompare(b.label);
            });
    }, [stats]);

    const filteredRows = useMemo(() => {
        let out = rows;
        if (statusFilter === 'unlocked') out = out.filter(r => r.unlocked);
        else if (statusFilter === 'locked') out = out.filter(r => !r.unlocked);
        if (tierFilter !== 'all') out = out.filter(r => r.tier === tierFilter);
        return out;
    }, [rows, statusFilter, tierFilter]);

    const unlockedCount = rows.filter(r => r.unlocked).length;

    // Per-tier counts for the rarity tabs ({ tier: { unlocked, total } })
    const tierCounts = useMemo(() => {
        const counts = { all: { unlocked: 0, total: 0 } };
        TIER_ORDER.forEach(t => { counts[t] = { unlocked: 0, total: 0 }; });
        rows.forEach(r => {
            counts.all.total++;
            counts[r.tier].total++;
            if (r.unlocked) {
                counts.all.unlocked++;
                counts[r.tier].unlocked++;
            }
        });
        return counts;
    }, [rows]);

    const handleEquip = async (titleId) => {
        if (saving) return;
        setSaving(true);
        SoundManager.playUIClick();
        try {
            // Single writer (Option A, 2026-05-08): updateOmenXUser writes to
            // save.profile → SaveManager.save dispatches saveSyncStart and
            // queues syncSave with built-in retry. The server's
            // mirrorProfileFanOut automation propagates to RunScore/SquadMember/
            // SquadMessage. No client-side fan-out, no _titlePendingSync flag.
            await updateOmenXUser({ player_title: titleId });
            setEquippedTitle(titleId);
        } finally {
            setSaving(false);
        }
    };

    return (
        <OmenXGate isCarousel={isCarousel}>
            <div className={`${isCarousel ? 'min-h-full' : 'h-[100dvh]'} flex flex-col relative text-slate-200 p-3 md:p-6 font-sans ${isCarousel ? '' : 'overflow-hidden'}`}>
                {!isCarousel && <SpaceBackground />}
                <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col min-h-0 relative z-10">
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 mb-4 md:mb-6 border-b border-slate-800 pb-3 md:pb-4 shrink-0">
                        <div>
                            {!isCarousel && (
                                <button
                                    onClick={() => { SoundManager.playUIClick(); navigate(-1); }}
                                    className="mb-2 md:mb-3 flex items-center gap-1.5 md:gap-2 text-slate-400 hover:text-white transition-colors font-bold text-xs md:text-sm bg-slate-900 px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-slate-700 w-fit"
                                >
                                    <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Back
                                </button>
                            )}
                            <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-3"
                                style={{ background: 'linear-gradient(90deg, #f59e0b, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(245,158,11,0.5))' }}>
                                <Award className="w-6 h-6 md:w-8 md:h-8 text-amber-400" /> Star Callsigns
                            </h1>
                            <p className="text-slate-400 mt-0.5 text-xs md:text-sm tracking-widest uppercase">
                                Earned <span className="text-amber-400 font-bold">{unlockedCount}</span> / {rows.length}
                            </p>
                        </div>
                        <CurrencyHeader />
                    </header>

                    {/* Status filter (All / Unlocked / Locked) */}
                    <div className="flex gap-2 mb-2 md:mb-3 shrink-0">
                        {STATUS_TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { SoundManager.playUIClick(); setStatusFilter(tab.id); }}
                                className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-bold text-xs md:text-sm transition-colors ${
                                    statusFilter === tab.id ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Rarity tabs */}
                    <div className="flex gap-1.5 md:gap-2 mb-3 md:mb-4 shrink-0 overflow-x-auto pb-1">
                        <button
                            onClick={() => { SoundManager.playUIClick(); setTierFilter('all'); }}
                            className={`shrink-0 px-2.5 py-1 md:px-3 md:py-1.5 rounded-md font-bold text-[10px] md:text-xs uppercase tracking-wider transition-colors ${
                                tierFilter === 'all'
                                    ? 'bg-slate-200 text-slate-900'
                                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 border border-slate-700'
                            }`}
                        >
                            All <span className="opacity-60 ml-1">{tierCounts.all.unlocked}/{tierCounts.all.total}</span>
                        </button>
                        {TIER_ORDER.map(tierKey => {
                            const t = TITLE_TIERS[tierKey];
                            const c = tierCounts[tierKey];
                            const active = tierFilter === tierKey;
                            return (
                                <button
                                    key={tierKey}
                                    onClick={() => { SoundManager.playUIClick(); setTierFilter(tierKey); }}
                                    className={`shrink-0 px-2.5 py-1 md:px-3 md:py-1.5 rounded-md font-bold text-[10px] md:text-xs uppercase tracking-wider border transition-colors ${
                                        active
                                            ? `${t.bg} ${t.text} ${t.border} brightness-125`
                                            : `bg-slate-900/60 text-slate-500 border-slate-800 hover:${t.text} hover:${t.border}`
                                    }`}
                                >
                                    {t.label} <span className="opacity-60 ml-1">{c.unlocked}/{c.total}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Title list */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex-1 overflow-y-auto pr-1 pb-10 grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 content-start"
                    >
                        {!stats ? (
                            <div className="col-span-full flex justify-center items-center py-20">
                                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="col-span-full text-center text-slate-500 py-12 text-sm">
                                No titles match this filter.
                            </div>
                        ) : (
                            filteredRows.map(row => {
                                const tier = TITLE_TIERS[row.tier];
                                const isEquipped = equippedTitle === row.id;
                                return (
                                    <div
                                        key={row.id}
                                        className={`bg-slate-950/85 backdrop-blur-md border rounded-xl p-3 md:p-4 transition-all flex flex-col gap-2 ${
                                            row.unlocked ? `${tier.border} hover:brightness-110` : 'border-slate-700 opacity-90'
                                        } ${isEquipped ? 'ring-2 ring-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]' : ''}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={`text-[11px] md:text-xs ${tier.bg} ${tier.text} px-2 py-0.5 rounded border ${tier.border} tracking-wider font-bold truncate`}>
                                                    {row.label}
                                                </span>
                                                <span className={`text-[9px] md:text-[10px] uppercase tracking-widest ${tier.text} opacity-70 shrink-0`}>
                                                    {tier.label}
                                                </span>
                                            </div>
                                            {row.unlocked
                                                ? <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                                : <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                            }
                                        </div>
                                        <p className="text-[11px] md:text-xs text-slate-400 leading-snug">
                                            {row.describe(stats)}
                                        </p>
                                        {row.buff && (
                                            <div className="text-[10px] md:text-[11px] font-bold text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded px-2 py-1 leading-snug">
                                                ⚡ {formatBuff(row.buff)}
                                            </div>
                                        )}
                                        <div className="mt-auto pt-1">
                                            {isEquipped ? (
                                                <button
                                                    onClick={() => handleEquip('')}
                                                    disabled={saving}
                                                    className="w-full bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/60 text-amber-300 text-xs font-bold py-1.5 rounded-md transition-colors disabled:opacity-50"
                                                >
                                                    Equipped — Tap to remove
                                                </button>
                                            ) : row.unlocked ? (
                                                <button
                                                    onClick={() => handleEquip(row.id)}
                                                    disabled={saving}
                                                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs font-bold py-1.5 rounded-md transition-colors disabled:opacity-50"
                                                >
                                                    Equip
                                                </button>
                                            ) : (
                                                <div className="w-full text-center text-[10px] text-slate-600 italic py-1.5">Locked</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </motion.div>
                </div>
            </div>
        </OmenXGate>
    );
}