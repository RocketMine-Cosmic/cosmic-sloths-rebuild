import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, Rocket, Wallet, Compass, Swords, Trophy, Zap, Crown, Shield } from 'lucide-react';
import { SoundManager } from '../../game/SoundManager';
import { SaveManager } from '../../game/SaveManager';

// Persist `welcomeSeen` on the cloud PlayerSave so the tour follows the wallet across
// devices/browsers. SaveManager.load() reads the local cache of the cloud save, so
// no separate localStorage flag is needed.

const STEPS = [
    {
        icon: Rocket,
        accent: 'text-cyan-300',
        border: 'border-cyan-500/40',
        title: 'Welcome, Sloth',
        body: (
            <>
                <p><span className="text-cyan-300 font-bold">Cosmic Sloths</span> is a fast roguelike survival game. Pick a sloth, drop into an arena, and stack weapon upgrades to last as long as you can.</p>
                <p className="mt-2 text-slate-400">The top of the weekly leaderboard splits a real <span className="text-amber-300 font-bold">$OMENX</span> reward pool.</p>
            </>
        ),
    },
    {
        icon: Wallet,
        accent: 'text-amber-300',
        border: 'border-amber-500/40',
        title: 'Sign In & Connect Wallet',
        body: (
            <>
                <p>On the <span className="text-white font-bold">Main Menu</span>, tap the button at the bottom to <span className="text-cyan-300 font-bold">Sign In</span>, then <span className="text-purple-300 font-bold">Connect Wallet</span> to link your OMENX wallet.</p>
                <p className="mt-2 text-amber-200/90 bg-amber-950/40 border border-amber-700/40 rounded px-2 py-1.5 text-xs">🔒 Currently gated to <span className="font-bold">Early Adopters NFT</span> holders on Omen.</p>
                <p className="mt-2 text-slate-400 text-xs">No Omen account yet? Sign up free at <a href="https://app.omen.foundation?ref=D2EBE0BE67BAAE" target="_blank" rel="noopener noreferrer" className="text-cyan-300 font-bold underline hover:text-cyan-200">Omen Foundation</a>, then grab the Early Adopters NFT to unlock access.</p>
                <p className="mt-2 text-slate-400">Connecting saves your progress to your wallet and makes you eligible for weekly OMENX rewards.</p>
            </>
        ),
    },
    {
        icon: Compass,
        accent: 'text-fuchsia-300',
        border: 'border-fuchsia-500/40',
        title: 'Launch Your First Run',
        body: (
            <>
                <p>Swipe right (or use the <span className="text-fuchsia-300 font-bold">Warp</span> menu at the top) to open <span className="text-cyan-300 font-bold">Sloth Command</span>. Pick a sloth, sector, and difficulty — then hit <span className="text-cyan-300 font-bold">LAUNCH</span> for a normal run or <span className="text-fuchsia-300 font-bold">ENDLESS</span> for the high-score mode.</p>
                <p className="mt-2 text-slate-400">Move with WASD or the on-screen joystick. Weapons fire automatically — focus on dodging and grabbing XP gems.</p>
            </>
        ),
    },
    {
        icon: Zap,
        accent: 'text-purple-300',
        border: 'border-purple-500/40',
        title: 'OMENX In-Run Power',
        body: (
            <>
                <p>Spend small amounts of <span className="text-purple-300 font-bold">$OMENX</span> mid-run to swing the odds in your favour:</p>
                <ul className="mt-2 text-left text-xs text-slate-400 space-y-1 mx-auto max-w-[260px]">
                    <li>• <span className="text-white font-bold">Reroll</span> level-up choices — 2 OMENX</li>
                    <li>• <span className="text-white font-bold">Banish</span> bad upgrades — 2 / 4 / 6 OMENX (tiered)</li>
                    <li>• <span className="text-white font-bold">Emergency Revive</span> on death — 4 OMENX</li>
                    <li>• <span className="text-white font-bold">Squad Ultimate</span> clone backup — 5 or 10 OMENX</li>
                </ul>
            </>
        ),
    },
    {
        icon: Trophy,
        accent: 'text-amber-300',
        border: 'border-amber-500/40',
        title: 'Hall of Fame & Weekly Payouts',
        body: (
            <>
                <p>Every run earns gold you keep AND posts a score to the <span className="text-amber-300 font-bold">Hall of Fame</span>. Each week, the OMENX you and others spend in-game funds a <span className="text-amber-300 font-bold">community reward pool</span>.</p>
                <p className="mt-2 text-slate-400">When the week ends, the top scorers automatically receive a share of that pool — paid straight to your linked wallet. Seasonal leaderboards (every 4 weeks) pay out a bigger pool.</p>
            </>
        ),
    },
    {
        icon: Shield,
        accent: 'text-orange-300',
        border: 'border-orange-500/40',
        title: 'Squads, Wars & Champions Pool',
        body: (
            <>
                <p>Form a <span className="text-orange-300 font-bold">Sloth Squad</span> (up to 5 pilots) to share daily/weekly kill bounties and chat in-squad.</p>
                <p className="mt-2 text-slate-400">Each week your squad is auto-paired into a <span className="text-red-400 font-bold">Squad War</span> — the team with the most combined kills wins. Stack wins across the season to climb the standings.</p>
                <p className="mt-2 text-slate-400">The top 3 squads at season end split the <span className="text-yellow-300 font-bold">Champions Pool</span>, paid to every qualifying member.</p>
            </>
        ),
    },
    {
        icon: Crown,
        accent: 'text-emerald-300',
        border: 'border-emerald-500/40',
        title: 'Progress That Sticks',
        body: (
            <>
                <p>Spend gold in the <span className="text-fuchsia-300 font-bold">Cosmic Armory</span> on permanent stats, weapon upgrades and character talents. Tackle daily quests on the <span className="text-emerald-300 font-bold">Star Ops</span> board for bonus rewards.</p>
                <p className="mt-2 text-slate-400">Team up in the <span className="text-red-500 font-bold">Galactic Raid</span> against a community-wide boss for milestone gold.</p>
                <p className="mt-2 text-slate-400">Unlock new sloths via kill milestones or by owning the matching <span className="text-purple-300 font-bold">NFT</span>. Holding NFTs also grants permanent in-game perks.</p>
            </>
        ),
    },
];

export default function WelcomeModal() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        const checkSeen = () => {
            try {
                const save = SaveManager.load();
                return !!save?.welcomeSeen;
            } catch { return false; }
        };

        let t;
        if (!checkSeen()) {
            // Slight delay so it doesn't fight with the initial page load animation.
            t = setTimeout(() => setOpen(true), 400);
        }

        // Tracks an active manual replay so an incoming cloud save (which may still
        // have welcomeSeen=true until our cleared flag round-trips) doesn't auto-close
        // the modal we just intentionally re-opened.
        let isReplaying = false;

        // If cloud save loads after we already showed the modal and it has welcomeSeen=true,
        // close it (returning user on a new device whose local cache was empty).
        const onSaveUpdated = (e) => {
            if (isReplaying) return;
            if (e.detail?.welcomeSeen) setOpen(false);
        };
        // Allow other pages (e.g. Profile "Replay Tour") to re-open the modal
        // without needing PlayCarousel to remount.
        const onReplay = () => {
            isReplaying = true;
            setStep(0);
            setOpen(true);
        };
        window.addEventListener('saveUpdated', onSaveUpdated);
        window.addEventListener('replayWelcomeTour', onReplay);
        return () => {
            if (t) clearTimeout(t);
            window.removeEventListener('saveUpdated', onSaveUpdated);
            window.removeEventListener('replayWelcomeTour', onReplay);
        };
    }, []);

    const close = () => {
        SoundManager.playUIClick();
        try {
            const save = SaveManager.load();
            if (!save.welcomeSeen) {
                save.welcomeSeen = true;
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
                        {/* Close button */}
                        <button
                            onClick={close}
                            className="absolute top-3 right-3 z-10 p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                            aria-label="Skip welcome"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        {/* Icon header */}
                        <div className={`flex items-center justify-center pt-8 pb-4 bg-gradient-to-b from-white/5 to-transparent`}>
                            <div className={`w-16 h-16 rounded-2xl border-2 ${current.border} flex items-center justify-center bg-black/40`}>
                                <Icon className={`w-8 h-8 ${current.accent}`} />
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-6 pb-5">
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 text-center mb-1">
                                Step {step + 1} of {STEPS.length}
                            </div>
                            <h2 className={`text-2xl font-black uppercase tracking-wider text-center mb-3 ${current.accent}`}>
                                {current.title}
                            </h2>
                            <div className="text-sm text-slate-300 leading-relaxed text-center min-h-[100px]">
                                {current.body}
                            </div>
                        </div>

                        {/* Progress dots */}
                        <div className="flex items-center justify-center gap-1.5 pb-4">
                            {STEPS.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1.5 rounded-full transition-all ${i === step ? `w-6 ${current.accent.replace('text-', 'bg-')}` : 'w-1.5 bg-slate-700'}`}
                                />
                            ))}
                        </div>

                        {/* Footer */}
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
                                {step < STEPS.length - 1 ? <>Next <ChevronRight className="w-4 h-4" /></> : <>Let's Go <Rocket className="w-4 h-4" /></>}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}