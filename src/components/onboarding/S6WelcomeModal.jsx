import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, Sparkles, Target, Swords, Trophy, Zap, Crown, Flame, Crosshair } from 'lucide-react';
import { SoundManager } from '../../game/SoundManager';
import { SaveManager } from '../../game/SaveManager';
import { isS6OrLater } from '@/lib/seasonGate';

// Season 6 launch announcement modal — shown ONCE per player on/after the
// W20→W21 rollover (Mon May 18 2026 00:00 UTC). Explains the major changes
// so returning S5 players don't quit when their score "looks lower" or
// when their weapon won't evolve at level 1 like it used to.
//
// Persists `s6WelcomeSeen` on the cloud save (separate flag from the original
// `welcomeSeen` so first-time players still get the new-player tour first,
// then this one). S5 players see nothing — `isS6OrLater()` gates the open.

const STEPS = [
    {
        icon: Sparkles,
        accent: 'text-fuchsia-300',
        border: 'border-fuchsia-500/40',
        title: 'Welcome to Season 6',
        body: (
            <>
                <p>The sloths are back with a <span className="text-fuchsia-300 font-bold">major balance pass</span> built around skill, sector progression, and meaningful late-game upgrades.</p>
                <p className="mt-2 text-slate-400">Your gold, kills, NFT perks and unlocked sloths all carry over. Leaderboards, weekly stats and seasonal upgrades reset — fresh race for everyone.</p>
            </>
        ),
    },
    {
        icon: Trophy,
        accent: 'text-amber-300',
        border: 'border-amber-500/40',
        title: 'New Score Formula',
        body: (
            <>
                <p>Score now rewards <span className="text-cyan-300 font-bold">skill, not grind</span>. The formula is built from kills, level, sector reached, and victory — gold no longer affects the leaderboard.</p>
                <p className="mt-2 text-slate-400 text-xs">A clean Sector 10 victory now beats a long farm run. Endless mode is its own track via per-minute scoring.</p>
                <p className="mt-2 text-amber-200/90 bg-amber-950/40 border border-amber-700/40 rounded px-2 py-1.5 text-xs">⭐ A score around <span className="font-bold">~1M</span> is now legendary territory. Don't be confused by lower numbers — everyone's on the same scale.</p>
            </>
        ),
    },
    {
        icon: Swords,
        accent: 'text-cyan-300',
        border: 'border-cyan-500/40',
        title: 'Weapon Slot Cap & Evolutions',
        body: (
            <>
                <p>You can now carry at most <span className="text-cyan-300 font-bold">6 weapons</span> at once (industry standard for the genre). Above that, the level-up pool only offers upgrades to weapons you already own.</p>
                <p className="mt-2 text-slate-400">Evolutions now require the base weapon to reach <span className="text-orange-300 font-bold">level 8</span> before they can fire. The 🌟 EVOLVES badge tells you exactly when an evolution is ready.</p>
                <p className="mt-2 text-slate-400 text-xs">Synergies (2 weapons → 1) free up slots — they're now key to building flexible loadouts.</p>
            </>
        ),
    },
    {
        icon: Zap,
        accent: 'text-purple-300',
        border: 'border-purple-500/40',
        title: 'Rarer Weapons Hit Harder',
        body: (
            <>
                <p>Weapon rarity now actually matters:</p>
                <ul className="mt-2 text-left text-xs text-slate-400 space-y-1 mx-auto max-w-[260px]">
                    <li>• <span className="text-slate-300 font-bold">Common</span> — +1 level</li>
                    <li>• <span className="text-blue-300 font-bold">Rare</span> — +2 levels</li>
                    <li>• <span className="text-purple-300 font-bold">Epic</span> — +3 levels</li>
                    <li>• <span className="text-orange-300 font-bold">Legendary</span> — +5 levels</li>
                </ul>
                <p className="mt-2 text-slate-400 text-xs">A Legendary pick gets you halfway to weapon mastery in a single choice. Keep an eye out for them.</p>
            </>
        ),
    },
    {
        icon: Target,
        accent: 'text-emerald-300',
        border: 'border-emerald-500/40',
        title: 'Pool Bias — Pick Your Picks',
        body: (
            <>
                <p>On the <span className="text-emerald-300 font-bold">Loadouts</span> page, allocate points to bias your level-up choices toward the weapons or stats you want. Every permanent upgrade earns more points.</p>
                <p className="mt-2 text-slate-400">During a run, watch for the <span className="text-fuchsia-300 font-bold">🎯 POOL BIAS</span> badge in the level-up screen — it shows your active bias is working.</p>
                <p className="mt-2 text-emerald-200/90 bg-emerald-950/40 border border-emerald-700/40 rounded px-2 py-1.5 text-xs">🎁 <span className="font-bold">Free respec available</span> — use it on the Loadouts page if you want to redistribute your points.</p>
            </>
        ),
    },
    {
        icon: Flame,
        accent: 'text-orange-300',
        border: 'border-orange-500/40',
        title: 'New Gold Sinks',
        body: (
            <>
                <p>Three new ways to spend your gold pile, unlocked in S6:</p>
                <ul className="mt-2 text-left text-xs text-slate-400 space-y-2 mx-auto max-w-[280px]">
                    <li>🧪 <span className="text-purple-300 font-bold">Astral Lab</span> — gold-only RNG pulls for permanent stat buffs</li>
                    <li>💎 <span className="text-cyan-300 font-bold">Prestige Relics</span> — break the level-5 ceiling on relics you've maxed</li>
                    <li>🏛️ <span className="text-amber-300 font-bold">Squad Treasury</span> — donate to unlock weekly squad-wide buffs</li>
                </ul>
                <p className="mt-2 text-slate-400 text-xs">Endless mode now uses time-decay instead of hard caps — gold flows naturally without confusing "GOLD CAPPED" warnings.</p>
            </>
        ),
    },
    {
        icon: Crosshair,
        accent: 'text-red-300',
        border: 'border-red-500/40',
        title: 'Squad Meteor',
        body: (
            <>
                <p>Every squad now has its own <span className="text-red-300 font-bold">persistent meteor</span> to hunt together. Open the Squads page → Meteor tab and tap <span className="text-orange-300 font-bold">⚔ ATTACK METEOR</span> for a dedicated DPS run.</p>
                <p className="mt-2 text-slate-400 text-xs">Damage banks toward the next level. Destroy it as a squad → fresh, beefier meteor spawns. <span className="text-orange-300 font-bold">Levels never reset.</span></p>
                <p className="mt-2 text-red-200/90 bg-red-950/40 border border-red-700/40 rounded px-2 py-1.5 text-xs">🔥 Meteor level grants <span className="font-bold">squad-wide buffs</span> (+gold, +dmg, +AoE, +CDR) that apply to <span className="font-bold">every arena run</span> — not just meteor runs.</p>
                <p className="mt-2 text-slate-400 text-xs">Small daily attack quota per member — resets 00:00 UTC.</p>
            </>
        ),
    },
    {
        icon: Crown,
        accent: 'text-cyan-300',
        border: 'border-cyan-500/40',
        title: 'Good Luck, Sloth',
        body: (
            <>
                <p>The leaderboard is wide open. Sector progression is the headline scorer — clear Sector 10 to claim the top spot.</p>
                <p className="mt-2 text-slate-400">Weekly OMENX rewards continue. Squad Wars and the Champions Pool reset alongside the season.</p>
                <p className="mt-3 text-cyan-200 font-bold">May your weapons evolve and your synergies fuse. 🚀</p>
            </>
        ),
    },
];

export default function S6WelcomeModal() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        // Only fire on or after S6. S5 players see the original WelcomeModal only.
        if (!isS6OrLater()) return;

        const checkSeen = () => {
            try {
                const save = SaveManager.load();
                return !!save?.s6WelcomeSeen;
            } catch { return false; }
        };

        let t;
        if (!checkSeen()) {
            // Wait for the original WelcomeModal to clear (~3s) so brand-new
            // players don't get hit with two modals back-to-back.
            t = setTimeout(() => {
                const save = SaveManager.load();
                if (!save?.s6WelcomeSeen) setOpen(true);
            }, 3000);
        }

        let isReplaying = false;

        const onSaveUpdated = (e) => {
            if (isReplaying) return;
            if (e.detail?.s6WelcomeSeen) setOpen(false);
        };
        const onReplay = () => {
            isReplaying = true;
            setStep(0);
            setOpen(true);
        };
        window.addEventListener('saveUpdated', onSaveUpdated);
        window.addEventListener('replayS6Tour', onReplay);
        return () => {
            if (t) clearTimeout(t);
            window.removeEventListener('saveUpdated', onSaveUpdated);
            window.removeEventListener('replayS6Tour', onReplay);
        };
    }, []);

    const close = () => {
        SoundManager.playUIClick();
        try {
            const save = SaveManager.load();
            if (!save.s6WelcomeSeen) {
                save.s6WelcomeSeen = true;
                SaveManager.save(save);
            }
        } catch { /* ignore */ }
        setOpen(false);
    };

    const next = () => {
        SoundManager.playUIClick();
        if (step < STEPS.length - 1) setStep(s => s + 1);
        else close();
    };

    const prev = () => {
        SoundManager.playUIClick();
        if (step > 0) setStep(s => s - 1);
    };

    const current = STEPS[step];
    const Icon = current?.icon;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6"
                    onClick={close}
                >
                    <motion.div
                        initial={{ y: 30, opacity: 0, scale: 0.96 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 30, opacity: 0, scale: 0.96 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                        onClick={(e) => e.stopPropagation()}
                        className={`relative w-full max-w-md bg-[#0b0416]/95 border-2 ${current.border} rounded-2xl shadow-[0_0_50px_rgba(217,70,239,0.25)] overflow-hidden`}
                    >
                        {/* Top tag */}
                        <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-fuchsia-600 to-cyan-600 text-white text-[10px] font-black uppercase tracking-[0.3em] py-1 text-center">
                            Season 6 — Now Live
                        </div>

                        <button
                            onClick={close}
                            className="absolute top-7 right-3 z-10 p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                            aria-label="Skip"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className={`flex items-center justify-center pt-12 pb-4 bg-gradient-to-b from-white/5 to-transparent`}>
                            <div className={`w-16 h-16 rounded-2xl border-2 ${current.border} flex items-center justify-center bg-black/40`}>
                                <Icon className={`w-8 h-8 ${current.accent}`} />
                            </div>
                        </div>

                        <div className="px-6 pb-5">
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 text-center mb-1">
                                Step {step + 1} of {STEPS.length}
                            </div>
                            <h2 className={`text-2xl font-black uppercase tracking-wider text-center mb-3 ${current.accent}`}>
                                {current.title}
                            </h2>
                            <div className="text-sm text-slate-300 leading-relaxed text-center min-h-[140px]">
                                {current.body}
                            </div>
                        </div>

                        <div className="flex items-center justify-center gap-1.5 pb-4">
                            {STEPS.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1.5 rounded-full transition-all ${i === step ? `w-6 ${current.accent.replace('text-', 'bg-')}` : 'w-1.5 bg-slate-700'}`}
                                />
                            ))}
                        </div>

                        <div className="flex items-center justify-between px-4 pb-4 gap-2">
                            <button
                                onClick={prev}
                                disabled={step === 0}
                                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" /> Back
                            </button>
                            <button
                                onClick={close}
                                className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                Skip
                            </button>
                            <button
                                onClick={next}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-black uppercase tracking-wider bg-gradient-to-r from-fuchsia-600 to-cyan-600 hover:from-fuchsia-500 hover:to-cyan-500 text-white shadow-[0_0_20px_rgba(217,70,239,0.4)] transition-all`}
                            >
                                {step < STEPS.length - 1 ? <>Next <ChevronRight className="w-4 h-4" /></> : <>Let's Go <Sparkles className="w-4 h-4" /></>}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}