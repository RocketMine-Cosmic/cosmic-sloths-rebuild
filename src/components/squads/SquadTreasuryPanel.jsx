import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { SaveManager } from '../../game/SaveManager';
import { SoundManager } from '../../game/SoundManager';
import { useToast } from '@/components/ui/use-toast';
import { Coins, Vault, Sparkles, Lock, ShieldCheck, Award } from 'lucide-react';
import { isS6OrLater } from '@/lib/seasonGate';

// S6 Phase 3c — Squad Treasury panel. Members donate gold to a shared pool.
// Leader/officers spend the pool to activate weekly buffs. Hard-gated to S6+
// via seasonGate. Buffs apply to NEXT ISO week.
const TREASURY_TIERS = [
    { key: 'bronze',   cost: 25_000,    label: 'Bronze',   color: 'from-orange-700 to-amber-800', border: 'border-orange-600/60', text: 'text-orange-300', desc: '+5% squad XP from kills' },
    { key: 'silver',   cost: 100_000,   label: 'Silver',   color: 'from-slate-500 to-slate-400', border: 'border-slate-400/60', text: 'text-slate-200', desc: '+10% XP, +5% gold drops' },
    { key: 'gold',     cost: 500_000,   label: 'Gold',     color: 'from-yellow-600 to-amber-500', border: 'border-yellow-500/60', text: 'text-yellow-300', desc: '+20% XP, +10% gold, +3% boss dmg' },
    { key: 'platinum', cost: 2_000_000, label: 'Platinum', color: 'from-cyan-400 to-fuchsia-400', border: 'border-cyan-400/60', text: 'text-cyan-200', desc: '+30% XP, +15% gold, +8% boss dmg' },
];

const QUICK_AMOUNTS = [1000, 5000, 25_000, 100_000];

export default function SquadTreasuryPanel({ squad, myMemberRecord, onUpdate }) {
    const { toast } = useToast();
    const isS6 = isS6OrLater();
    const isLeader = myMemberRecord?.role === 'leader';
    const isOfficer = myMemberRecord?.role === 'officer';
    const canActivate = isLeader || isOfficer;

    const [treasury, setTreasury] = useState({
        treasury_gold: squad?.treasury_gold || 0,
        treasury_total_donated: squad?.treasury_total_donated || 0,
        // Buff currently in effect THIS week (display only — doesn't block new purchases).
        active_buff_tier: '',
        active_buff_week_id: '',
        // Buff pre-purchased for NEXT week (blocks new buys, allows upgrades).
        pending_buff_tier: '',
        pending_buff_week_id: '',
        current_week_id: '',
    });
    const [donateAmount, setDonateAmount] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [myGold, setMyGold] = useState(SaveManager.load()?.gold || 0);
    const [confirmTier, setConfirmTier] = useState(null); // tier key pending confirmation

    // Pull authoritative treasury state on mount + when squad changes.
    useEffect(() => {
        if (!isS6 || !squad?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await base44.functions.invoke('squadActions', { action: 'getTreasury', squadId: squad.id });
                if (!cancelled && res.data && !res.data.error) setTreasury(res.data);
            } catch {}
        })();
        return () => { cancelled = true; };
    }, [isS6, squad?.id]);

    // Refresh local gold whenever the save changes.
    useEffect(() => {
        const onSave = (e) => setMyGold(e.detail?.gold ?? SaveManager.load()?.gold ?? 0);
        window.addEventListener('saveUpdated', onSave);
        return () => window.removeEventListener('saveUpdated', onSave);
    }, []);

    const refresh = async () => {
        try {
            const res = await base44.functions.invoke('squadActions', { action: 'getTreasury', squadId: squad.id });
            if (res.data && !res.data.error) setTreasury(res.data);
        } catch {}
        if (onUpdate) onUpdate();
    };

    const handleDonate = async (rawAmount) => {
        const amount = Math.max(1, Math.floor(Number(rawAmount) || 0));
        if (!amount) return;
        if (amount > myGold) {
            toast({ title: 'Not enough gold', description: `You have ${myGold.toLocaleString()}, tried to donate ${amount.toLocaleString()}.` });
            return;
        }
        SoundManager.playUIClick();
        setBusy(true);
        setError(null);
        try {
            const res = await base44.functions.invoke('squadActions', {
                action: 'donateTreasury', squadId: squad.id, amount,
            });
            if (!res.data?.success) {
                setError(res.data?.error || 'Donation failed');
                return;
            }
            // Apply server-authoritative gold to local save.
            if (res.data.saveData?.gold !== undefined) {
                const s = SaveManager.load();
                s.gold = res.data.saveData.gold;
                SaveManager.save(s);
                setMyGold(s.gold);
            }
            setTreasury(t => ({
                ...t,
                treasury_gold: res.data.treasury_gold,
                treasury_total_donated: res.data.treasury_total_donated,
            }));
            setDonateAmount('');
            toast({ title: 'Donated', description: `+${amount.toLocaleString()} gold to treasury` });
        } catch (e) {
            setError(e?.response?.data?.error || e.message || 'Donation failed');
        } finally {
            setBusy(false);
        }
    };

    const handleActivate = async (tierKey) => {
        if (!canActivate || busy) return;
        SoundManager.playUIClick();
        setBusy(true);
        setError(null);
        try {
            const res = await base44.functions.invoke('squadActions', {
                action: 'activateBuff', squadId: squad.id, tier: tierKey,
            });
            if (!res.data?.success) {
                setError(res.data?.error || 'Activation failed');
                return;
            }
            // Server returns the tier + the week it now applies to. That's
            // always a FUTURE week (next-week fresh activation or the existing
            // pending-buff's week on upgrade), so update the pending fields.
            setTreasury(t => ({
                ...t,
                treasury_gold: res.data.treasury_gold,
                pending_buff_tier: res.data.active_buff_tier,
                pending_buff_week_id: res.data.active_buff_week_id,
            }));
            const tier = TREASURY_TIERS.find(t => t.key === tierKey);
            toast({
                title: res.data.upgraded ? `Upgraded to ${tier?.label}!` : `${tier?.label} buff activated!`,
                description: `Applies to week ${res.data.active_buff_week_id}`,
            });
            setConfirmTier(null);
        } catch (e) {
            setError(e?.response?.data?.error || e.message || 'Activation failed');
        } finally {
            setBusy(false);
        }
    };

    if (!isS6) {
        return (
            <div className="p-4 md:p-6">
                <div className="bg-gradient-to-br from-slate-900/80 to-amber-950/30 border-2 border-amber-700/40 rounded-xl p-5 md:p-6 text-center">
                    <Lock className="w-10 h-10 mx-auto text-amber-500/70 mb-3" />
                    <h3 className="text-amber-300 font-black text-lg uppercase tracking-widest mb-1">Squad Treasury</h3>
                    <p className="text-slate-400 text-sm mb-3">Unlocks <span className="text-amber-300 font-bold">Mon May 18 · 00:00 UTC</span></p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                        Squad members donate gold to a shared pool. Spend it for weekly squad-wide buffs — XP, gold drops, and boss damage.
                    </p>
                </div>
            </div>
        );
    }

    // Buff currently in effect this week (display badge only).
    const activeTier = treasury.active_buff_tier
        ? TREASURY_TIERS.find(t => t.key === treasury.active_buff_tier)
        : null;
    // Buff pre-purchased for next week (drives the tier-card lock / upgrade logic).
    const pendingTier = treasury.pending_buff_tier
        ? TREASURY_TIERS.find(t => t.key === treasury.pending_buff_tier)
        : null;

    return (
        <div className="p-3 md:p-4 space-y-4">
            {/* Header card with treasury balance */}
            <div className="bg-gradient-to-br from-amber-950/60 via-slate-900/80 to-yellow-950/40 rounded-xl border-2 border-amber-500/40 p-3 md:p-4 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                        <Vault className="w-5 h-5 md:w-6 md:h-6 text-amber-300" />
                        <h3 className="font-black text-sm md:text-base uppercase tracking-widest text-amber-200">Squad Treasury</h3>
                    </div>
                    <span className="text-[9px] bg-amber-500/30 text-amber-100 border border-amber-500/50 px-1.5 py-0.5 rounded font-bold">S6 NEW</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/30 rounded-lg p-2 border border-amber-700/40">
                        <div className="text-[9px] uppercase tracking-widest text-amber-400/80 font-bold">Pool</div>
                        <div className="text-base md:text-xl font-black text-amber-200 flex items-center gap-1.5 truncate">
                            <Coins className="w-4 h-4 text-yellow-400 fill-yellow-500 shrink-0" />
                            <span className="truncate">{(treasury.treasury_gold || 0).toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="bg-black/30 rounded-lg p-2 border border-amber-700/40">
                        <div className="text-[9px] uppercase tracking-widest text-amber-400/80 font-bold">Total Donated</div>
                        <div className="text-base md:text-xl font-black text-amber-200/90 truncate">
                            {(treasury.treasury_total_donated || 0).toLocaleString()}
                        </div>
                    </div>
                </div>

                {activeTier && (
                    <div className={`mt-3 p-2 rounded-lg border-2 ${activeTier.border} bg-gradient-to-r ${activeTier.color} bg-opacity-20 flex items-start gap-2`}>
                        <Sparkles className="w-4 h-4 shrink-0 text-white mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] uppercase tracking-widest font-black text-white/90">Active buff this week</div>
                            <div className="font-black text-sm text-white">{activeTier.label}</div>
                            <div className="text-[11px] text-white/80 leading-snug">{activeTier.desc}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Donate */}
            <div className="bg-[#0b0416]/70 backdrop-blur-xl rounded-xl border border-amber-700/40 p-3 md:p-4">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <h4 className="font-black text-xs md:text-sm uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                        <Coins className="w-3.5 h-3.5" /> Donate
                    </h4>
                    <span className="text-[10px] text-slate-400">Your gold: <span className="text-yellow-300 font-bold">{myGold.toLocaleString()}</span></span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
                    {QUICK_AMOUNTS.map(amt => (
                        <button
                            key={amt}
                            onClick={() => handleDonate(amt)}
                            disabled={busy || amt > myGold}
                            className={`py-1.5 rounded font-bold text-[11px] flex items-center justify-center gap-1 transition-colors ${
                                amt > myGold || busy
                                    ? 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'
                                    : 'bg-amber-700 hover:bg-amber-600 text-white border border-amber-500/50'
                            }`}
                        >
                            <Coins className="w-3 h-3 fill-current" />
                            {amt >= 1000 ? `${amt / 1000}k` : amt}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2">
                    <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={myGold}
                        value={donateAmount}
                        onChange={e => setDonateAmount(e.target.value)}
                        placeholder="Custom amount…"
                        className="flex-1 bg-slate-900 border border-slate-700 focus:border-amber-500 outline-none rounded px-3 py-2 text-white text-sm"
                    />
                    <button
                        onClick={() => handleDonate(donateAmount)}
                        disabled={busy || !donateAmount || Number(donateAmount) > myGold || Number(donateAmount) < 1}
                        className={`px-4 py-2 rounded font-black text-xs uppercase tracking-widest transition-colors ${
                            busy || !donateAmount || Number(donateAmount) > myGold || Number(donateAmount) < 1
                                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                        }`}
                    >
                        Donate
                    </button>
                </div>
            </div>

            {/* Buffs */}
            <div className="bg-[#0b0416]/70 backdrop-blur-xl rounded-xl border border-amber-700/40 p-3 md:p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div>
                        <h4 className="font-black text-xs md:text-sm uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                            <Award className="w-3.5 h-3.5" /> Squad Wars Buff (Next Week)
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-1">Active during week {treasury.current_week_id ? incrementWeek(treasury.current_week_id) : 'next'} squad wars only</p>
                    </div>
                </div>

                {!canActivate && (
                    <p className="text-[11px] text-slate-500 mb-2 italic">Only the leader or officers can activate buffs.</p>
                )}
                <div className="text-[11px] text-amber-200/90 bg-amber-950/30 border border-amber-700/40 rounded p-2 mb-3 leading-snug">
                    ℹ️ <span className="font-bold">Only one buff is active at a time</span> — the highest tier you've bought. You can <span className="font-bold text-cyan-300">upgrade</span> later by buying the next tier and only paying the <em>difference</em> in cost (not the full price).
                </div>
                {canActivate && !!pendingTier && (
                    <p className="text-[11px] text-cyan-300/90 mb-2">💡 Tap a higher tier to upgrade — you'll only be charged the difference.</p>
                )}
                {!pendingTier && (
                    <p className="text-[11px] text-slate-400 mb-2">No buff bought yet for next week's wars. Pick a tier below ↓</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TREASURY_TIERS.map(tier => {
                        // Tier-card state is driven by the PENDING (next-week) buff
                        // only — not the active (this-week) buff. Briantjeuh bug
                        // 2026-06-15: previously this used active_buff_tier so the
                        // tier card stayed locked all week even after the buff
                        // started running, blocking next-week purchases.
                        const isActive = treasury.pending_buff_tier === tier.key;
                        const activeTierObj = pendingTier;
                        const isUpgrade = !!activeTierObj && !isActive && tier.cost > activeTierObj.cost;
                        const isDowngrade = !!activeTierObj && !isActive && tier.cost <= activeTierObj.cost;
                        const chargeCost = isUpgrade ? tier.cost - activeTierObj.cost : tier.cost;
                        const enough = (treasury.treasury_gold || 0) >= chargeCost;
                        const lockedByDowngrade = isDowngrade; // can't downgrade
                        return (
                            <div key={tier.key} className={`relative p-2.5 rounded-lg border-2 ${isActive ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)] ring-2 ring-emerald-400/30' : tier.border} bg-gradient-to-br ${tier.color} bg-opacity-10 flex flex-col`}>
                                {isActive && (
                                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-emerald-300 shadow-lg whitespace-nowrap flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3" /> Active Next Week
                                    </div>
                                )}
                                <div className="flex items-center justify-between mb-1 mt-1">
                                    <span className={`font-black text-xs uppercase tracking-widest ${isActive ? 'text-emerald-200' : tier.text}`}>{tier.label}</span>
                                </div>
                                <p className="text-[10px] text-white/80 leading-snug mb-2 flex-1">{tier.desc}</p>
                                <button
                                    onClick={() => setConfirmTier(tier.key)}
                                    disabled={!canActivate || busy || !enough || lockedByDowngrade || isActive}
                                    className={`w-full py-1.5 rounded font-bold text-[11px] flex items-center justify-center gap-1 transition-colors ${
                                        isActive
                                            ? 'bg-emerald-700 text-emerald-100 cursor-default'
                                            : !canActivate || !enough || lockedByDowngrade
                                                ? 'bg-black/40 text-white/40 border border-white/10 cursor-not-allowed'
                                                : isUpgrade
                                                    ? 'bg-cyan-600/40 hover:bg-cyan-500/60 text-white border border-cyan-400/50'
                                                    : 'bg-white/15 hover:bg-white/25 text-white border border-white/30'
                                    }`}
                                >
                                    {isActive ? '✓ ACTIVE' : lockedByDowngrade ? 'Lower tier' : isUpgrade ? (
                                        <>
                                            <Coins className="w-3 h-3 fill-current" />
                                            +{chargeCost.toLocaleString()} (upgrade)
                                        </>
                                    ) : (
                                        <>
                                            <Coins className="w-3 h-3 fill-current" />
                                            {tier.cost.toLocaleString()}
                                        </>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {error && (
                <div className="text-xs text-red-300 bg-red-950/40 border border-red-700/50 px-3 py-2 rounded">
                    ❌ {error}
                </div>
            )}

            {/* Confirmation modal — prevents accidental activations (Texxy bug 2026-05-19) */}
            {confirmTier && (() => {
                const tier = TREASURY_TIERS.find(t => t.key === confirmTier);
                // Confirmation flow keys off PENDING (next-week) buff, matching
                // the tier-card buy logic above.
                const activeTierObj = pendingTier;
                const isUpgrade = !!activeTierObj && tier.cost > activeTierObj.cost;
                const chargeCost = isUpgrade ? tier.cost - activeTierObj.cost : tier.cost;
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !busy && setConfirmTier(null)}>
                        <div className={`bg-gradient-to-br from-slate-900 to-slate-950 border-2 ${tier.border} rounded-xl p-5 max-w-sm w-full shadow-2xl`} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles className={`w-5 h-5 ${tier.text}`} />
                                <h3 className={`font-black text-base uppercase tracking-widest ${tier.text}`}>
                                    {isUpgrade ? `Upgrade to ${tier.label}?` : `Activate ${tier.label}?`}
                                </h3>
                            </div>
                            <p className="text-sm text-slate-300 leading-snug mb-2">{tier.desc}</p>
                            <div className="bg-black/40 rounded p-2 mb-4 text-xs text-slate-300 space-y-1">
                                {isUpgrade && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Current buff:</span>
                                        <span className="font-bold">{activeTierObj.label}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-slate-400">{isUpgrade ? 'Upgrade cost:' : 'Cost:'}</span>
                                    <span className="font-bold text-yellow-300 flex items-center gap-1">
                                        <Coins className="w-3 h-3 fill-current" />
                                        {chargeCost.toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Treasury after:</span>
                                    <span className="font-bold text-amber-300">
                                        {((treasury.treasury_gold || 0) - chargeCost).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-500 italic mb-4">
                                This buff is <span className="text-amber-300 font-bold">active only during next week's squad wars</span> (week <span className="text-slate-300 font-bold">{activeTierObj ? treasury.pending_buff_week_id : (treasury.current_week_id ? incrementWeek(treasury.current_week_id) : 'next')}</span>).
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setConfirmTier(null)}
                                    disabled={busy}
                                    className="flex-1 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleActivate(confirmTier)}
                                    disabled={busy}
                                    className={`flex-1 py-2 rounded font-black text-xs uppercase tracking-widest text-white transition-colors ${
                                        isUpgrade
                                            ? 'bg-cyan-600 hover:bg-cyan-500'
                                            : 'bg-amber-600 hover:bg-amber-500'
                                    } disabled:opacity-50`}
                                >
                                    {busy ? '…' : isUpgrade ? 'Upgrade' : 'Activate'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

// Tiny helper — show "next week id" in the header tagline. Just for display.
function incrementWeek(weekId) {
    const m = weekId.match(/^(\d{4})-W(\d{2})$/);
    if (!m) return weekId;
    const year = parseInt(m[1], 10);
    const wk = parseInt(m[2], 10);
    if (wk >= 52) return `${year + 1}-W01`;
    return `${year}-W${String(wk + 1).padStart(2, '0')}`;
}