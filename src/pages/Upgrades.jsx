import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SaveManager } from '../game/SaveManager';
import { CHARACTERS, CHARACTER_TALENTS, WEAPONS, TRAIL_COSMETICS, KILL_COSMETICS, SKIN_COSMETICS, RELICS, RELIC_RARITIES } from '../game/Constants';
import { Zap, Timer, Sparkles, ArrowLeft, ChevronLeft, ChevronRight, Coins, Puzzle, Star } from 'lucide-react';
import { getCurrentPeriodIds } from '../lib/periodIds';

function OmenXIcon({ className }) {
    return <img src="/assets/69de258a7e072380b89d66e3/01838179d_omenx_logo.png" className={className} alt="OMENX" />;
}
import { useCurrency } from '@/lib/CurrencyContext';
import { ensureNftsFetched } from '@/lib/playerDataCache';
import { normalizeNftCharacterName } from '@/lib/nftNameNormalize';
import { useOmenXConfirmation } from '@/hooks/useOmenXConfirmation';
import { useOmenXPurchasesDisabled } from '@/hooks/useOmenXPurchasesDisabled';
import OmenXConfirmation from '../components/game/OmenXConfirmation';
import { base44 } from '@/api/base44Client';
import moment from 'moment';
import { getAuthData } from '@/lib/getAuthData';
import { getStatSku, getWeaponSku, getTalentSku, getCosmeticSku, getTalentRespecSku, TALENT_RESPEC_GOLD_COSTS } from '@/lib/skuMap';
import { refreshBalance } from '@/lib/playerDataCache';
import { SoundManager } from '../game/SoundManager';
import CosmeticPreview from '../components/game/CosmeticPreview';
import ForgePanel from '../components/game/ForgePanel';
import TalentRespecModal from '../components/game/TalentRespecModal';
import RelicPrestigeBadge from '../components/game/RelicPrestigeBadge';
import StatPips, { SmallStatPips } from '../components/game/StatPips';
import BuyAllStatsButton from '../components/upgrades/BuyAllStatsButton';
import BuyAllWeaponStatsButton from '../components/upgrades/BuyAllWeaponStatsButton';
import BuyAllStatsGoldButton from '../components/upgrades/BuyAllStatsGoldButton';
import BuyAllWeaponStatsGoldButton from '../components/upgrades/BuyAllWeaponStatsGoldButton';
import SpaceBackground from '../components/game/SpaceBackground';
import CurrencyHeader from '../components/game/CurrencyHeader';
import OmenXGate from '../components/game/OmenXGate';
import { NFTPerkManager } from '../game/NFTPerks';
import NFTPerkBadge from '../components/game/NFTPerkBadge';

const UPGRADE_TYPES = [
    { id: 'permanent', name: 'Permanent', goldCosts: [1000, 2000, 4000, 8000, 16000], tokenCosts: [15, 30, 60, 120, 240] },
    { id: 'weekly', name: 'Weekly', goldCosts: [500, 1000, 2000, 4000, 8000], tokenCosts: [4, 8, 15, 30, 60] },
    { id: 'seasonal', name: 'Seasonal', goldCosts: [750, 1500, 3000, 6000, 12000], tokenCosts: [10, 20, 40, 80, 160] }
];

const STATS = [
    { id: 'damage', name: 'Plasma Output', label: 'Damage', emoji: '⚡', perm: '+2%', week: '+5%', season: '+10%' },
    { id: 'health', name: 'Hull Integrity', label: 'Max HP', emoji: '❤️', perm: '+5', week: '+10', season: '+20' },
    { id: 'speed', name: 'Thruster Speed', label: 'Move Speed', emoji: '💨', perm: '+2%', week: '+5%', season: '+10%' },
    { id: 'magnet', name: 'Tractor Range', label: 'Pickup Range', emoji: '🔵', perm: '+5', week: '+15', season: '+30' },
    { id: 'regen', name: 'Nano-Repair', label: 'HP Regen/s', emoji: '🛡️', perm: '+0.1', week: '+0.2', season: '+0.5' },
    { id: 'cooldown', name: 'System Cooling', label: 'Cooldown', emoji: '⏱️', perm: '-2%', week: '-5%', season: '-10%' },
    { id: 'luck', name: 'Cosmic Fortune', label: 'Luck', emoji: '✨', perm: '+1', week: '+2', season: '+3' }
];



export default function Upgrades({ isCarousel }) {
    const navigate = useNavigate();
    const [save, setSave] = useState(SaveManager.load());
    const { omenxBalance, nfts } = useCurrency();

    // Make sure NFTs are loaded so NFT-unlocked characters appear in the talents tab
    React.useEffect(() => { ensureNftsFetched(); }, []);

    // NFT-unlocked characters (UI only — server is authoritative for save.unlockedCharacters).
    // Use normalizeNftCharacterName so VIP/NFT names with prefixes, spaces, etc. resolve to
    // the matching CHARACTERS id — same logic Hub uses (without it, VIP-unlocked characters
    // showed up in Hub but were missing from Armory tabs).
    const nftUnlockedChars = React.useMemo(() => {
        return (nfts || [])
            .map(nft => normalizeNftCharacterName(nft.metadata?.name))
            .filter(charId => charId && CHARACTERS.find(c => c.id === charId));
    }, [nfts]);

    const effectiveUnlockedCharacters = React.useMemo(() => {
        return [...new Set(['neobyte', ...(save.unlockedCharacters || []), ...nftUnlockedChars])];
    }, [save.unlockedCharacters, nftUnlockedChars]);
    const { pending, setPending, confirm: confirmPurchase } = useOmenXConfirmation('upgrades-page');
    // Hard-gate every OMENX button when admins flip the kill-switch — previously
    // only the confirmation modal blocked, so players could still click → modal
    // → re-check → 503, which fired the OmenX 502 chain anyway when their
    // settlement service was the actual problem.
    const { disabled: omenxBlocked, message: omenxBlockedMsg } = useOmenXPurchasesDisabled();

    React.useEffect(() => {
        const handleSaveUpdated = (e) => setSave(e.detail);
        window.addEventListener('saveUpdated', handleSaveUpdated);
        // Note: visibilitychange sync is handled globally inside SaveManager.initialize()
        return () => {
            window.removeEventListener('saveUpdated', handleSaveUpdated);
        };
    }, []);

    const [activeCategory, setActiveCategory] = useState('permanent');
    const [subCategory, setSubCategory] = useState('stats');
    const [selectedChar, setSelectedChar] = useState((save.unlockedCharacters && save.unlockedCharacters.length > 0) ? save.unlockedCharacters[0] : 'neobyte');
    const [selectedWeapon, setSelectedWeapon] = useState('neoBlaster');
    const [timeLeft, setTimeLeft] = useState('');
    const [purchasing, setPurchasing] = useState(false);
    const [purchaseError, setPurchaseError] = useState(null);
    const [cosmeticTab, setCosmeticTab] = useState('trail'); // 'trail', 'kill', or 'skin'
    const [skinCharIndex, setSkinCharIndex] = useState(0);
    const [previewSkinColor, setPreviewSkinColor] = useState(null); // color being previewed (not yet purchased)
    const [respecModal, setRespecModal] = useState(null); // { tier, charId, charName, count, goldCost, omenxCost }

    useEffect(() => {
        // Must match Leaderboard countdown EXACTLY (Sunday 23:59 UTC).
        // Previously used moment().endOf('week') which is locale-dependent
        // (Saturday in US locale) — caused Armory and Hall of Fame to show
        // different reset times (Hugo bug 2026-05-02).
        const updateTimer = () => {
            const now = new Date();
            if (activeCategory === 'weekly') {
                // Sunday is the LAST day of the ISO week (ends 23:59 UTC), not a new week.
                // Old `(7 - currentDay) % 7 || 7` returned 7 on Sunday → showed "7d" instead of hours-left.
                const currentDay = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
                const daysUntilSunday = currentDay === 0 ? 0 : 7 - currentDay;
                const endOfWeek = new Date(now);
                endOfWeek.setUTCDate(now.getUTCDate() + daysUntilSunday);
                endOfWeek.setUTCHours(23, 59, 0, 0);

                const msLeft = endOfWeek - now;
                const daysLeft = Math.floor(msLeft / (24 * 60 * 60 * 1000));
                const hoursLeft = Math.floor((msLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                const minutesLeft = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000));
                setTimeLeft(`${daysLeft}d ${hoursLeft}h ${minutesLeft}m`);
            } else if (activeCategory === 'seasonal') {
                // Use canonical ISO 8601 calc (mirrors lib/periodIds.js + Leaderboard).
                // Old hand-rolled formula produced the wrong week on Sundays.
                const { isoWeek, year } = getCurrentPeriodIds();
                const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
                const lastWeekOfSeason = seasonNum * 4;

                const jan1 = new Date(Date.UTC(year, 0, 1));
                const jan1Day = jan1.getUTCDay() || 7;
                const mondayW1 = new Date(jan1);
                mondayW1.setUTCDate(jan1.getUTCDate() - (jan1Day - 1) + (jan1Day <= 4 ? 0 : 7));
                const msPerWeek = 7 * 24 * 60 * 60 * 1000;
                const mondayOfLastWeek = new Date(mondayW1.getTime() + (lastWeekOfSeason - 1) * msPerWeek);
                const endOfSeason = new Date(mondayOfLastWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

                const msLeft = endOfSeason - now;
                const daysLeft = Math.floor(msLeft / (24 * 60 * 60 * 1000));
                const hoursLeft = Math.floor((msLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                const minutesLeft = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000));
                setTimeLeft(`${daysLeft}d ${hoursLeft}h ${minutesLeft}m`);
            } else {
                setTimeLeft('');
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);
    }, [activeCategory]);

    const friendlyError = (errMsg) => {
        const m = (errMsg || '').toLowerCase();
        if (m.includes('429') || m.includes('rate')) return 'Server is busy. Please try again in a moment.';
        if (m.includes('502') || m.includes('503') || m.includes('504') || m.includes('gateway') || m.includes('timeout') || m.includes('network')) return 'OMENX network is busy. Please try again in a moment.';
        if (m.includes('not enough gold')) return "You don't have enough Gold for this.";
        if (m.includes('not enough star fragments')) return "You don't have enough Star Fragments for this.";
        if (m.includes('not enough') || m.includes('insufficient')) return "You don't have enough to buy this.";
        if (m.includes('already unlocked') || m.includes('already owned')) return 'You already own this upgrade.';
        if (m.includes('prerequisite') || m.includes('path conflict')) return 'You need to unlock the previous tier first.';
        if (m.includes('character not unlocked')) return 'You need to unlock this character first.';
        if (m.includes('level mismatch')) return 'Your save is out of sync — please reload the page and try again.';
        if (m.includes('playersave not found')) return 'Save not loaded yet — please wait a moment and try again.';
        if (m.includes('unauthorized') || m.includes('401')) return 'Please sign in again to continue.';
        if (m.includes('daily cap')) return "You've hit today's limit for this action.";
        return 'Something went wrong. Please try again.';
    };

    const spendGold = async (grantInfo) => {
        setPurchaseError(null);
        setPurchasing(true);
        try {
            let res;
            try {
                res = await base44.functions.invoke('spendGold', { grantInfo });
            } catch (e) {
                const status = e?.response?.status;
                const serverMsg = e?.response?.data?.error || e?.message || '';
                setPurchaseError(friendlyError(`${status || ''} ${serverMsg}`));
                throw e;
            }
            const data = res.data;
            if (!data?.success) {
                const errMsg = data?.error || 'Unknown error';
                setPurchaseError(friendlyError(errMsg));
                throw new Error(errMsg);
            }
            // Server returns full updated save_data — apply server-owned fields locally
            if (data.saveData) {
                const s = SaveManager.load();
                const SERVER_FIELDS = [
                    'gold',
                    'permanentUpgrades', 'weeklyUpgrades', 'seasonalUpgrades',
                    'permanentWeaponUpgrades', 'weeklyWeaponUpgrades', 'seasonalWeaponUpgrades',
                    'permanentTalents', 'weeklyTalents', 'seasonalTalents',
                    'unlockedCosmetics', 'unlockedKillEffects', 'unlockedSkins', 'cosmetics'
                ];
                for (const k of SERVER_FIELDS) {
                    if (data.saveData[k] !== undefined) s[k] = data.saveData[k];
                }
                SaveManager.save(s);
                setSave(s);
            }
            return data;
        } finally {
            setPurchasing(false);
        }
    };

    const purchaseSku = async (skuId, grantInfo = null) => {
        setPurchaseError(null);
        setPurchasing(true);
        console.log('[Upgrades purchaseSku] CALLED with skuId:', skuId, 'grant:', grantInfo?.type);
        if (!skuId) { setPurchaseError('Something went wrong. Please try again.'); throw new Error('No SKU mapping'); }
        const playerName = save.pilotName || 'Pilot';
        let res;
        try {
            res = await base44.functions.invoke('purchaseSku', { skuId, quantity: 1, playerName, grantInfo });
        } catch (e) {
            // Network / 5xx errors come through as thrown axios errors
            const status = e?.response?.status;
            const serverMsg = e?.response?.data?.error || e?.message || '';
            setPurchaseError(friendlyError(`${status || ''} ${serverMsg}`));
            throw e;
        }
        const data = res.data;
        if (!data?.success) {
            const errMsg = data?.error || 'Unknown error';
            setPurchaseError(friendlyError(errMsg));
            throw new Error(errMsg);
        }
        // If server applied a grant, replace the relevant local save fields with server truth
        if (data.saveData) {
            const s = SaveManager.load();
            // Copy server-owned fields back from response
            const SERVER_FIELDS = [
                'permanentUpgrades', 'weeklyUpgrades', 'seasonalUpgrades',
                'permanentWeaponUpgrades', 'weeklyWeaponUpgrades', 'seasonalWeaponUpgrades',
                'permanentTalents', 'weeklyTalents', 'seasonalTalents',
                'unlockedCosmetics', 'unlockedKillEffects', 'unlockedSkins', 'cosmetics'
            ];
            for (const k of SERVER_FIELDS) {
                if (data.saveData[k] !== undefined) s[k] = data.saveData[k];
            }
            SaveManager.save(s);
            setSave(s);
        }
        return data;
    };

    const syncSaveToBackend = async (updatedSave) => {
        try {
            await base44.functions.invoke('syncSave', { saveData: updatedSave });
        } catch (e) {
            console.error('[syncSaveToBackend] Sync failed:', e);
        }
    };



    const handleBuyStat = (stat, currency) => {
        const currentSave = SaveManager.load();
        const typeConfig = UPGRADE_TYPES.find(t => t.id === activeCategory);
        const saveKey = activeCategory === 'permanent' ? 'permanentUpgrades' : activeCategory === 'weekly' ? 'weeklyUpgrades' : 'seasonalUpgrades';
        const upgrades = currentSave[saveKey] || {};
        const currentLevel = upgrades[stat] || 0;
        
        if (currentLevel >= typeConfig.goldCosts.length) return;
        
        const goldCost = typeConfig.goldCosts[currentLevel];
        const tokenCost = typeConfig.tokenCosts[currentLevel];

        if (currency === 'gold' && currentSave.gold >= goldCost) {
            const grantInfo = { type: 'stat', tier: activeCategory, stat, level: currentLevel + 1 };
            spendGold(grantInfo).then(() => {
                SoundManager.playUIClick();
            }).catch(err => {
                console.error('[handleBuyStat] spendGold failed:', err);
            });
        } else if (currency === 'token' && (omenxBalance ?? 0) >= tokenCost) {
            setPurchasing(true);
            const skuId = getStatSku(activeCategory, stat, currentLevel + 1);
            const grantInfo = { type: 'stat', tier: activeCategory, stat, level: currentLevel + 1 };
            purchaseSku(skuId, grantInfo).then(() => {
                // Server already wrote grant; purchaseSku() applied saveData to local
                SoundManager.playUIClick();
            }).catch(err => {
                console.error('[handleBuyStat] purchase failed — upgrade NOT granted:', err);
            }).finally(() => {
                setPurchasing(false);
                refreshBalance();
            });
        }
    };

    const handleBuyWeapon = (weaponId, stat, currency) => {
        const currentSave = SaveManager.load();
        const typeConfig = UPGRADE_TYPES.find(t => t.id === activeCategory);
        const saveKey = activeCategory === 'permanent' ? 'permanentWeaponUpgrades' : activeCategory === 'weekly' ? 'weeklyWeaponUpgrades' : 'seasonalWeaponUpgrades';
        
        const weaponData = currentSave[saveKey]?.[weaponId] || {};
        const currentLevel = weaponData[stat] || 0;
        
        if (currentLevel >= typeConfig.goldCosts.length) return;
        
        const goldCost = typeConfig.goldCosts[currentLevel];
        const tokenCost = typeConfig.tokenCosts[currentLevel];
        
        if (currency === 'gold' && currentSave.gold >= goldCost) {
            const grantInfo = { type: 'weapon', tier: activeCategory, weaponId, stat, level: currentLevel + 1 };
            spendGold(grantInfo).then(() => {
                SoundManager.playUIClick();
            }).catch(err => {
                console.error('[handleBuyWeapon] spendGold failed:', err);
            });
        } else if (currency === 'token' && (omenxBalance ?? 0) >= tokenCost) {
           setPurchasing(true);
           const weaponObj = Object.values(WEAPONS).find(w => w.id === weaponId);
           const nextLevel = (currentSave[saveKey]?.[weaponId]?.[stat] || 0) + 1;
           const skuId = getWeaponSku(activeCategory, weaponObj?.name || weaponId, stat, nextLevel);
           const grantInfo = { type: 'weapon', tier: activeCategory, weaponId, stat, level: nextLevel };
           purchaseSku(skuId, grantInfo).then(() => {
               SoundManager.playUIClick();
           }).catch(err => {
               console.error('[handleBuyWeapon] purchase failed — upgrade NOT granted:', err);
           }).finally(() => {
               setPurchasing(false);
               refreshBalance();
           });
        }
    };

    const handleBuyTalent = (talent, currency) => {
        const currentSave = SaveManager.load();
        const typeConfig = UPGRADE_TYPES.find(t => t.id === activeCategory);
        const saveKey = activeCategory === 'permanent' ? 'permanentTalents' : activeCategory === 'weekly' ? 'weeklyTalents' : 'seasonalTalents';
        
        const unlocked = currentSave[saveKey]?.[selectedChar] || [];
        if (unlocked.includes(talent.id)) return;
        
        const costTier = (talent.tier - 1) * 2;
        const goldCost = typeConfig.goldCosts[costTier];
        const tokenCost = typeConfig.tokenCosts[costTier];

        if (currency === 'gold' && currentSave.gold >= goldCost) {
            const grantInfo = { type: 'talent', tier: activeCategory, charId: selectedChar, talentId: talent.id, talentTier: talent.tier };
            spendGold(grantInfo).then(() => {
                SoundManager.playUIClick();
            }).catch(err => {
                console.error('[handleBuyTalent] spendGold failed:', err);
            });
        } else if (currency === 'token' && (omenxBalance ?? 0) >= tokenCost) {
            setPurchasing(true);
            const charObj = CHARACTERS.find(c => c.id === selectedChar);
            const skuId = getTalentSku(activeCategory, charObj?.name || selectedChar, talent.name, talent.tier);
            const grantInfo = { type: 'talent', tier: activeCategory, charId: selectedChar, talentId: talent.id, talentTier: talent.tier };
            purchaseSku(skuId, grantInfo).then(() => {
                SoundManager.playUIClick();
            }).catch(err => {
                console.error('[handleBuyTalent] purchase failed — talent NOT granted:', err);
            }).finally(() => {
                setPurchasing(false);
                refreshBalance();
            });
        }
    };

    const handleRespecPayGold = async () => {
        if (!respecModal) return;
        const { tier, charId } = respecModal;
        try {
            await spendGold({ type: 'talent_respec', tier, charId });
            SoundManager.playUIClick();
            setRespecModal(null);
        } catch (err) {
            console.error('[handleRespecPayGold] failed:', err);
        }
    };

    const handleRespecPayOmenx = async () => {
        if (!respecModal) return;
        const { tier, charId, omenxCost } = respecModal;
        const skuId = getTalentRespecSku(tier);
        if (!skuId) {
            setPurchaseError('Respec is not available right now. Please try again later.');
            return;
        }
        // Wrap in confirmPurchase to honor the user's "skip OMENX confirms for 24h" toggle
        const doPurchase = async () => {
            setPurchasing(true);
            try {
                await purchaseSku(skuId, { type: 'talent_respec', tier, charId });
                SoundManager.playUIClick();
                setRespecModal(null);
            } catch (err) {
                console.error('[handleRespecPayOmenx] failed:', err);
            } finally {
                setPurchasing(false);
                refreshBalance();
            }
        };
        confirmPurchase(omenxCost, `Respec ${respecModal.charName}'s Talents`, doPurchase);
    };

    const QUEST_POINTS_PER_SKIN = 100;
    const [claimingSkinId, setClaimingSkinId] = useState(null);

    const handleClaimQuestSkin = async (skin) => {
        if (claimingSkinId) return;
        setPurchaseError(null);
        setClaimingSkinId(skin.id);
        try {
            let res;
            try {
                res = await base44.functions.invoke('claimSeasonalSkin', { skinId: skin.id }); // Backend function name unchanged
            } catch (e) {
                const status = e?.response?.status;
                const serverMsg = e?.response?.data?.error || e?.message || '';
                setPurchaseError(friendlyError(`${status || ''} ${serverMsg}`));
                return;
            }
            const data = res.data;
            if (!data?.success) {
                setPurchaseError(data?.error || 'Try again.');
                return;
            }
            // Apply server result — server returns updated seasonalPoints + unlockedSkins
            const s = SaveManager.load();
            if (data.saveData.seasonalPoints !== undefined) s.seasonalPoints = data.saveData.seasonalPoints;
            if (data.saveData.unlockedSkins !== undefined) s.unlockedSkins = data.saveData.unlockedSkins;
            // Auto-equip the freshly-claimed skin so the player sees their reward immediately
            s.cosmetics = { ...(s.cosmetics || {}), skins: { ...((s.cosmetics || {}).skins || {}), [skin.charId]: skin.id } };
            SaveManager.save(s);
            setSave(s);
            SaveManager.syncToBackendImmediate();
            SoundManager.playLevelUp();
        } finally {
            setClaimingSkinId(null);
        }
    };

    const handleBuyRelic = async (relic) => {
        setPurchaseError(null);
        setPurchasing(true);
        try {
            let res;
            try {
                res = await base44.functions.invoke('craftRelic', { relicId: relic.id });
            } catch (e) {
                const status = e?.response?.status;
                const serverMsg = e?.response?.data?.error || e?.message || '';
                setPurchaseError(friendlyError(`${status || ''} ${serverMsg}`));
                return;
            }
            const data = res.data;
            if (!data?.success) {
                setPurchaseError(friendlyError(data?.error || ''));
                return;
            }
            if (data.saveData) {
                const s = SaveManager.load();
                s.relicFragments = data.saveData.relicFragments;
                s.unlockedRelics = data.saveData.unlockedRelics;
                s.relicLevels = data.saveData.relicLevels;
                SaveManager.save(s);
                setSave(s);
            }
            SoundManager.playLevelUp();
        } catch (e) {
            setPurchaseError(friendlyError(e.message || ''));
        } finally {
            setPurchasing(false);
        }
    };

    const handleToggleRelic = (relicId) => {
        const currentSave = SaveManager.load();
        let equipped = currentSave.equippedRelics || [];
        if (equipped.includes(relicId)) {
            equipped = equipped.filter(id => id !== relicId);
        } else if (equipped.length < 2) {
            equipped.push(relicId);
        } else {
            return;
        }
        currentSave.equippedRelics = equipped;
        SaveManager.save(currentSave);
        setSave(currentSave);
        SoundManager.playUIClick();
    };

    const handleBuyCosmetic = (cosmetic, slot, currency) => {
        // slot: 'trail', 'kill', or 'skin'
        if (slot === 'skin') {
            const unlocked = save.unlockedSkins || [];
            const isOwned = unlocked.includes(cosmetic.id) || cosmetic.goldCost === 0;
            const cosmetics = save.cosmetics || {};
            const charSkins = cosmetics.skins || {};

            if (currency === 'preview') {
                setPreviewSkinColor(skin => skin === cosmetic.color ? null : cosmetic.color);
                SoundManager.playUIClick();
                return;
            }
            if (isOwned) {
                const newSave = { ...save, cosmetics: { ...cosmetics, skins: { ...charSkins, [cosmetic.charId]: cosmetic.id } } };
                SaveManager.save(newSave);
                setSave(newSave);
                SaveManager.syncToBackendImmediate();
                SoundManager.playUIClick();
                return;
            }
            if (currency === 'gold' && save.gold >= cosmetic.goldCost) {
                const grantInfo = { type: 'cosmetic', slot: 'skin', cosmeticId: cosmetic.id, charId: cosmetic.charId, goldCost: cosmetic.goldCost };
                spendGold(grantInfo).then(() => {
                    SoundManager.playUIClick();
                }).catch(err => {
                    console.error('[handleBuyCosmetic skin] spendGold failed:', err);
                });
            } else if (currency === 'token' && (omenxBalance ?? 0) >= cosmetic.tokenCost) {
                setPurchasing(true);
                const skuId = getCosmeticSku('skin', cosmetic.name, cosmetic.goldCost);
                // Pass goldCost so server can verify it matches the SKU's price tier
                // (prevents tampered grantInfo from unlocking expensive skins via cheap SKU).
                const grantInfo = { type: 'cosmetic', slot: 'skin', cosmeticId: cosmetic.id, charId: cosmetic.charId, goldCost: cosmetic.goldCost };
                purchaseSku(skuId, grantInfo).then(() => {
                    SoundManager.playUIClick();
                }).catch(err => {
                    console.error('[handleBuyCosmetic skin] purchase failed — skin NOT granted:', err);
                }).finally(() => {
                    setPurchasing(false);
                    refreshBalance();
                });
            }
            return;
        }

        const unlockKey = slot === 'trail' ? 'unlockedCosmetics' : 'unlockedKillEffects';
        const freeId = slot === 'trail' ? 'default' : 'none';
        const unlocked = save[unlockKey] || [freeId];
        const cosmetics = save.cosmetics || { trail: 'default', killEffect: 'none' };
        const cosmeticKey = slot === 'trail' ? 'trail' : 'killEffect';

        // Preview: equip temporarily without purchasing (only updates local state, not save)
        if (currency === 'preview') {
            setSave(prev => ({ ...prev, cosmetics: { ...prev.cosmetics, [cosmeticKey]: cosmetic.id } }));
            SoundManager.playUIClick();
            return;
        }

        if (unlocked.includes(cosmetic.id)) {
            const newSave = { ...save, cosmetics: { ...cosmetics, [cosmeticKey]: cosmetic.id } };
            SaveManager.save(newSave);
            setSave(newSave);
            SaveManager.syncToBackendImmediate();
            SoundManager.playUIClick();
            return;
        }

        if (currency === 'gold' && save.gold >= cosmetic.goldCost) {
            const grantInfo = { type: 'cosmetic', slot, cosmeticId: cosmetic.id, goldCost: cosmetic.goldCost };
            spendGold(grantInfo).then(() => {
                SoundManager.playUIClick();
            }).catch(err => {
                console.error('[handleBuyCosmetic trail/kill] spendGold failed:', err);
            });
        } else if (currency === 'token' && (omenxBalance ?? 0) >= cosmetic.tokenCost) {
            setPurchasing(true);
            const skuId = getCosmeticSku(slot, cosmetic.name, cosmetic.goldCost);
            // Pass goldCost so server can verify it matches the SKU's price tier
            // (prevents tampered grantInfo from unlocking expensive cosmetics via cheap SKU).
            const grantInfo = { type: 'cosmetic', slot, cosmeticId: cosmetic.id, goldCost: cosmetic.goldCost };
            purchaseSku(skuId, grantInfo).then(() => {
                SoundManager.playUIClick();
            }).catch(err => {
                console.error('[handleBuyCosmetic trail/kill] purchase failed — cosmetic NOT granted:', err);
            }).finally(() => {
                setPurchasing(false);
                refreshBalance();
            });
        }
    };

    const renderStats = () => {
        const typeConfig = UPGRADE_TYPES.find(t => t.id === activeCategory);
        if (!typeConfig || !typeConfig.goldCosts || !typeConfig.tokenCosts) return null;
        const saveKey = activeCategory === 'permanent' ? 'permanentUpgrades' : activeCategory === 'weekly' ? 'weeklyUpgrades' : 'seasonalUpgrades';
        const upgradesObj = save[saveKey] || {};
        
        return (
            <div className="space-y-2 md:space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4 mb-2 md:mb-4">
                    <h2 className="text-xl md:text-2xl font-bold text-white">Base Stats</h2>
                    {(activeCategory === 'weekly' || activeCategory === 'seasonal') && (
                        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                            <BuyAllStatsGoldButton
                                tier={activeCategory}
                                goldCosts={typeConfig.goldCosts}
                                save={save}
                            />
                            <BuyAllStatsButton
                                tier={activeCategory}
                                tokenCosts={typeConfig.tokenCosts}
                                save={save}
                                omenxBalance={omenxBalance}
                                omenxBlocked={omenxBlocked}
                                omenxBlockedMsg={omenxBlockedMsg}
                            />
                        </div>
                    )}
                </div>
                {STATS.filter(Boolean).map(stat => {
                    const upgrades = upgradesObj;
                    const level = upgrades[stat.id] || 0;
                    const isMax = level >= typeConfig.goldCosts.length;
                    
                    const goldCost = isMax ? 0 : typeConfig.goldCosts[level];
                                    const tokenCost = isMax ? 0 : typeConfig.tokenCosts[level];

                                    const canAffordGold = save.gold >= goldCost;
                                    const canAffordToken = (omenxBalance ?? 0) >= tokenCost;

                                    return (
                                        <div key={stat.id} className="bg-slate-800 p-1.5 md:p-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 md:gap-4 border border-slate-700">
                                            <div className="flex items-center gap-2 md:gap-4">
                                                <div className="p-1.5 md:p-3 bg-slate-700 rounded-md md:rounded-lg text-cyan-400 shrink-0 text-base md:text-xl">
                                                    {stat.emoji}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-sm md:text-lg text-white">{stat.name} <span className="text-slate-400 font-normal text-xs md:text-sm">({stat.label})</span></h3>
                                                    <div className="text-[10px] md:text-xs text-slate-400 mb-0.5 md:mb-1">
                                                        {activeCategory === 'permanent' && `${stat.perm} per level`}
                                                        {activeCategory === 'weekly' && `${stat.week} per level`}
                                                        {activeCategory === 'seasonal' && `${stat.season} per level`}
                                                    </div>
                                                    <StatPips level={level} statId={stat.id} />
                                                </div>
                                            </div>
                                            <div className="flex gap-2 w-full sm:w-auto">
                                                <button
                                                    onClick={() => handleBuyStat(stat.id, 'gold')}
                                                    disabled={isMax || !canAffordGold || purchasing}
                                                    className={`flex-1 sm:flex-none px-4 md:px-6 py-2 rounded-lg font-bold transition-colors text-sm md:text-base flex items-center justify-center gap-1.5 ${
                                                        isMax ? 'bg-slate-700 text-slate-500' :
                                                        canAffordGold && !purchasing ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900' :
                                                        'bg-slate-700 text-slate-400 border border-slate-600'
                                                    }`}
                                                >
                                                    {isMax ? 'MAX' : <><Coins className="w-4 h-4 fill-current" /> {goldCost.toLocaleString()} Gold</>}
                                                </button>
                                                {!isMax && (
                                                    <div className="flex items-center justify-center text-slate-500 text-xs font-bold sm:hidden md:flex">OR</div>
                                                )}
                                                {!isMax && (
                                                    <button
                                                       onClick={() => !purchasing && !omenxBlocked && confirmPurchase(tokenCost, `${stat.name} Upgrade`, () => handleBuyStat(stat.id, 'token'))}
                                                       disabled={!canAffordToken || purchasing || omenxBlocked}
                                                       title={omenxBlocked ? (omenxBlockedMsg || 'OMENX purchases are temporarily disabled.') : undefined}
                                                       className={`flex-1 sm:flex-none px-4 md:px-6 py-2 rounded-lg font-bold transition-colors text-sm md:text-base flex items-center justify-center gap-1.5 ${
                                                            omenxBlocked ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed' :
                                                            canAffordToken && !purchasing ? 'bg-emerald-600 hover:bg-emerald-500 text-white' :
                                                            'bg-slate-700 text-slate-400 border border-slate-600'
                                                        }`}
                                                     >
                                                        {omenxBlocked ? '🔒 PAUSED' : purchasing ? '…' : <><OmenXIcon className="w-5 h-5" /> {tokenCost.toLocaleString()} OMENX</>}
                                                     </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                })}
            </div>
        );
    };

    const renderArmory = () => {
        const baseWeapons = Object.values(WEAPONS).filter(w => !w.isSynergy);

        const typeConfig = UPGRADE_TYPES.find(t => t.id === activeCategory);
        if (!typeConfig) return null;
        const saveKey = activeCategory === 'permanent' ? 'permanentWeaponUpgrades' : activeCategory === 'weekly' ? 'weeklyWeaponUpgrades' : 'seasonalWeaponUpgrades';

        const weapon = baseWeapons.find(w => w.id === selectedWeapon) || baseWeapons[0];

        // Per-weapon thematic labels — fall back to neutral names for synergies/evolutions without a `labels` map.
        const upgradeTypes = [
            { id: 'damage',   name: weapon.labels?.damage   || 'Damage',   icon: Zap,      desc: '+10% per level' },
            { id: 'area',     name: weapon.labels?.area     || 'Area',     icon: Sparkles, desc: '+10% per level' },
            { id: 'cooldown', name: weapon.labels?.cooldown || 'Cooldown', icon: Timer,    desc: '-5% per level' }
        ];
        
        const getWeaponUpgrade = (wId, stat) => {
            const perm = save.permanentWeaponUpgrades?.[wId]?.[stat] || 0;
            const week = save.weeklyWeaponUpgrades?.[wId]?.[stat] || 0;
            const season = save.seasonalWeaponUpgrades?.[wId]?.[stat] || 0;
            return perm + week + season;
        };
        const dmgLevel = getWeaponUpgrade(weapon.id, 'damage');
        const areaLevel = getWeaponUpgrade(weapon.id, 'area');
        const cdLevel = getWeaponUpgrade(weapon.id, 'cooldown');
        // Mastery requires PERMANENT levels only (weekly/seasonal don't count).
        const permDmg = save.permanentWeaponUpgrades?.[weapon.id]?.damage || 0;
        const permArea = save.permanentWeaponUpgrades?.[weapon.id]?.area || 0;
        const permCd = save.permanentWeaponUpgrades?.[weapon.id]?.cooldown || 0;
        const isMastered = permDmg >= 5 && permArea >= 5 && permCd >= 5;

        const currentIndex = baseWeapons.findIndex(w => w.id === selectedWeapon);
        const handlePrevWeapon = () => {
            SoundManager.playUIClick();
            const newIndex = currentIndex > 0 ? currentIndex - 1 : baseWeapons.length - 1;
            setSelectedWeapon(baseWeapons[newIndex].id);
        };
        const handleNextWeapon = () => {
            SoundManager.playUIClick();
            const newIndex = currentIndex < baseWeapons.length - 1 ? currentIndex + 1 : 0;
            setSelectedWeapon(baseWeapons[newIndex].id);
        };

        return (
            <div className="space-y-2 md:space-y-4">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-2 md:mb-4">Armory</h2>
                
                <div className="flex items-center justify-between bg-slate-800 p-1.5 md:p-2 rounded-xl mb-2 md:mb-4 border border-slate-700">
                    <button 
                        onClick={handlePrevWeapon}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="text-center font-bold text-cyan-400 text-lg">
                        {weapon.name}
                        <div className="text-xs text-slate-500 font-normal mt-0.5">
                            {currentIndex + 1} / {baseWeapons.length}
                        </div>
                    </div>
                    <button 
                        onClick={handleNextWeapon}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                </div>
                
                <div className={`bg-slate-800 p-2 md:p-4 rounded-xl border ${isMastered ? 'border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 'border-slate-700'}`}>
                    <div className="mb-2 md:mb-4">
                        <div className="flex justify-between items-start mb-1 gap-2 flex-wrap">
                            <h3 className={`font-bold text-lg md:text-xl ${isMastered ? 'text-yellow-400' : 'text-white'}`}>{weapon.name}</h3>
                            <div className="flex items-center gap-2 flex-wrap">
                                {(activeCategory === 'weekly' || activeCategory === 'seasonal') && (
                                    <>
                                        <BuyAllWeaponStatsGoldButton
                                            tier={activeCategory}
                                            weapon={weapon}
                                            goldCosts={typeConfig.goldCosts}
                                            save={save}
                                        />
                                        <BuyAllWeaponStatsButton
                                            tier={activeCategory}
                                            weapon={weapon}
                                            tokenCosts={typeConfig.tokenCosts}
                                            save={save}
                                            omenxBalance={omenxBalance}
                                            omenxBlocked={omenxBlocked}
                                            omenxBlockedMsg={omenxBlockedMsg}
                                        />
                                    </>
                                )}
                                {isMastered && (
                                    <div className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-1 rounded border border-yellow-500/50">
                                        MASTERED
                                    </div>
                                )}
                            </div>
                        </div>
                        <p className="text-slate-400 text-xs md:text-sm">{weapon.desc}</p>
                        {isMastered && (
                            <p className="text-yellow-300 text-xs md:text-sm font-bold mt-2">✨ {weapon.masteryDesc}</p>
                        )}
                        {isMastered && activeCategory !== 'permanent' && (
                            <div className="mt-2 bg-cyan-950/30 border border-cyan-700/40 rounded-lg px-2.5 py-1.5 text-[10px] md:text-xs text-cyan-300 leading-snug">
                                💡 You've mastered this weapon permanently. The <strong className="capitalize text-white">{activeCategory}</strong> upgrades below are a <strong className="text-white">temporary extra boost</strong> stacked on top — they reset when {activeCategory === 'weekly' ? 'the week ends' : 'the season ends'}.
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                        {upgradeTypes.map(stat => {
                            const level = save[saveKey]?.[weapon.id]?.[stat.id] || 0;
                            const isMax = level >= typeConfig.goldCosts.length;
                            const cost = isMax ? 0 : (typeConfig.goldCosts[level] || 0);
                            const tokenCost = isMax ? 0 : (typeConfig.tokenCosts[level] || 0);
                            const canAffordGold = save.gold >= cost;
                            const canAffordToken = (omenxBalance ?? 0) >= tokenCost;
                            const Icon = stat.icon;

                            return (
                                <div key={stat.id} className="bg-slate-900 p-2 md:p-3 rounded-lg border border-slate-700 flex flex-col justify-between">
                                    <div className="flex items-center justify-between mb-2 md:mb-3">
                                        <div className="flex items-center gap-2 text-slate-300">
                                            <Icon size={16} className="text-cyan-400" />
                                            <div>
                                                <div className="font-bold text-xs md:text-sm leading-tight">{stat.name}</div>
                                                <div className="text-[10px] text-slate-500 leading-tight">{stat.desc}</div>
                                            </div>
                                        </div>
                                        <SmallStatPips level={level} statId={stat.id} />
                                    </div>
                                    <div className="flex gap-2 w-full">
                                        <button
                                            onClick={() => handleBuyWeapon(weapon.id, stat.id, 'gold')}
                                            disabled={isMax || !canAffordGold || purchasing}
                                            className={`flex-1 py-1.5 rounded font-bold transition-colors text-xs flex items-center justify-center gap-1 ${
                                                isMax ? 'bg-slate-800 text-slate-600' :
                                                canAffordGold && !purchasing ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900' :
                                                'bg-slate-800 text-slate-500 border border-slate-700'
                                            }`}
                                        >
                                            {isMax ? 'MAX' : <><Coins className="w-3 h-3 fill-current" /> {cost.toLocaleString()} Gold</>}
                                        </button>
                                        {!isMax && (
                                            <button
                                                onClick={() => !purchasing && !omenxBlocked && confirmPurchase(tokenCost, `${stat.name} Upgrade`, () => handleBuyWeapon(weapon.id, stat.id, 'token'))}
                                                disabled={!canAffordToken || purchasing || omenxBlocked}
                                                title={omenxBlocked ? (omenxBlockedMsg || 'OMENX purchases are temporarily disabled.') : undefined}
                                                className={`flex-1 py-1.5 rounded font-bold transition-colors text-xs flex items-center justify-center gap-1 ${
                                                    omenxBlocked ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed' :
                                                    canAffordToken && !purchasing ? 'bg-emerald-600 hover:bg-emerald-500 text-white' :
                                                    'bg-slate-800 text-slate-500 border border-slate-700'
                                                }`}
                                            >
                                                {omenxBlocked ? '🔒 PAUSED' : purchasing ? '…' : <><OmenXIcon className="w-4 h-4" /> {tokenCost.toLocaleString()} OMENX</>}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const renderTalents = () => {
        const typeConfig = UPGRADE_TYPES.find(t => t.id === activeCategory);
        if (!typeConfig) return null;
        const saveKey = activeCategory === 'permanent' ? 'permanentTalents' : activeCategory === 'weekly' ? 'weeklyTalents' : 'seasonalTalents';

        const unlockedChars = effectiveUnlockedCharacters;
        const currentCharIndex = unlockedChars.indexOf(selectedChar) !== -1 ? unlockedChars.indexOf(selectedChar) : 0;
        const currentCharData = CHARACTERS.find(c => c.id === unlockedChars[currentCharIndex]) || CHARACTERS[0];
        
        const handlePrevChar = () => {
            SoundManager.playUIClick();
            const newIndex = currentCharIndex > 0 ? currentCharIndex - 1 : unlockedChars.length - 1;
            setSelectedChar(unlockedChars[newIndex]);
        };
        const handleNextChar = () => {
            SoundManager.playUIClick();
            const newIndex = currentCharIndex < unlockedChars.length - 1 ? currentCharIndex + 1 : 0;
            setSelectedChar(unlockedChars[newIndex]);
        };

        const handleRespecTalents = () => {
            const unlocked = save[saveKey]?.[selectedChar] || [];
            if (unlocked.length === 0) return;
            const charData = CHARACTERS.find(c => c.id === selectedChar);
            const omenxCosts = { permanent: 10, weekly: 4, seasonal: 20 };
            setRespecModal({
                tier: activeCategory,
                charId: selectedChar,
                charName: charData?.name || selectedChar,
                count: unlocked.length,
                goldCost: TALENT_RESPEC_GOLD_COSTS[activeCategory] || 5000,
                omenxCost: omenxCosts[activeCategory] || 10,
            });
            SoundManager.playUIClick();
        };

        return (
            <div>
                <div className="flex items-center justify-between mb-2 md:mb-4">
                    <h2 className="text-xl md:text-2xl font-bold text-white">Skill Tree</h2>
                    <button 
                        onClick={handleRespecTalents}
                        disabled={(save[saveKey]?.[selectedChar] || []).length === 0}
                        className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800/80 text-red-400 border border-red-800 rounded-lg font-bold text-xs md:text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Respec Talents
                    </button>
                </div>
                
                <div className="flex items-center justify-between bg-slate-800 p-1.5 md:p-2 rounded-xl mb-4 border border-slate-700">
                    <button 
                        onClick={handlePrevChar}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-pink-500 overflow-hidden shadow-[0_0_10px_rgba(236,72,153,0.5)]">
                            {currentCharData.image ? <img src={currentCharData.image} alt={currentCharData.name} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800" />}
                        </div>
                        <div className="text-center font-bold text-pink-400 text-lg">
                            {currentCharData.name}
                            <div className="text-xs text-slate-500 font-normal mt-0.5">
                                {currentCharIndex + 1} / {unlockedChars.length}
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={handleNextChar}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                </div>
                <div className="space-y-2 md:space-y-4 relative">
                    <div className="absolute left-[26px] md:left-[46px] top-8 bottom-8 w-1 bg-slate-800 z-0"></div>
                    
                    {(() => {
                        const allTalents = CHARACTER_TALENTS[selectedChar || 'neobyte'] || [];
                        // Talent prereqs are scoped to the CURRENT tree (permanent / weekly / seasonal).
                        // Buying neo_1 in permanent does NOT let you skip neo_1 in seasonal — each
                        // tree progresses independently (Hugo bug 2026-05-02).
                        const unlocked = save[saveKey]?.[selectedChar || 'neobyte'] || [];
                        const allUnlocked = unlocked;

                        // Group talents: pairs of (Path A, Path B) at same tier render side-by-side; standalone talents render full-width.
                        // Pairs are detected either by the `excludes` property OR by matching `_a`/`_b` id suffixes at the same tier.
                        const groups = [];
                        const consumed = new Set();
                        allTalents.forEach((t, i) => {
                            if (consumed.has(i)) return;
                            const isPathA = t.id.endsWith('a');
                            const isPathB = t.id.endsWith('b');
                            if (t.excludes || isPathA || isPathB) {
                                const partnerIdx = allTalents.findIndex((p, pi) => {
                                    if (pi === i || consumed.has(pi) || p.tier !== t.tier) return false;
                                    if (t.excludes && p.excludes) return true;
                                    if (isPathA && p.id.endsWith('b')) return true;
                                    if (isPathB && p.id.endsWith('a')) return true;
                                    return false;
                                });
                                if (partnerIdx !== -1) {
                                    const partner = allTalents[partnerIdx];
                                    const a = t.id.endsWith('a') ? t : partner;
                                    const b = t.id.endsWith('b') ? t : partner;
                                    groups.push({ type: 'pair', a, b });
                                    consumed.add(i); consumed.add(partnerIdx);
                                    return;
                                }
                            }
                            groups.push({ type: 'single', talent: t });
                            consumed.add(i);
                        });

                        const renderTalentCard = (talent, sideClass = '') => {
                            const isUnlocked = unlocked.includes(talent.id);
                            const canUnlock = !isUnlocked && (
                                talent.tier === 1 ||
                                (talent.requires && allUnlocked.includes(talent.requires) && (!talent.excludes || !allUnlocked.includes(talent.excludes)))
                            );
                            const costTier = Math.min((talent.tier - 1) * 2, typeConfig.goldCosts.length - 1);
                            const goldCost = typeConfig.goldCosts[costTier] || 0;
                            const tokenCost = typeConfig.tokenCosts[costTier] || 0;
                            const canAffordGold = save.gold >= goldCost;
                            const canAffordToken = (omenxBalance ?? 0) >= tokenCost;
                            const isBranchA = talent.id.endsWith('a');
                            const isBranchB = talent.id.endsWith('b');

                            return (
                                <div className={`relative z-10 flex flex-col gap-1.5 md:gap-3 bg-slate-900 p-1.5 md:p-4 rounded-lg md:rounded-xl border border-slate-700 ${sideClass} ${isBranchA ? 'border-l-4 border-l-blue-500' : isBranchB ? 'border-l-4 border-l-purple-500' : ''}`}>
                                    <div className="flex items-center gap-1.5 md:gap-3">
                                        <div className={`w-7 h-7 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0 border-2 md:border-4 text-xs md:text-base font-bold ${
                                            isUnlocked ? 'bg-pink-900 border-pink-500 text-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.5)]' :
                                            canUnlock ? 'bg-slate-800 border-yellow-500 text-yellow-500' :
                                            'bg-slate-800 border-slate-700 text-slate-600'
                                        }`}>
                                            {talent.tier}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className={`font-bold text-xs md:text-base leading-tight ${isUnlocked ? 'text-pink-400' : canUnlock ? 'text-white' : 'text-slate-500'}`}>
                                                {talent.name} {isBranchA ? <span className="text-blue-400 text-[9px] md:text-xs">(A)</span> : isBranchB ? <span className="text-purple-400 text-[9px] md:text-xs">(B)</span> : ''}
                                            </h3>
                                            <p className="text-slate-400 text-[9px] md:text-sm leading-tight">{talent.desc}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-stretch gap-0.5 w-full">
                                        <button
                                            onClick={() => handleBuyTalent(talent, 'gold')}
                                            disabled={isUnlocked || !canUnlock || !canAffordGold || purchasing}
                                            className={`w-full px-2 py-1 md:py-1.5 rounded md:rounded-md font-bold transition-colors text-[11px] md:text-xs flex items-center justify-center gap-1 ${
                                                isUnlocked ? 'bg-pink-900/50 text-pink-500 border border-pink-800' :
                                                canUnlock && canAffordGold && !purchasing ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900' :
                                                'bg-slate-800 text-slate-600 border border-slate-700'
                                            }`}
                                        >
                                            {isUnlocked ? 'UNLOCKED' : <><Coins className="w-3 h-3 md:w-4 md:h-4 fill-current" /> {goldCost.toLocaleString()} Gold</>}
                                        </button>
                                        {!isUnlocked && (
                                            <div className="flex items-center justify-center gap-1.5">
                                                <div className="flex-1 h-px bg-slate-700/60"></div>
                                                <span className="text-slate-500 text-[9px] md:text-[10px] font-bold tracking-widest">OR</span>
                                                <div className="flex-1 h-px bg-slate-700/60"></div>
                                            </div>
                                        )}
                                        {!isUnlocked && (
                                            <button
                                                onClick={() => !purchasing && !omenxBlocked && confirmPurchase(tokenCost, `${talent.name} Talent`, () => handleBuyTalent(talent, 'token'))}
                                                disabled={!canUnlock || !canAffordToken || purchasing || omenxBlocked}
                                                title={omenxBlocked ? (omenxBlockedMsg || 'OMENX purchases are temporarily disabled.') : undefined}
                                                className={`w-full px-2 py-1 md:py-1.5 rounded md:rounded-md font-bold transition-colors text-[11px] md:text-xs flex items-center justify-center gap-1 ${
                                                    omenxBlocked ? 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed' :
                                                    canUnlock && canAffordToken && !purchasing ? 'bg-emerald-600 hover:bg-emerald-500 text-white' :
                                                    'bg-slate-800 text-slate-600 border border-slate-700'
                                                }`}
                                            >
                                                {omenxBlocked ? '🔒 PAUSED' : purchasing ? '…' : <><OmenXIcon className="w-3.5 h-3.5 md:w-5 md:h-5" /> {tokenCost.toLocaleString()} OMENX</>}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        };

                        // Show the "Choose ONE path" warning only above the first pair (since selecting a path locks all subsequent tiers).
                        const firstPairIndex = groups.findIndex(g => g.type === 'pair');

                        return groups.map((g, gi) => {
                            if (g.type === 'single') {
                                return <React.Fragment key={`s-${gi}`}>{renderTalentCard(g.talent)}</React.Fragment>;
                            }
                            return (
                                <React.Fragment key={`p-${gi}`}>
                                    {gi === firstPairIndex && (
                                        <div className="relative z-10 flex items-center gap-2 ml-0 sm:ml-8 -mb-1 mt-1">
                                            <div className="text-[9px] md:text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-950/40 border border-amber-700/50 px-2 py-0.5 rounded">
                                                ⚠ Choose ONE path — picking one locks the other across all tiers
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-1.5 md:gap-3 ml-0 sm:ml-8 items-stretch relative">
                                        {renderTalentCard(g.a)}
                                        {renderTalentCard(g.b)}
                                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                                            <span className="text-slate-400 text-[9px] md:text-xs font-bold tracking-widest bg-slate-950 border border-slate-700 rounded-full px-1.5 py-0.5 md:px-2 md:py-1 shadow-lg">OR</span>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        });
                    })()}
                </div>
            </div>
        );
    };

    const renderRelics = () => {
        return (
            <div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Ancient Relics</h2>
                <p className="text-slate-400 mb-6 text-sm">Equip powerful global artifacts. You can only equip up to 2 Relics at once. Upgrade them using Relic Fragments!</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {RELICS.map(relic => {
                        const unlocked = save.unlockedRelics || [];
                        const equipped = save.equippedRelics || [];
                        const relicLevels = save.relicLevels || {};
                        const isOwned = unlocked.includes(relic.id);
                        const isEquipped = equipped.includes(relic.id);
                        const canEquipMore = equipped.length < 2;
                        const currentLevel = isOwned ? (relicLevels[relic.id] || 1) : 0;
                        const isMaxLevel = currentLevel >= 5;
                        
                        const costMultiplier = currentLevel === 0 ? 1 : Math.pow(2, currentLevel);
                        const cost = relic.fragmentCost * costMultiplier;
                        const canAfford = (save.relicFragments || 0) >= cost;
                        
                        const rarity = currentLevel > 0 ? RELIC_RARITIES[currentLevel - 1] : RELIC_RARITIES[0];
                        const nextRarity = !isMaxLevel ? RELIC_RARITIES[currentLevel] : null;
                        
                        const formatVal = (val) => {
                            if (relic.stat === 'luck' || relic.stat === 'regen') return `+${val.toFixed(1).replace('.0', '')}`;
                            return `+${Math.round(val * 100)}%`;
                        };
                        
                        const currentBuff = currentLevel > 0 ? formatVal(relic.values[currentLevel - 1]) : null;
                        const nextBuff = !isMaxLevel ? formatVal(relic.values[currentLevel]) : null;

                        return (
                            <div key={relic.id} className={`p-4 rounded-xl border-2 transition-all ${isEquipped ? `${rarity.border} ${rarity.glow} ${rarity.bg}` : isOwned ? `${rarity.border} bg-slate-800` : 'border-slate-700 bg-slate-800/50'}`}>
                                <div className="flex items-start gap-4 mb-2">
                                    <div className="text-3xl bg-slate-900 p-3 rounded-lg border border-slate-700 shrink-0">{relic.icon}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between flex-wrap gap-2">
                                            <div>
                                                <h3 className={`text-lg font-bold truncate ${isOwned ? rarity.color : 'text-slate-400'}`}>{relic.name}</h3>
                                                {isOwned && (
                                                    <div className={`text-[10px] font-bold ${rarity.color} uppercase tracking-wider`}>
                                                        Lv.{currentLevel} {rarity.name} {isEquipped && ' • EQUIPPED'}
                                                    </div>
                                                )}
                                            </div>
                                            {isOwned && (
                                                <button 
                                                    onClick={() => handleToggleRelic(relic.id)}
                                                    disabled={!isEquipped && !canEquipMore}
                                                    className={`px-3 py-1 h-fit rounded-md font-bold text-xs transition-colors shrink-0 ${
                                                        isEquipped ? 'bg-slate-700 text-white hover:bg-slate-600' : 
                                                        canEquipMore ? 'bg-purple-600 hover:bg-purple-500 text-white' : 
                                                        'bg-slate-800 text-slate-500 border border-slate-700'
                                                    }`}
                                                >
                                                    {isEquipped ? 'UNEQUIP' : canEquipMore ? 'EQUIP' : 'SLOTS FULL'}
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-300 mt-2">{relic.desc}</p>
                                        
                                        <div className="mt-3 flex gap-1.5 flex-wrap">
                                            {relic.values.map((v, i) => {
                                                const lvlRarity = RELIC_RARITIES[i];
                                                const isCurrent = currentLevel === i + 1;
                                                const isUnlocked = currentLevel > i;
                                                return (
                                                    <div key={i} className={`text-[10px] px-1.5 py-0.5 rounded border flex flex-col items-center min-w-[36px] ${isCurrent ? `${lvlRarity.border} bg-slate-800 ${lvlRarity.color} font-bold shadow-[0_0_10px_currentColor]` : isUnlocked ? `border-slate-700 bg-slate-800/50 ${lvlRarity.color}` : 'border-slate-800/50 text-slate-600 bg-slate-900/50'}`} title={lvlRarity.name}>
                                                        <span className="opacity-70 text-[8px]">{lvlRarity.name.substring(0,3).toUpperCase()}</span>
                                                        <span>{formatVal(v)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="mt-4 border-t border-slate-700/50 pt-4">
                                    {!isMaxLevel ? (
                                        <button 
                                            onClick={() => handleBuyRelic(relic)}
                                            disabled={!canAfford}
                                            className={`w-full py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                                                canAfford ? 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-[0_0_15px_rgba(217,70,239,0.3)]' : 'bg-slate-900 text-slate-500 border border-slate-700'
                                            }`}
                                        >
                                            <span>{isOwned ? 'UPGRADE' : 'CRAFT'}</span>
                                            <span className="bg-slate-950/50 px-2 py-0.5 rounded border border-fuchsia-500/30 text-fuchsia-300 flex items-center gap-1"><Puzzle className="w-3 h-3 fill-current" /> {cost}</span>
                                        </button>
                                    ) : (
                                        <div className="w-full py-2 text-center text-yellow-500 font-bold text-sm bg-yellow-950/20 rounded-lg border border-yellow-500/30">
                                            MAXIMUM LEVEL REACHED
                                        </div>
                                    )}
                                    {/* S6 Phase 3a — Prestige (only renders for L5 relics; auto-hides otherwise). */}
                                    <RelicPrestigeBadge relic={relic} save={save} setSave={setSave} />
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        );
    };

    const renderCosmetics = () => {
        const isTrail = cosmeticTab === 'trail';
        const list = isTrail ? TRAIL_COSMETICS : KILL_COSMETICS;
        const unlockKey = isTrail ? 'unlockedCosmetics' : 'unlockedKillEffects';
        const freeId = isTrail ? 'default' : 'none';
        const equippedTrail = save.cosmetics?.trail || 'default';
        const equippedKill = save.cosmetics?.killEffect || 'none';

        // Preview uses currently equipped values (both tabs always visible in preview)
        const previewTrail = equippedTrail;
        const previewKill = equippedKill;

        return (
            <div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-3">Cosmetics</h2>

                {/* Live Preview — hidden on skins tab */}
                {cosmeticTab !== 'skin' && (
                    <div className="mb-4">
                        <CosmeticPreview 
                            trailId={previewTrail} 
                            killEffectId={previewKill}
                            charId={selectedChar}
                            playerColor={SKIN_COSMETICS.find(s => s.id === (save.cosmetics?.skins?.[selectedChar] || `${selectedChar}_default`))?.color || CHARACTERS.find(c => c.id === selectedChar)?.color || '#00cfff'}
                        />
                        <div className="flex gap-3 mt-2 text-xs text-slate-400 justify-center">
                            <span>Trail: <strong className="text-pink-400">{TRAIL_COSMETICS.find(t => t.id === equippedTrail)?.name}</strong></span>
                            <span>Kill Effect: <strong className="text-pink-400">{KILL_COSMETICS.find(k => k.id === equippedKill)?.name}</strong></span>
                        </div>
                    </div>
                )}

                {/* Tab switcher */}
                <div className="flex gap-2 mb-4 border-b border-slate-800 pb-2 flex-wrap">
                    <button
                        onClick={() => { SoundManager.playUIClick(); setCosmeticTab('trail'); setPreviewSkinColor(null); }}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${cosmeticTab === 'trail' ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                        ✨ Trails
                    </button>
                    <button
                        onClick={() => { SoundManager.playUIClick(); setCosmeticTab('kill'); setPreviewSkinColor(null); }}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${cosmeticTab === 'kill' ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                        💥 Kill Effects
                    </button>
                    <button
                        onClick={() => { SoundManager.playUIClick(); setCosmeticTab('skin'); }}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${cosmeticTab === 'skin' ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                        🎨 Character Skins
                    </button>
                </div>

                {cosmeticTab === 'skin' ? (() => {
                    const unlockedChars = effectiveUnlockedCharacters;
                    const currentChar = CHARACTERS.find(c => c.id === unlockedChars[skinCharIndex % unlockedChars.length]) || CHARACTERS[0];
                    const charSkins = SKIN_COSMETICS.filter(s => s.charId === currentChar.id);
                    const equippedSkinId = save.cosmetics?.skins?.[currentChar.id] || `${currentChar.id}_default`;
                    const equippedSkin = SKIN_COSMETICS.find(s => s.id === equippedSkinId) || charSkins[0];
                    const displayColor = previewSkinColor || equippedSkin?.color || currentChar.color;
                    const unlockedSkins = save.unlockedSkins || [];

                    return (
                        <div>
                            {/* Skin color preview */}
                            <div className="mb-4 bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
                                <div className="relative shrink-0">
                                    <div className="w-16 h-16 rounded-full border-4 border-slate-600 overflow-hidden bg-slate-900 flex items-center justify-center shadow-lg"
                                        style={{ boxShadow: `0 0 20px ${displayColor}60` }}>
                                        {currentChar.image
                                            ? <img src={currentChar.image} alt={currentChar.name} className="w-full h-full object-cover" style={{ filter: `drop-shadow(0 0 6px ${displayColor})` }} />
                                            : <div className="w-10 h-10 rounded-full" style={{ background: displayColor }} />
                                        }
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-slate-800" style={{ background: displayColor }} />
                                </div>
                                <div>
                                    <div className="font-bold text-white text-sm">{currentChar.name}</div>
                                    {previewSkinColor
                                        ? <div className="text-xs text-amber-400 font-bold mt-0.5">👁 Previewing color</div>
                                        : <div className="text-xs text-pink-400 font-bold mt-0.5">Equipped: {equippedSkin?.name || 'Default'}</div>
                                    }
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <div className="w-3 h-3 rounded-full border border-slate-600" style={{ background: displayColor }} />
                                        <span className="text-[10px] text-slate-500 font-mono">{displayColor}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Character selector */}
                            <div className="flex items-center justify-between bg-slate-800 p-2 rounded-xl mb-4 border border-slate-700">
                                <button onClick={() => { SoundManager.playUIClick(); setSkinCharIndex(i => (i - 1 + unlockedChars.length) % unlockedChars.length); setPreviewSkinColor(null); }}
                                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white">
                                    <ChevronLeft className="w-6 h-6" />
                                </button>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-pink-500" style={{ borderColor: currentChar.color }}>
                                        {currentChar.image ? <img src={currentChar.image} alt={currentChar.name} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800" />}
                                    </div>
                                    <div className="font-bold text-white">{currentChar.name}
                                        <div className="text-xs text-slate-500 font-normal">{skinCharIndex % unlockedChars.length + 1} / {unlockedChars.length}</div>
                                    </div>
                                </div>
                                <button onClick={() => { SoundManager.playUIClick(); setSkinCharIndex(i => (i + 1) % unlockedChars.length); setPreviewSkinColor(null); }}
                                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white">
                                    <ChevronRight className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                                {charSkins.map(skin => {
                                    const isOwned = skin.goldCost === 0 || unlockedSkins.includes(skin.id);
                                    const isEquipped = equippedSkinId === skin.id;
                                    const canAffordGold = save.gold >= skin.goldCost;
                                    const canAffordToken = (omenxBalance ?? 0) >= skin.tokenCost;
                                    return (
                                        <div key={skin.id} className={`bg-slate-800 p-3 rounded-xl border-2 flex flex-col gap-2 transition-all ${isEquipped ? 'border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.3)]' : 'border-slate-700 hover:border-slate-600'}`}>
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full border-2 shrink-0" style={{ background: skin.color, borderColor: skin.color + '80' }} />
                                                <div>
                                                    <div className="font-bold text-sm text-white leading-tight">{skin.name}</div>
                                                    {isEquipped && <div className="text-[10px] text-pink-400 font-bold">EQUIPPED</div>}
                                                    {!isOwned && <div className="text-[10px] text-slate-500 font-bold">LOCKED</div>}
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-slate-400 leading-snug">
                                               {skin.isSeasonalReward 
                                                   ? 'Quest Milestone Reward: Earn Quest Points from Daily Missions to unlock!'
                                                   : skin.desc}
                                            </p>
                                            {isOwned ? (
                                                <button onClick={() => handleBuyCosmetic(skin, 'skin', 'gold')} disabled={isEquipped}
                                                    className={`w-full py-1.5 rounded-lg font-bold transition-colors text-xs ${isEquipped ? 'bg-pink-700 text-pink-200 cursor-default' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>
                                                    {isEquipped ? '✓ EQUIPPED' : 'EQUIP'}
                                                </button>
                                            ) : (
                                                <div className="flex gap-1.5 w-full flex-col">
                                                    <button onClick={() => handleBuyCosmetic(skin, 'skin', 'preview')}
                                                       className={`w-full py-1 rounded-lg font-bold transition-colors text-xs ${previewSkinColor === skin.color ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                                       {previewSkinColor === skin.color ? '👁 Previewing' : '👁 Preview'}
                                                    </button>
                                                    {skin.isSeasonalReward ? (() => {
                                                        const points = save.seasonalPoints || 0;
                                                        const canClaim = points >= QUEST_POINTS_PER_SKIN;
                                                        const isClaimingThis = claimingSkinId === skin.id;
                                                        return (
                                                            <button
                                                                onClick={() => canClaim && !claimingSkinId && handleClaimQuestSkin(skin)}
                                                                disabled={!canClaim || !!claimingSkinId}
                                                                title={canClaim ? `Spend ${QUEST_POINTS_PER_SKIN} Quest Points to claim this skin` : `You need ${QUEST_POINTS_PER_SKIN - points} more Quest Points`}
                                                                className={`w-full py-1.5 rounded-lg font-bold transition-colors text-xs flex items-center justify-center gap-1 ${
                                                                    canClaim && !isClaimingThis ? 'bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-slate-900 shadow-[0_0_10px_rgba(234,179,8,0.4)] animate-pulse' :
                                                                    'bg-slate-900 text-slate-500 border border-slate-700 cursor-not-allowed'
                                                                }`}
                                                            >
                                                                {isClaimingThis ? '…' : canClaim ? <>🏆 Claim ({QUEST_POINTS_PER_SKIN} Pts)</> : <><Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {points} / {QUEST_POINTS_PER_SKIN} Pts</>}
                                                            </button>
                                                        );
                                                    })() : (
                                                        <div className="flex gap-1.5">
                                                            <button onClick={() => handleBuyCosmetic(skin, 'skin', 'gold')} disabled={!canAffordGold || purchasing}
                                                                className={`flex-1 py-1.5 rounded-lg font-bold transition-colors text-xs flex items-center justify-center gap-1 ${canAffordGold && !purchasing ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900' : 'bg-slate-900 text-slate-500 border border-slate-700'}`}>
                                                                <Coins className="w-3 h-3 fill-current" /> {skin.goldCost.toLocaleString()} Gold
                                                            </button>
                                                            {skin.tokenCost > 0 && (
                                                                <button onClick={() => !purchasing && !omenxBlocked && confirmPurchase(skin.tokenCost, `${skin.name} Skin`, () => handleBuyCosmetic(skin, 'skin', 'token'))} disabled={!canAffordToken || purchasing || omenxBlocked}
                                                                        title={omenxBlocked ? (omenxBlockedMsg || 'OMENX purchases are temporarily disabled.') : undefined}
                                                                        className={`flex-1 py-1.5 rounded-lg font-bold transition-colors text-xs flex items-center justify-center gap-1 ${omenxBlocked ? 'bg-slate-900 text-slate-500 border border-slate-700 cursor-not-allowed' : canAffordToken && !purchasing ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-900 text-slate-500 border border-slate-700'}`}>
                                                                        {omenxBlocked ? '🔒 PAUSED' : <><OmenXIcon className="w-4 h-4" /> {skin.tokenCost.toLocaleString()} OMENX</>}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })() : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                    {list.map(cosmetic => {
                        const unlocked = save[unlockKey] || [freeId];
                        const isOwned = unlocked.includes(cosmetic.id);
                        const isEquipped = isTrail ? equippedTrail === cosmetic.id : equippedKill === cosmetic.id;
                        const canAffordGold = save.gold >= cosmetic.goldCost;
                        const canAffordToken = (omenxBalance ?? 0) >= cosmetic.tokenCost;

                        return (
                            <div key={cosmetic.id} className={`bg-slate-800 p-3 rounded-xl border-2 flex flex-col gap-2 transition-all ${isEquipped ? 'border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.3)]' : 'border-slate-700 hover:border-slate-600'}`}>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">{cosmetic.icon}</span>
                                    <div>
                                        <div className="font-bold text-sm text-white leading-tight">{cosmetic.name}</div>
                                        {isEquipped && <div className="text-[10px] text-pink-400 font-bold">EQUIPPED</div>}
                                        {!isOwned && cosmetic.goldCost > 0 && <div className="text-[10px] text-slate-500 font-bold">LOCKED</div>}
                                    </div>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-snug">{cosmetic.desc}</p>

                                {isOwned ? (
                                    <button
                                        onClick={() => handleBuyCosmetic(cosmetic, cosmeticTab, 'gold')}
                                        disabled={isEquipped}
                                        className={`w-full py-1.5 rounded-lg font-bold transition-colors text-xs ${
                                            isEquipped ? 'bg-pink-700 text-pink-200 cursor-default' : 'bg-slate-700 text-white hover:bg-slate-600'
                                        }`}
                                    >
                                        {isEquipped ? '✓ EQUIPPED' : 'EQUIP'}
                                    </button>
                                ) : (
                                    <div className="flex gap-1.5 w-full flex-col">
                                        <button
                                            onClick={() => handleBuyCosmetic(cosmetic, cosmeticTab, 'preview')}
                                            className="w-full py-1 rounded-lg font-bold transition-colors text-xs bg-slate-700 text-slate-300 hover:bg-slate-600"
                                        >
                                            👁 Preview
                                        </button>
                                        <div className="flex gap-1.5">
                                            <button
                                                onClick={() => handleBuyCosmetic(cosmetic, cosmeticTab, 'gold')}
                                                disabled={!canAffordGold || purchasing}
                                                className={`flex-1 py-1.5 rounded-lg font-bold transition-colors text-xs flex items-center justify-center gap-1 ${
                                                    canAffordGold && !purchasing ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900' : 'bg-slate-900 text-slate-500 border border-slate-700'
                                                }`}
                                            >
                                                <Coins className="w-3 h-3 fill-current" /> {cosmetic.goldCost.toLocaleString()} Gold
                                            </button>
                                            {cosmetic.tokenCost > 0 && (
                                                <button
                                                    onClick={() => !purchasing && !omenxBlocked && confirmPurchase(cosmetic.tokenCost, `${cosmetic.name}`, () => handleBuyCosmetic(cosmetic, cosmeticTab, 'token'))}
                                                    disabled={!canAffordToken || purchasing || omenxBlocked}
                                                    title={omenxBlocked ? (omenxBlockedMsg || 'OMENX purchases are temporarily disabled.') : undefined}
                                                    className={`flex-1 py-1.5 rounded-lg font-bold transition-colors text-xs flex items-center justify-center gap-1 ${
                                                        omenxBlocked ? 'bg-slate-900 text-slate-500 border border-slate-700 cursor-not-allowed' :
                                                        canAffordToken && !purchasing ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-900 text-slate-500 border border-slate-700'
                                                    }`}
                                                >
                                                    {omenxBlocked ? '🔒 PAUSED' : <><OmenXIcon className="w-3 h-3" /> {cosmetic.tokenCost.toLocaleString()} OMENX</>}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                )}
            </div>
        );
    };

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
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest" style={{ background: 'linear-gradient(90deg, #D946EF, #8B5CF6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(217,70,239,0.5))' }}>COSMIC ARMORY</h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">Enhance your operatives and arsenal.</p>
                        <div className="mt-2 md:mt-3">
                            <NFTPerkBadge />
                        </div>
                    </div>
                    <CurrencyHeader />
                </header>

                <div className="flex flex-wrap gap-2 md:gap-3 mb-4 md:mb-6">
                    {UPGRADE_TYPES.map(type => (
                        <button
                            key={type.id}
                            onClick={() => { SoundManager.playUIClick(); setActiveCategory(type.id); }}
                            className={`px-3 py-2 md:px-5 md:py-2.5 rounded-xl font-black tracking-widest uppercase text-xs md:text-sm transition-all ${
                                activeCategory === type.id 
                                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]' 
                                : 'bg-[#0b0416]/80 border border-slate-700/50 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-200'
                            }`}
                        >
                            {type.name}
                        </button>
                    ))}
                    <button
                        onClick={() => { SoundManager.playUIClick(); setActiveCategory('relics'); }}
                        className={`px-3 py-2 md:px-5 md:py-2.5 rounded-xl font-black tracking-widest uppercase text-xs md:text-sm transition-all ${
                            activeCategory === 'relics' 
                            ? 'bg-purple-500/20 border border-purple-400 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.3)]' 
                            : 'bg-[#0b0416]/80 border border-slate-700/50 text-slate-400 hover:border-purple-500/50 hover:text-purple-200'
                        }`}
                    >
                        💎 Relics
                    </button>
                    <button
                        onClick={() => { SoundManager.playUIClick(); setActiveCategory('forge'); }}
                        className={`px-3 py-2 md:px-5 md:py-2.5 rounded-xl font-black tracking-widest uppercase text-xs md:text-sm transition-all ${
                            activeCategory === 'forge' 
                            ? 'bg-yellow-500/20 border border-yellow-400 text-yellow-300 shadow-[0_0_15px_rgba(250,204,21,0.3)]' 
                            : 'bg-[#0b0416]/80 border border-slate-700/50 text-slate-400 hover:border-yellow-500/50 hover:text-yellow-200'
                        }`}
                    >
                        🔨 Forge
                    </button>
                    <button
                        onClick={() => { SoundManager.playUIClick(); navigate('/wardrobe'); }}
                        className="px-3 py-2 md:px-5 md:py-2.5 rounded-xl font-black tracking-widest uppercase text-xs md:text-sm transition-all bg-[#0b0416]/80 border border-cyan-500/40 text-cyan-300 hover:border-cyan-400 hover:text-cyan-200"
                        title="Cosmetics moved to the Wardrobe"
                    >
                        🪞 Wardrobe →
                    </button>
                </div>

                {timeLeft && (
                    <div className="mb-3 md:mb-4 text-xs md:text-sm font-bold text-cyan-400 bg-slate-800/50 p-1.5 md:p-2 rounded-md md:rounded-lg border border-slate-700 inline-block">
                        Resets in: {timeLeft}
                    </div>
                )}

                {omenxBlocked && (
                    <div className="mb-3 md:mb-4 bg-red-950/40 border border-red-700/60 rounded-lg p-3 flex items-start gap-2">
                        <span className="text-red-300 text-lg leading-none mt-0.5">🔒</span>
                        <div className="text-xs md:text-sm text-red-200 leading-snug">
                            <strong className="text-red-100">OMENX purchases are temporarily paused.</strong>
                            <div className="mt-0.5 opacity-90">{omenxBlockedMsg || 'The settlement service is being restored. Gold upgrades are still available.'}</div>
                        </div>
                    </div>
                )}

                {activeCategory === 'permanent' && (
                    <div className="mb-3 text-[11px] md:text-xs text-emerald-300/90 bg-emerald-950/30 border border-emerald-700/40 rounded-lg px-3 py-2">
                        💡 <strong className="text-emerald-400">Pool Bias points:</strong> Every permanent stat, talent and weapon level you buy here grants you Pool Bias points. Spend them on the <strong className="text-white">Loadouts page</strong> to make specific weapons or stats appear <strong className="text-white">+10% more often per point</strong> in your in-run level-up choices. <span className="text-slate-500">(First 10 levels = 1pt each, then 1pt per 2 levels.)</span>
                    </div>
                )}

                <div className="flex-1 bg-[#0b0416]/60 backdrop-blur-xl rounded-xl md:rounded-2xl p-2 md:p-6 border border-[#8B5CF6]/30 shadow-[0_0_50px_rgba(139,92,246,0.15),inset_0_1px_0_rgba(255,255,255,0.1)] min-h-[400px] md:min-h-[600px]">
                    {activeCategory === 'forge' ? (
                        <ForgePanel save={save} setSave={setSave} />
                    ) : activeCategory === 'relics' ? (
                        renderRelics()
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-2 mb-3 border-b border-slate-800 pb-2">
                                {['stats', 'armory', 'talents'].map(sub => (
                                    <button
                                        key={sub}
                                        onClick={() => { SoundManager.playUIClick(); setSubCategory(sub); }}
                                        className={`px-4 py-2 rounded-lg font-bold text-sm md:text-base capitalize transition-colors whitespace-nowrap ${
                                            subCategory === sub ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                        }`}
                                    >
                                        {sub}
                                    </button>
                                ))}
                            </div>
                            {subCategory === 'stats' && renderStats()}
                            {subCategory === 'armory' && renderArmory()}
                            {subCategory === 'talents' && renderTalents()}
                        </>
                    )}
                    
                </div>
            </div>
            
            {purchaseError && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-red-900 border-2 border-red-500 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-xl max-w-sm text-center">
                    ❌ {purchaseError}
                    <button onClick={() => setPurchaseError(null)} className="ml-3 text-red-300 hover:text-white">✕</button>
                </div>
            )}

            {pending && (
                <OmenXConfirmation
                    amount={pending.amount}
                    itemName={pending.itemName}
                    onConfirm={pending.onConfirm}
                    onCancel={pending.onCancel}
                    pageId="upgrades-page"
                />
            )}

            {respecModal && (
                <TalentRespecModal
                    charName={respecModal.charName}
                    tierLabel={respecModal.tier}
                    talentCount={respecModal.count}
                    goldCost={respecModal.goldCost}
                    omenxCost={respecModal.omenxCost}
                    canAffordGold={save.gold >= respecModal.goldCost}
                    canAffordOmenx={!omenxBlocked && (omenxBalance ?? 0) >= respecModal.omenxCost}
                    onPayGold={handleRespecPayGold}
                    onPayOmenx={handleRespecPayOmenx}
                    onCancel={() => setRespecModal(null)}
                    busy={purchasing}
                />
            )}
        </div>
        </OmenXGate>
    );
}