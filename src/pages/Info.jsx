import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Gamepad2, Zap, Star, Target, Trophy, Flame, Users, Gift, Shield, Crown, MessageSquare, Skull, Coins, Puzzle, Gem, Swords, Award } from 'lucide-react';
import { SoundManager } from '../game/SoundManager';
import SpaceBackground from '../components/game/SpaceBackground';

const TABS = [
    { id: 'basics',     label: 'Basics',       icon: Gamepad2 },
    { id: 'progression',label: 'Progression',  icon: Star },
    { id: 'missions',   label: 'Missions',     icon: Target },
    { id: 'compete',    label: 'Compete',      icon: Trophy },
    { id: 'squads',     label: 'Squads',       icon: Users },
    { id: 'wars',       label: 'Squad Wars',   icon: Swords },
    { id: 'nft',        label: 'NFT Unlocks',  icon: Gem },
    { id: 'combat',     label: 'Combat',       icon: Zap },
    { id: 'raid',       label: 'Global Raid',  icon: Skull },
    { id: 'vip',        label: 'VIP',          icon: Crown },
];

function SectionCard({ title, children, color = 'cyan' }) {
    const borderColors = { 
        cyan: 'border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.15)]', 
        purple: 'border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]', 
        amber: 'border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]', 
        green: 'border-green-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]', 
        rose: 'border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]', 
        orange: 'border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.15)]' 
    };
    const titleColors = { cyan: 'text-cyan-400', purple: 'text-purple-400', amber: 'text-amber-400', green: 'text-green-400', rose: 'text-rose-400', orange: 'text-orange-400' };
    return (
        <div className={`bg-[#0b0416]/50 backdrop-blur-xl border ${borderColors[color]} rounded-xl p-4 md:p-5`}>
            <h3 className={`font-bold text-base md:text-lg mb-3 ${titleColors[color]}`}>{title}</h3>
            {children}
        </div>
    );
}

function StatBadge({ label, desc, color }) {
    const colors = {
        red: 'bg-red-950/50 border-red-800/50 text-red-400',
        blue: 'bg-blue-950/50 border-blue-800/50 text-blue-400',
        slate: 'bg-slate-700/50 border-slate-600/50 text-slate-300',
        yellow: 'bg-yellow-950/50 border-yellow-800/50 text-yellow-400',
        purple: 'bg-purple-950/50 border-purple-800/50 text-purple-400',
        green: 'bg-green-950/50 border-green-800/50 text-green-400',
        pink: 'bg-pink-950/50 border-pink-800/50 text-pink-400',
        amber: 'bg-amber-950/50 border-amber-800/50 text-amber-400',
    };
    return (
        <div className={`border rounded-xl p-4 flex flex-col justify-center ${colors[color]}`}>
            <div className="font-bold text-sm md:text-base mb-1.5">{label}</div>
            <div className="text-xs md:text-sm text-slate-400/90 leading-relaxed">{desc}</div>
        </div>
    );
}

function PickupCard({ icon, label, color, desc }) {
    return (
        <div className="flex items-start gap-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <span className="text-3xl shrink-0 mt-0.5">{icon}</span>
            <div>
                <div className={`font-bold text-sm md:text-base mb-1.5 ${color}`}>{label}</div>
                <div className="text-xs md:text-sm text-slate-400 leading-relaxed">{desc}</div>
            </div>
        </div>
    );
}

const TABS_CONTENT = {
    basics: (
        <div className="space-y-4">
            <SectionCard title="🎮 Controls & Gamepad" color="cyan">
                <p className="text-sm text-slate-300 leading-relaxed mb-3">
                    Move with <strong className="text-white">WASD</strong> or <strong className="text-white">Arrow Keys</strong> on desktop, or the <strong className="text-white">Virtual Joystick</strong> on mobile. Your weapons fire <strong className="text-cyan-400">automatically</strong> at the nearest enemies.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
                    <div className="bg-slate-900/60 rounded-lg p-2 text-center"><kbd className="text-cyan-300 font-bold">W A S D</kbd><div className="text-slate-400 mt-1">Move</div></div>
                    <div className="bg-slate-900/60 rounded-lg p-2 text-center"><kbd className="text-cyan-300 font-bold">ESC / P</kbd><div className="text-slate-400 mt-1">Pause</div></div>
                    <div className="bg-slate-900/60 rounded-lg p-2 text-center"><kbd className="text-purple-400 font-bold">Left Stick</kbd><div className="text-slate-400 mt-1">Move / Steer</div></div>
                    <div className="bg-slate-900/60 rounded-lg p-2 text-center"><kbd className="text-purple-400 font-bold">Right Stick</kbd><div className="text-slate-400 mt-1">Scroll Menus</div></div>
                </div>
                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/50 text-xs text-slate-400 mb-3">
                    <strong className="text-white">Full Gamepad Support:</strong> Connect an Xbox, PlayStation, or generic controller to play from the couch! Use the <strong className="text-fuchsia-400">Virtual Cursor</strong> to navigate the Hub and menus seamlessly, and the <strong className="text-cyan-400">Snap-to-Grid</strong> system for quick selections during gameplay.
                </div>
                <div className="bg-slate-900/40 rounded-lg p-3 border border-fuchsia-700/50 text-xs text-slate-400">
                    <strong className="text-white">Squad Ultimates & Live Score:</strong> Track your <strong className="text-cyan-400">Live Score</strong> right under the survival timer. If things get too intense, summon a clone from your unlocked roster via the floating buttons (bottom right): <strong className="text-purple-300">ULT LITE</strong> (5 OMENX, capped power) or <strong className="text-fuchsia-400">ULT FULL</strong> (10 OMENX, scales with your full upgrades).
                </div>
            </SectionCard>

            <SectionCard title="🎯 Objective" color="green">
                <p className="text-sm text-slate-300 leading-relaxed">
                    Survive the full time limit of each sector to <strong className="text-green-400">win</strong>. As time progresses, enemies get stronger and more numerous. An optional <strong className="text-purple-400">Endless Void</strong> mode scales infinitely with boss fights every 3 minutes.
                </p>
                <div className="mt-3 bg-slate-900/40 rounded-lg p-3 border border-purple-700/50 text-xs text-slate-400">
                    <strong className="text-purple-300">Endless Void rule:</strong> Endless is a score & mastery mode — regular enemies don't drop Gold. S6 removed all endless caps, so <strong className="text-white">every Gold and kill you earn is credited in full</strong> (no per-run ceiling). Endless runs are still <strong className="text-white">excluded from OMENX leaderboard payouts</strong> — play <strong className="text-white">Sectors</strong> for the weekly/seasonal boards.
                </div>
            </SectionCard>

            <SectionCard title="📊 Character Stats" color="cyan">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                    <StatBadge label="❤️ HP & Regen" desc="Health pool and passive healing per second" color="red" />
                    <StatBadge label="👟 Speed" desc="Movement speed multiplier" color="blue" />
                    <StatBadge label="🛡️ Armor" desc="Flat reduction to incoming damage" color="slate" />
                    <StatBadge label="⚡ Damage" desc="Global multiplier for all weapons" color="yellow" />
                    <StatBadge label="⏱️ Cooldown" desc="Time between weapon attacks (lower = faster)" color="purple" />
                    <StatBadge label="💥 Area" desc="Size of all attacks and AoE zones" color="green" />
                    <StatBadge label="🧲 Magnet" desc="Range for auto-collecting XP and Gold" color="pink" />
                    <StatBadge label="🍀 Luck" desc="Boosts Gold drop rate and crit chance" color="amber" />
                </div>
            </SectionCard>

            <SectionCard title="💎 In-Run Pickups" color="purple">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <PickupCard icon={<Gem className="w-8 h-8 fill-emerald-400 text-emerald-400" />} label="XP Gems" color="text-emerald-400" desc="Dropped by every enemy. The icon tells you the value at a glance: shard (1-4), crystal (5-19), cluster (20-99), or glowing core (100+)." />
                    <PickupCard icon={<Coins className="w-8 h-8 fill-yellow-500 text-yellow-500" />} label="Gold Drops" color="text-yellow-400" desc="Random enemy drops. The icon scales with value: single coin (1-9), coin stack (10-49), money bag (50-199), treasure chest (200-999), or pile of gold (1000+)." />
                    <PickupCard icon={<Puzzle className="w-8 h-8 fill-fuchsia-400 text-fuchsia-400" />} label="Relic Fragments" color="text-fuchsia-400" desc="Dropped by Bosses. Craft and upgrade Ancient Relics in the Sloth Lounge." />
                    <PickupCard icon="☢️" label="Nuke" color="text-red-400" desc="Instantly destroys all non-boss enemies on screen." />
                    <PickupCard icon="🧲" label="Magnet Surge" color="text-blue-400" desc="Instantly pulls all nearby XP and Gold to you." />
                    <PickupCard icon="🛡️" label="Shield Overcharge" color="text-cyan-400" desc="10 seconds of full invincibility." />
                </div>
            </SectionCard>
        </div>
    ),

    progression: (
        <div className="space-y-4 md:space-y-6">
            <SectionCard title="🏠 Sloth Lounge (Meta Progression)" color="cyan">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">Between runs, visit the Sloth Lounge to spend your Gold and OMENX on persistent upgrades, or purchase a 60-minute <strong className="text-emerald-400">+50% XP Session Buff</strong> for 10 OMENX.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <div className="bg-slate-900/50 rounded-xl p-4 md:p-5 border border-slate-700 flex flex-col justify-center">
                        <div className="font-bold text-white text-sm md:text-base mb-1.5 flex items-center gap-2">👤 Characters</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed">Unlock new sloths by reaching kill milestones, or instantly unlock by owning the character's NFT. Each character has unique stats, abilities, and exclusive Talent Trees.</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-4 md:p-5 border border-slate-700 flex flex-col justify-center">
                        <div className="font-bold text-white text-sm md:text-base mb-1.5 flex items-center gap-2">⬆️ Stat Upgrades</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed">3 tiers: Permanent (forever), Weekly (resets weekly), Seasonal (resets every 4 weeks). Higher tiers = stronger bonuses.</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-4 md:p-5 border border-slate-700 flex flex-col justify-center">
                        <div className="font-bold text-white text-sm md:text-base mb-1.5 flex items-center gap-2">🔫 Armory</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed">Upgrade individual weapons across <strong className="text-white">three thematic stats</strong> tailored to that weapon (e.g. Shield Bubble's <em>Barrier Strength / Bubble Size / Recharge Rate</em>, or Hellfire's <em>Inferno Heat / Pool Size / Drop Rate</em>). Max all 3 to Master a weapon and unlock its ultimate form!</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-4 md:p-5 border border-slate-700 flex flex-col justify-center">
                        <div className="font-bold text-white text-sm md:text-base mb-1.5 flex items-center gap-2">🌳 Talent Trees</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed">Each character has a unique skill tree with branching paths. Respec anytime for a Gold refund.</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-4 md:p-5 border border-slate-700 flex flex-col justify-center">
                        <div className="font-bold text-white text-sm md:text-base mb-1.5 flex items-center gap-2">✨ Cosmetics</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed">Buy flashy trails, kill effects, and character skins. Preview before you buy!</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-4 md:p-5 border border-purple-700/50 flex flex-col justify-center shadow-[0_0_15px_rgba(168,85,247,0.1)]">
                        <div className="font-bold text-purple-400 text-sm md:text-base mb-1.5 flex items-center gap-2">💎 Ancient Relics</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed">Equip Relics for global stat boosts. Use <strong className="text-fuchsia-300 inline-flex items-center gap-1">Relic Fragments <Puzzle className="w-3 h-3 fill-fuchsia-300 text-fuchsia-300" /></strong> to upgrade them to Level 5!</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-4 md:p-5 border border-yellow-700/50 md:col-span-2 flex flex-col justify-center shadow-[0_0_15px_rgba(234,179,8,0.1)]">
                        <div className="font-bold text-yellow-400 text-sm md:text-base mb-2 flex items-center gap-2">🔨 The Forge</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed">Convert excess Gold into <strong className="text-yellow-300 inline-flex items-center gap-1">Star Fragments <Star className="w-3 h-3 fill-yellow-300 text-yellow-300" /></strong> (10,000 Gold = 1 <Star className="w-3 h-3 fill-yellow-300 text-yellow-300 inline" />, up to 30/day). Use fragments to permanently enhance weapons beyond their normal cap, or unlock powerful passive augments for each character. Forge upgrades <strong className="text-white">never reset</strong>.</p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="🔥 Weapon Synergies" color="rose">
                <p className="text-sm text-slate-300 leading-relaxed mb-2">
                    If you acquire two specific weapons during a single run, they automatically combine into a powerful <strong className="text-rose-400">Synergy Weapon</strong>!
                </p>
                <div className="bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400 italic border border-slate-700/50">
                    💡 Hint: Try combining <strong className="text-white">Zero-G Napalm + Shield Bubble</strong>, or <strong className="text-white">Cosmic Nap Beam + Nova Pulse</strong>...
                </div>
            </SectionCard>

            <SectionCard title="✨ Weapon Evolutions" color="orange">
                <p className="text-sm text-slate-300 leading-relaxed mb-2">
                    Pair a base weapon with the right <strong className="text-emerald-400">passive upgrade</strong> in a single run to evolve it into a devastating ultimate form — even more powerful than synergies.
                </p>
                <div className="bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400 italic border border-slate-700/50">
                    💡 Hint: Try <strong className="text-white">Cosmic Nap Beam + Spatial Expander</strong>, or <strong className="text-white">Nova Pulse + Quantum Accelerator</strong>... Track every discovered evolution in the <strong className="text-orange-300">Codex</strong>.
                </div>
            </SectionCard>

            <SectionCard title="📖 Bestiary & Synergy Codex" color="purple">
                <div className="space-y-3">
                    <div className="bg-slate-900/60 rounded-xl p-3 border border-purple-800/40">
                        <div className="font-bold text-purple-300 text-sm mb-1">👾 The Bestiary</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed">Every enemy you encounter is logged here. View lore and stats! Kill enough of a specific enemy to achieve <strong className="text-fuchsia-400">Mastery</strong> — granting a permanent <strong className="text-white">+2% to +10% damage bonus</strong> against that enemy type forever.</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-3 border border-pink-800/40">
                        <div className="font-bold text-pink-300 text-sm mb-1">🔥 The Codex</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed">Tracks every discovered <strong className="text-white">Synergy</strong>, <strong className="text-orange-300">Evolution</strong>, and <strong className="text-amber-300">weapon Mastery</strong>. Finding the right combinations is crucial to dominating higher difficulties and surviving Endless Mode.</p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="🏆 Achievements" color="amber">
                <p className="text-sm text-slate-300 leading-relaxed mb-2">
                    Complete hundreds of challenges to earn <strong className="text-amber-400">Achievement Points</strong>.
                </p>
                <div className="text-xs text-slate-400 bg-slate-900/50 rounded-lg p-2 border border-slate-700">
                    Track your total completion progress for <strong className="text-white">Survival, Combat, Wealth, and Progression</strong> milestones from the Main Menu.
                </div>
            </SectionCard>

            <SectionCard title="🏅 Character Progression" color="amber">
                <div className="space-y-3">
                    <div>
                        <h4 className="text-sm font-bold text-amber-400 mb-2">🔓 Unlocking Characters</h4>
                        <p className="text-xs text-slate-400 leading-relaxed"><strong className="text-amber-300">NFT Holders:</strong> Instantly unlock the character when you own its NFT, plus earn +5% to +15% Gold & Relic Fragments per run based on rarity. <strong className="text-amber-300">Non-NFT Players:</strong> Unlock sloths by reaching cumulative kill milestones (2k, 5k, 10k, 20k kills).</p>
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-amber-400 mb-2">📊 Character Mastery</h4>
                        <p className="text-xs text-slate-400 leading-relaxed mb-2">Playing a character repeatedly builds their <strong className="text-amber-400">Mastery</strong>. Defeat enemies with a specific character to rank them through <strong className="text-white">7 tiers</strong> — Cadet → Star Runner (2k) → Void Reaper (5k) → Nebula Warden (10k) → Cosmic Overlord (25k) → Tier 6 (50k) → Tier 7 (100k). Each tier unlocks a permanent stat bonus, and Tier 6 & 7 are <strong className="text-white">unique per pilot</strong> — they boost that character's signature ability (e.g. Pandypaws gets +50 HP & +3 Armor, Glitch's phase-shift goes 15%→25%, SkyByte unlocks HYPER BOOM).</p>
                        <p className="text-[10px] text-slate-500 italic">Track every pilot's progress on the dedicated Mastery page in-game.</p>
                    </div>
                </div>
            </SectionCard>
        </div>
    ),

    missions: (
        <div className="space-y-4">
            <SectionCard title="🔥 Daily Login Rewards" color="amber">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    Log in every day to claim escalating rewards. Build a streak across 7 days for the biggest bonus!
                </p>
                <div className="grid grid-cols-4 md:grid-cols-7 gap-2 md:gap-3">
                    {[
                        { day: 1, icon: <Coins className="w-6 h-6 md:w-8 md:h-8 fill-yellow-500 text-yellow-500 mx-auto" />, label: '400' },
                        { day: 2, icon: <Coins className="w-6 h-6 md:w-8 md:h-8 fill-yellow-500 text-yellow-500 mx-auto" />, label: '800' },
                        { day: 3, icon: <Coins className="w-6 h-6 md:w-8 md:h-8 fill-yellow-500 text-yellow-500 mx-auto" />, label: '1000' },
                        { day: 4, icon: <Puzzle className="w-6 h-6 md:w-8 md:h-8 fill-fuchsia-400 text-fuchsia-400 mx-auto" />, label: '×1' },
                        { day: 5, icon: <Coins className="w-6 h-6 md:w-8 md:h-8 fill-yellow-500 text-yellow-500 mx-auto" />, label: '2000' },
                        { day: 6, icon: <Puzzle className="w-6 h-6 md:w-8 md:h-8 fill-fuchsia-400 text-fuchsia-400 mx-auto" />, label: '×2' },
                        { day: 7, icon: <Coins className="w-6 h-6 md:w-8 md:h-8 fill-yellow-500 text-yellow-500 mx-auto" />, label: '4000', bonus: true },
                    ].map(r => (
                        <div key={r.day} className={`flex flex-col items-center justify-center p-2.5 md:p-3 rounded-xl border text-center transition-transform hover:scale-105 ${r.bonus ? 'bg-amber-900/40 border-amber-500 col-span-4 md:col-span-1 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'bg-slate-800/60 border-slate-700'}`}>
                            <div className="text-xs md:text-sm text-slate-500 font-bold mb-1">Day {r.day}</div>
                            <div className="leading-none my-1 flex justify-center w-full">{r.icon}</div>
                            <div className={`text-xs md:text-sm font-bold mt-1 ${r.bonus ? 'text-amber-400' : 'text-slate-300'}`}>{r.label}</div>
                        </div>
                    ))}
                </div>
                <p className="text-xs md:text-sm text-slate-500 mt-3">⚠️ Miss a day and your streak resets to Day 1!</p>
            </SectionCard>

            <SectionCard title="🎯 Daily Bounties" color="cyan">
                <p className="text-sm text-slate-300 leading-relaxed mb-2">
                    3 random bounty tasks refresh every day. Complete them to earn <strong className="text-yellow-400">Gold</strong> or <strong className="text-fuchsia-400">Relic Fragments</strong>. Progress is tracked automatically during your runs.
                </p>
                <div className="text-xs text-slate-400 bg-slate-900/50 rounded-lg p-2 border border-slate-700">
                    Examples: Defeat 200 enemies (total), Survive 5 mins (single run), Earn 100 Gold (single run), Reach Level 15, or Play 3 runs.
                </div>
            </SectionCard>

            <SectionCard title="⚔️ Daily Mission" color="purple">
                <p className="text-sm text-slate-300 leading-relaxed mb-2">
                    One harder challenge per day. Completing it earns <strong className="text-yellow-400">Seasonal Points</strong>.
                </p>
                <div className="bg-slate-900/50 rounded-lg p-3 border border-purple-800/40">
                    <div className="font-bold text-sm text-yellow-400 mb-1">⭐ Seasonal Skin Rewards</div>
                    <p className="text-xs text-slate-400">Collect <strong className="text-white">100 Seasonal Points</strong> to unlock an exclusive character skin. Points carry across the season. <strong className="text-white">Every character</strong> has their own unique seasonal skin to collect!</p>
                </div>
            </SectionCard>

            <SectionCard title="👥 Squad Daily & Weekly Bounties" color="orange">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-3">
                    Join a <strong className="text-orange-400">Sloth Squad</strong> (up to 5 players) and work together. Squads receive both a <strong className="text-cyan-400">Daily</strong> and a <strong className="text-yellow-400">Weekly</strong> kill target — both scale with your squad's level. Every contributing member can individually claim Gold + Relic Fragments.
                </p>
                <div className="text-xs md:text-sm text-slate-400 bg-slate-900/50 rounded-lg p-3 border border-slate-700 leading-relaxed">
                    💡 Reward sizes scale from <strong className="text-white">Lv.1 (300 daily / 2,000 weekly kills)</strong> all the way up to <strong className="text-pink-400">Lv.7 (12,000 daily / 75,000 weekly)</strong>. See the <strong className="text-orange-300">Squads</strong> tab for the full breakdown.
                </div>
            </SectionCard>
        </div>
    ),

    compete: (
        <div className="space-y-4 md:space-y-6">
            <SectionCard title="🏆 Leaderboards & Seasons" color="amber">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    Compete for <strong className="text-emerald-400">OMENX</strong> — real crypto earned exclusively through competitive play. Rewards are sent automatically to your wallet at the end of each cycle.
                </p>
                <div className="space-y-3">
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-amber-800/40">
                        <div className="font-bold text-amber-300 text-sm md:text-base mb-1.5 flex items-center gap-2">📅 Weekly Leaderboard</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed mb-2">Resets every <strong className="text-white">Monday 00:00 UTC</strong>. The <strong className="text-emerald-400">top 30 players</strong> earn OMENX — higher rank = bigger share. Weekly stat upgrades also reset.</p>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono mt-2">
                            <div className="bg-amber-950/40 border border-amber-500/50 rounded px-2 py-1 flex justify-between shadow-[0_0_8px_rgba(245,158,11,0.15)]"><span className="text-amber-300">🥇 #1</span><span className="text-white">10%</span></div>
                            <div className="bg-slate-700/40 border border-slate-400/50 rounded px-2 py-1 flex justify-between shadow-[0_0_8px_rgba(148,163,184,0.15)]"><span className="text-slate-100">🥈 #2</span><span className="text-white">8%</span></div>
                            <div className="bg-orange-950/40 border border-orange-500/50 rounded px-2 py-1 flex justify-between shadow-[0_0_8px_rgba(249,115,22,0.15)]"><span className="text-orange-300">🥉 #3</span><span className="text-white">6%</span></div>
                            <div className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 flex justify-between"><span className="text-slate-300">#4–10</span><span className="text-white">4% each</span></div>
                            <div className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 col-span-2 flex justify-between"><span className="text-slate-300">#11–20</span><span className="text-white">3% each</span></div>
                            <div className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 col-span-2 flex justify-between"><span className="text-slate-300">#21–30</span><span className="text-white">1.8% each</span></div>
                        </div>
                        <div className="text-[10px] text-slate-500 italic mt-2">Endless Void runs are excluded from OMENX payouts. Max payout per player is <strong className="text-slate-400">10,000 OMENX</strong> per period.</div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-purple-800/40">
                        <div className="font-bold text-purple-300 text-sm md:text-base mb-1.5 flex items-center gap-2">🗓️ Seasonal Leaderboard</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed mb-2">Runs for <strong className="text-white">4 weeks</strong>. The <strong className="text-emerald-400">top 30 players</strong> earn OMENX — higher rank = bigger share. Seasonal stat upgrades reset at season end.</p>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono mt-2">
                            <div className="bg-amber-950/40 border border-amber-500/50 rounded px-2 py-1 flex justify-between shadow-[0_0_8px_rgba(245,158,11,0.15)]"><span className="text-amber-300">🥇 #1</span><span className="text-white">10%</span></div>
                            <div className="bg-slate-700/40 border border-slate-400/50 rounded px-2 py-1 flex justify-between shadow-[0_0_8px_rgba(148,163,184,0.15)]"><span className="text-slate-100">🥈 #2</span><span className="text-white">7.5%</span></div>
                            <div className="bg-orange-950/40 border border-orange-500/50 rounded px-2 py-1 flex justify-between shadow-[0_0_8px_rgba(249,115,22,0.15)]"><span className="text-orange-300">🥉 #3</span><span className="text-white">6%</span></div>
                            <div className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 flex justify-between"><span className="text-slate-300">#4–10</span><span className="text-white">3.2% each</span></div>
                            <div className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 col-span-2 flex justify-between"><span className="text-slate-300">#11–20</span><span className="text-white">2.2% each</span></div>
                            <div className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 col-span-2 flex justify-between"><span className="text-slate-300">#21–30</span><span className="text-white">3.21% each</span></div>
                        </div>
                        <div className="text-[10px] text-slate-500 italic mt-2">Endless Void runs are excluded from OMENX payouts. Max payout per player is <strong className="text-slate-400">10,000 OMENX</strong> per period.</div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-cyan-800/40">
                        <div className="font-bold text-cyan-300 text-sm md:text-base mb-1.5 flex items-center gap-2">♾️ Endless Void Leaderboard</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed">Season-scoped high scores in Endless Mode. Enemies scale infinitely. Boss fights every 3 minutes. <strong className="text-amber-300">Important:</strong> Endless runs are <strong className="text-white">excluded from OMENX payouts</strong> on the Weekly + Seasonal leaderboards — but they earn their own <strong className="text-purple-300">Endless Bonus</strong> in the score formula (10,000 per minute survived), so a long, well-played endless run can rival a Sector 10 victory at the very top of the boards. S6 removed all gold/kill caps — every Gold and kill is credited in full.</p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="📊 How Scores Work (Season 6)" color="green">
                <p className="text-sm text-slate-300 leading-relaxed mb-3">
                    S6 rebuilt the score formula from scratch — <strong className="text-white">skill beats grind</strong>. Gold no longer contributes to score, time spent no longer rewards you, and sector progression is now the headline scorer:
                </p>
                <div className="bg-slate-900/60 rounded-xl p-4 border border-green-900/40 font-mono text-[11px] text-center text-green-300 mb-3 leading-relaxed space-y-2">
                    <div><span className="text-slate-500">Sector runs:</span> Score = Kills×120 + Level²×100 + SectorIndex×8,000 + Victory Bonus</div>
                    <div className="border-t border-slate-800 pt-2"><span className="text-slate-500">Endless runs:</span> Score = Kills×120 + Level²×100 + Minutes×10,000</div>
                </div>
                <div className="space-y-2 text-xs text-slate-400 mb-3">
                    <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-700/60">
                        <strong className="text-green-300">⚔️ Kills × 120</strong> — every enemy you defeat. Skill kills are the foundation.
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-700/60">
                        <strong className="text-green-300">📈 Level² × 100</strong> — quadratic, so late levels matter <em>massively</em> more than early ones.
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-700/60">
                        <strong className="text-green-300">🌌 SectorIndex × 8,000</strong> — flat bonus per sector reached (Sector 1 = 0, Sector 2 = 8k, ... Sector 10 = 72k). Progression is the real multiplier.
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2.5 border border-amber-700/40">
                        <strong className="text-amber-300">🏆 Victory Bonus = SectorIndex × 15,000</strong> — clearing Sector 10 = +135k bonus. Boss-killing is now the real prize.
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2.5 border border-purple-700/40">
                        <strong className="text-purple-300">♾️ Endless Bonus = Minutes × 10,000</strong> — endless gets its own per-minute scaling (linear, no cap) so long, well-played endless runs stay competitive with sector victories.
                    </div>
                </div>
                <div className="text-xs text-slate-400 bg-slate-900/50 rounded-lg p-3 border border-slate-700 mb-3 leading-relaxed">
                    <strong className="text-white">Gold no longer affects score.</strong> Stacking gold multipliers helps you survive — it doesn't pad your leaderboard score. <strong className="text-white">Difficulty</strong> also doesn't directly multiply score in S6; harder difficulties just grant more XP & Gold (Hard +100%, Cosmic +200%), which feed kills/level naturally.
                </div>
                <div className="text-xs text-slate-500 bg-slate-900/40 rounded-lg p-2 border border-slate-800">
                    💡 Top-of-board target: <strong className="text-white">~900k–1M</strong>. A clean Sector 10 victory (no stacking) lands ~430k. Long, skilled endless runs (25+ min with high kills/level) can reach 600k–1M. A long endless with high kills/level multipliers can compete with or exceed sector victories. Only your <strong className="text-white">highest score per period</strong> counts on the leaderboard.
                </div>
            </SectionCard>

            <SectionCard title="💠 OMENX Currency" color="cyan">
                <p className="text-sm text-slate-300 leading-relaxed mb-3">
                    OMENX is the premium Web3 currency of the OmenX ecosystem. Use it in-game to reroll upgrades, banish unwanted choices, activate Squad Ultimates, purchase cosmetics, stat boosts, and more.
                </p>
                <div className="space-y-2">
                    <div className="text-xs text-slate-400 bg-slate-900/50 rounded-lg p-3 border border-emerald-900/40">
                        <strong className="text-emerald-400">Earn via Leaderboards:</strong> Place in the top rankings on weekly or seasonal boards. Rewards are automatically sent to your wallet — no claiming needed.
                    </div>
                    <div className="text-xs text-slate-400 bg-slate-900/50 rounded-lg p-3 border border-fuchsia-900/40">
                        <strong className="text-fuchsia-400">NFT Holder Bonus:</strong> Own an OmenX NFT? Earn bonus Gold and Relic Fragments every run based on your NFT's rarity (no unlock needed — automatic per-run boost).
                    </div>
                    <div className="text-xs text-slate-400 bg-slate-900/50 rounded-lg p-3 border border-purple-900/40">
                        <strong className="text-purple-400">Purchase directly:</strong> Buy OMENX on the BNB Chain via{' '}
                        <a href="https://thirdweb.com/binance/0x992a09877b619b4755Cabe9edaf5092A956F0317" target="_blank" rel="noopener noreferrer" className="text-purple-300 underline hover:text-purple-200 transition-colors">Thirdweb (BNB Chain)</a>. Your live wallet balance is always shown in the top bar.
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="⚡ Cosmic Mutations" color="rose">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    Toggle special <strong className="text-rose-400">mutations</strong> on the Cosmic Mutations page before a run to make boss encounters harder — but earn bonus rewards for completing them.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
                    <div className="bg-slate-900/60 rounded-xl p-3 border border-red-900/40 flex flex-col">
                        <div className="text-red-400 font-bold mb-1 text-sm">⚔️ Leviathan's Fury</div>
                        <div className="text-slate-400 text-xs mb-1">Bosses deal +50% damage</div>
                        <div className="text-emerald-400 text-[11px] font-bold">→ +500 boss Gold</div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700 flex flex-col">
                        <div className="text-slate-300 font-bold mb-1 text-sm">🛡️ Thick Hide</div>
                        <div className="text-slate-400 text-xs mb-1">Bosses have +100% HP</div>
                        <div className="text-emerald-400 text-[11px] font-bold">→ +50% boss XP</div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-3 border border-yellow-900/40 flex flex-col">
                        <div className="text-yellow-400 font-bold mb-1 text-sm">💨 Frenzy</div>
                        <div className="text-slate-400 text-xs mb-1">Bosses move +50% faster</div>
                        <div className="text-emerald-400 text-[11px] font-bold">→ +1 Relic Fragment per boss kill</div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-3 border border-cyan-900/40 flex flex-col">
                        <div className="text-cyan-400 font-bold mb-1 text-sm">⚡ Bullet Hell</div>
                        <div className="text-slate-400 text-xs mb-1">Bosses fire 2× projectiles</div>
                        <div className="text-emerald-400 text-[11px] font-bold">→ +30% total score</div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-3 border border-green-900/40 flex flex-col">
                        <div className="text-green-400 font-bold mb-1 text-sm">💚 Cellular Regeneration</div>
                        <div className="text-slate-400 text-xs mb-1">Boss heals 1% Max HP / sec</div>
                        <div className="text-emerald-400 text-[11px] font-bold">→ +800 boss Gold</div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-3 border border-orange-900/40 flex flex-col">
                        <div className="text-orange-400 font-bold mb-1 text-sm">⚓ Unstoppable Force</div>
                        <div className="text-slate-400 text-xs mb-1">Boss ignores slow & pushback</div>
                        <div className="text-emerald-400 text-[11px] font-bold">→ +1,000 boss Gold</div>
                    </div>
                </div>
                <div className="text-xs text-slate-500 mt-3 bg-slate-900/40 rounded-lg p-2 border border-slate-800">
                    💡 Stack multiple mutations for even greater challenge and rewards. They can all be combined freely.
                </div>
            </SectionCard>
        </div>
    ),

    squads: (
        <div className="space-y-4 md:space-y-6">
            <SectionCard title="👥 What are Squads?" color="orange">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed">
                    Squads are persistent teams of up to <strong className="text-orange-400">5 players</strong>. Every kill you score in any run automatically contributes to your squad's weekly total — no extra steps needed. Find the Squads page from the main carousel.
                </p>
            </SectionCard>

            <SectionCard title="📈 Squad Levels & XP" color="cyan">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">Every kill any member contributes adds <strong className="text-white">1 XP</strong> to your squad's lifetime total. Level up through 7 tiers to unlock bigger Daily and Weekly bounty rewards. XP is permanent — squads only ever level up, never down.</p>
                <div className="space-y-2">
                    {[
                        { badge: '🦥', name: 'Recruits',     level: 1, xp: '0',        color: 'text-slate-400' },
                        { badge: '⭐', name: 'Drifters',     level: 2, xp: '5,000',    color: 'text-blue-400' },
                        { badge: '🔥', name: 'Hunters',      level: 3, xp: '15,000',   color: 'text-emerald-400' },
                        { badge: '⚡', name: 'Vanguards',    level: 4, xp: '35,000',   color: 'text-amber-400' },
                        { badge: '💀', name: 'Reapers',      level: 5, xp: '75,000',   color: 'text-red-400' },
                        { badge: '👑', name: 'Legends',      level: 6, xp: '150,000',  color: 'text-purple-400' },
                        { badge: '🌌', name: 'Cosmic Elite', level: 7, xp: '300,000',  color: 'text-pink-400' },
                    ].map(t => (
                        <div key={t.level} className="flex items-center gap-3 md:gap-4 bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/50">
                            <span className="text-xl md:text-2xl w-8 text-center">{t.badge}</span>
                            <span className={`font-bold text-sm md:text-base ${t.color} min-w-[120px]`}>Lv.{t.level} {t.name}</span>
                            <span className="text-xs md:text-sm text-slate-500 font-mono shrink-0">{t.xp} XP</span>
                        </div>
                    ))}
                </div>
            </SectionCard>

            <SectionCard title="🛡️ Weekly Bounties" color="amber">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    Your squad has a kill target each week based on its level. Hit the target together, and <strong className="text-white">every member</strong> can individually claim Gold and Relic Fragments. Weekly kills reset Monday 00:00 UTC.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs md:text-sm">
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.1 — Rookie</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">2,000 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 500 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×1</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.2 — Drifter</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">5,000 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 1,200 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×2</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.3 — Hunter</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">10,000 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 2,500 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×3</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.4 — Vanguard</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">18,000 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 4,000 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×4</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.5 — Reaper</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">30,000 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 6,500 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×5</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.6 — Legend</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">50,000 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 10,000 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×7</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-pink-900/40 sm:col-span-2 flex flex-col justify-center"><div className="font-bold text-pink-400 mb-1">Lv.7 — Cosmic Elite 🌌</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">75,000 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 15,000 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×10</div></div>
                </div>
            </SectionCard>

            <SectionCard title="☀️ Daily Bounties" color="cyan">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    A smaller daily kill target that resets every day at 00:00 UTC. Easier to clear, gives all members a steady extra income on top of weekly bounties.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs md:text-sm">
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.1 — Rookie</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">300 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 150</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.2 — Drifter</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">800 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 300</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.3 — Hunter</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">1,500 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 600 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×1</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.4 — Vanguard</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">2,500 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 1,000 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×1</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.5 — Reaper</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">4,500 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 1,500 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×2</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 flex flex-col justify-center"><div className="font-bold text-white mb-1">Lv.6 — Legend</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">7,500 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 2,500 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×2</div></div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-pink-900/40 sm:col-span-2 flex flex-col justify-center"><div className="font-bold text-pink-400 mb-1">Lv.7 — Cosmic Elite 🌌</div><div className="text-slate-400 flex items-center gap-1 flex-wrap">12,000 kills → <Coins className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 4,000 + <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />×3</div></div>
                </div>
            </SectionCard>

            <SectionCard title="⚙️ Roles & Management" color="purple">
                <div className="space-y-2">
                    <div className="flex gap-3 bg-slate-900/60 p-3 rounded-lg border border-yellow-900/30 items-start">
                        <Crown className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                        <div>
                            <div className="font-bold text-yellow-400 text-sm">Leader</div>
                            <div className="text-xs text-slate-400">Can edit squad name, tag & description. Can kick members or transfer leadership to another member.</div>
                        </div>
                    </div>
                    <div className="flex gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-700/50 items-start">
                        <Users className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                        <div>
                            <div className="font-bold text-slate-200 text-sm">Member</div>
                            <div className="text-xs text-slate-400">Contributes kills to the squad weekly total and can claim the weekly bounty once the target is met.</div>
                        </div>
                    </div>
                    <div className="flex gap-3 bg-slate-900/60 p-3 rounded-lg border border-cyan-900/30 items-start">
                        <MessageSquare className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                        <div>
                            <div className="font-bold text-cyan-400 text-sm">Squad Chat</div>
                            <div className="text-xs text-slate-400">Real-time chat is available in the Squads page to coordinate with your teammates.</div>
                        </div>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="🏆 Squad Leaderboard" color="green">
                <p className="text-sm text-slate-300 leading-relaxed">
                    The top squads by weekly kills are ranked on the <strong className="text-white">Squads tab</strong> in the Hall of Fame leaderboard. Your squad's level badge and total members are shown — compete to be the most dominant squad this week!
                </p>
            </SectionCard>
        </div>
    ),

    wars: (
        <div className="space-y-4 md:space-y-6">
            <SectionCard title="⚔️ Squad Wars (Weekly Head-to-Head)" color="rose">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-3">
                    Every Monday, your squad is automatically paired against another squad of similar level. From Monday 00:00 UTC to <strong className="text-white">Sunday 23:59 UTC</strong>, every kill any of your members scores in any run counts toward your squad's war total. Whoever has more kills at the deadline wins.
                </p>
                <div className="bg-slate-900/60 rounded-xl p-3 border border-rose-900/40 mb-3 text-xs md:text-sm text-slate-400 leading-relaxed">
                    💡 Find your active war on the <strong className="text-rose-300">Squad Wars</strong> page (linked from the carousel). The "Wars Board" shows every active pairing this week, and the "History" tab logs your past results. If your squad has no opponent, you get a <strong className="text-emerald-300">bye week</strong> — auto-win, no kills needed.
                </div>
                <div className="text-xs md:text-sm font-bold text-rose-300 mb-2">Per-member rewards (claim once after the war ends):</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs md:text-sm">
                    <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-3 flex flex-col">
                        <div className="font-bold text-amber-300 mb-1">🏆 Win</div>
                        <div className="text-slate-300 flex items-center gap-1 flex-wrap"><Coins className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" /> 2,500 + <Puzzle className="w-3.5 h-3.5 fill-fuchsia-400 text-fuchsia-400" />×3</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 flex flex-col">
                        <div className="font-bold text-slate-300 mb-1">🤝 Tie</div>
                        <div className="text-slate-400 flex items-center gap-1 flex-wrap"><Coins className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" /> 1,000 + <Puzzle className="w-3.5 h-3.5 fill-fuchsia-400 text-fuchsia-400" />×1</div>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 flex flex-col">
                        <div className="font-bold text-slate-400 mb-1">💀 Loss</div>
                        <div className="text-slate-500 flex items-center gap-1 flex-wrap"><Coins className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" /> 500 (consolation)</div>
                    </div>
                </div>
                <div className="text-[11px] text-slate-500 mt-3 italic">Even on a loss, every member still gets a small consolation bonus for showing up.</div>
            </SectionCard>

            <SectionCard title="👑 Squad Wars Champions Pool" color="amber">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-3">
                    Beyond the weekly war prizes, <strong className="text-amber-400">10% of the entire seasonal OMENX pool</strong> is reserved for the squads who dominate the season. At the end of every 4-week season, the top 3 squads on the Champions leaderboard split this pool in <strong className="text-emerald-400">real OMENX</strong>, paid directly to every member's wallet.
                </p>
                <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-4 mb-3">
                    <div className="font-bold text-amber-300 text-sm mb-2 flex items-center gap-2"><Award className="w-4 h-4" /> How squads are ranked</div>
                    <ul className="text-xs md:text-sm text-slate-300 space-y-1 list-disc list-inside leading-relaxed">
                        <li><strong className="text-white">Win</strong> = 3 ranking points</li>
                        <li><strong className="text-white">Tie</strong> = 1 ranking point</li>
                        <li><strong className="text-white">Bye week</strong> = 1 ranking point</li>
                        <li><strong className="text-white">Loss</strong> = 0 points</li>
                        <li>Tie-breaker: total <strong className="text-rose-300">kills</strong> across the season, then wars fought.</li>
                    </ul>
                </div>
                <div className="grid grid-cols-3 gap-2 md:gap-3 text-center mb-3">
                    <div className="bg-amber-950/40 border-2 border-amber-500/60 rounded-xl p-3 shadow-[0_0_15px_rgba(251,191,36,0.2)]">
                        <div className="text-2xl md:text-3xl mb-1">🥇</div>
                        <div className="font-bold text-amber-300 text-sm">1st place</div>
                        <div className="text-amber-200 font-mono font-black text-base md:text-lg">50%</div>
                    </div>
                    <div className="bg-slate-800/60 border-2 border-slate-400/50 rounded-xl p-3">
                        <div className="text-2xl md:text-3xl mb-1">🥈</div>
                        <div className="font-bold text-slate-200 text-sm">2nd place</div>
                        <div className="text-slate-200 font-mono font-black text-base md:text-lg">30%</div>
                    </div>
                    <div className="bg-orange-950/40 border-2 border-orange-500/50 rounded-xl p-3">
                        <div className="text-2xl md:text-3xl mb-1">🥉</div>
                        <div className="font-bold text-orange-300 text-sm">3rd place</div>
                        <div className="text-orange-200 font-mono font-black text-base md:text-lg">20%</div>
                    </div>
                </div>
                <div className="bg-slate-900/60 rounded-xl p-3 border border-amber-900/30 mb-3">
                    <div className="font-bold text-amber-300 text-sm mb-1.5">📋 Eligibility & payout split</div>
                    <ul className="text-xs md:text-sm text-slate-400 space-y-1 list-disc list-inside leading-relaxed">
                        <li>Squad must have fought <strong className="text-white">at least 2 wars</strong> during the season.</li>
                        <li>Squad must have <strong className="text-white">at least 2 active members</strong> at season end.</li>
                        <li>Each squad's share is split <strong className="text-white">equally</strong> among all its current members.</li>
                        <li>Blacklisted wallets are skipped automatically.</li>
                        <li>The pool grows live as players spend OMENX during the season.</li>
                    </ul>
                </div>
                <div className="bg-slate-900/40 rounded-lg p-3 border border-cyan-900/30 text-xs md:text-sm text-slate-400 leading-relaxed">
                    📊 The <strong className="text-amber-300">Champions</strong> tab on the Squad Wars page shows the live leaderboard, the current pool size, and your squad's <strong className="text-white">projected OMENX share</strong> if the season ended right now. Climb the rankings to lock in your squad's payout!
                </div>
            </SectionCard>
        </div>
    ),

    raid: (
        <div className="space-y-4 md:space-y-6">
            <SectionCard title="💀 Global Raid Event" color="rose">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed">
                    The <strong className="text-red-400">Global Raid</strong> is a community-wide cooperative event. You fight against a massive World Boss whose HP is shared across all players globally. 
                </p>
                <div className="bg-slate-900/60 p-4 rounded-xl border border-red-900/40 mt-4">
                    <div className="font-bold text-white text-sm md:text-base mb-1.5">⚔️ How to Participate</div>
                    <p className="text-xs md:text-sm text-slate-400 leading-relaxed">You can launch up to <strong className="text-cyan-400">5 Raid Runs</strong> per day. The damage you deal to the boss in these runs is permanently subtracted from its global health pool. Need more attempts? You can <strong className="text-purple-300">Buy 5 More Runs</strong> for <strong className="text-purple-300">10 OMENX</strong> directly on the Raid page.</p>
                </div>
                <div className="bg-slate-900/60 p-4 rounded-xl border border-cyan-900/40 mt-3">
                    <div className="font-bold text-cyan-300 text-sm md:text-base mb-1.5">📡 Live Activity Feed</div>
                    <p className="text-xs md:text-sm text-slate-400 leading-relaxed">A rotating banner at the top of the Raid page shows real-time damage milestones and boss kills from players around the world. The full <strong className="text-white">Top Contributors</strong> tab also lists the highest-damage pilots this week.</p>
                </div>
            </SectionCard>

            <SectionCard title="📈 Infinite Scaling" color="purple">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    The raid never truly ends. Whenever the community manages to drop the World Boss's HP to 0:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs md:text-sm">
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700 flex flex-col justify-center">
                        <div className="font-bold text-white mb-1.5">Level Up</div>
                        <div className="text-slate-400 leading-relaxed">The boss immediately respawns at the next Level.</div>
                    </div>
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-purple-900/40 flex flex-col justify-center">
                        <div className="font-bold text-purple-400 mb-1.5">Stronger Boss</div>
                        <div className="text-slate-400 leading-relaxed">Its max HP increases by 50% for every level it gains!</div>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="💰 Scaling Rewards" color="amber">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    As the community defeats higher levels of the boss, your potential rewards increase massively.
                </p>
                <div className="bg-slate-900/60 rounded-xl p-4 border border-yellow-900/30">
                    <div className="font-bold text-yellow-400 text-sm md:text-base mb-1.5">Claiming Gold</div>
                    <p className="text-xs md:text-sm text-slate-400 mb-2 leading-relaxed">For every boss level the community defeats, you can claim <strong className="text-white">250 Gold × Boss Level</strong>. (e.g., Level 5 boss gives 1,250 Gold).</p>
                    <p className="text-xs md:text-sm text-slate-500 italic">Note: You must have contributed damage to the raid to claim rewards!</p>
                </div>
            </SectionCard>
        </div>
    ),

    nft: (
        <div className="space-y-4 md:space-y-6">
            <SectionCard title="💎 NFT Character Unlocks" color="purple">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    Own an OmenX NFT? Instantly unlock the corresponding character and earn powerful per-run bonuses based on your NFT's rarity.
                </p>
                <div className="space-y-3">
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-purple-800/40">
                        <div className="font-bold text-purple-400 text-sm md:text-base mb-1.5 flex items-center gap-2">⚡ How It Works</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed">Your NFTs are automatically detected when you log in. If you own a character's NFT, that character unlocks instantly in your roster — <strong className="text-white">no progression grinds required</strong>.</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-emerald-800/40">
                        <div className="font-bold text-emerald-400 text-sm md:text-base mb-1.5">📊 Dynamic Unlocks</div>
                        <p className="text-xs md:text-sm text-slate-400 leading-relaxed"><strong className="text-white">Sell your NFT?</strong> The character is removed from your roster, but your <strong className="text-emerald-400">kill mastery is preserved</strong>. If you re-acquire the NFT later, the character unlocks again instantly, with all your mastery progress intact.</p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="🎁 Rarity-Based Per-Run Bonuses" color="amber">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    Every run grants <strong className="text-amber-400">automatic bonuses</strong> based on your NFT's rarity. Higher rarity = bigger rewards!
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
                        <div className="text-sm font-bold text-slate-300 mb-2">⬜ Common</div>
                        <div className="text-xs text-slate-400 space-y-1">
                            <div>+5% Gold</div>
                            <div>+5% Relic Fragments</div>
                        </div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-green-700/50">
                        <div className="text-sm font-bold text-green-300 mb-2">🟢 Uncommon</div>
                        <div className="text-xs text-slate-400 space-y-1">
                            <div>+7% Gold</div>
                            <div>+8% Relic Fragments</div>
                        </div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-blue-700/50">
                        <div className="text-sm font-bold text-blue-300 mb-2">🔵 Rare</div>
                        <div className="text-xs text-slate-400 space-y-1">
                            <div>+10% Gold</div>
                            <div>+10% Relic Fragments</div>
                        </div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-purple-700/50">
                        <div className="text-sm font-bold text-purple-300 mb-2">🟣 Epic</div>
                        <div className="text-xs text-slate-400 space-y-1">
                            <div>+12% Gold</div>
                            <div>+13% Relic Fragments</div>
                        </div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-yellow-700/50 md:col-span-2">
                        <div className="text-sm font-bold text-yellow-300 mb-2">🟡 Legendary</div>
                        <div className="text-xs text-slate-400 space-y-1">
                            <div>+15% Gold</div>
                            <div>+15% Relic Fragments</div>
                        </div>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="🔄 Character Unlock Paths" color="cyan">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    There are two ways to unlock every character:
                </p>
                <div className="space-y-3">
                    <div className="flex gap-4 bg-slate-900/60 rounded-xl p-4 border border-purple-800/40 items-start">
                        <div className="text-2xl shrink-0">💎</div>
                        <div>
                            <div className="font-bold text-purple-300 text-sm mb-1">NFT Ownership (Instant)</div>
                            <div className="text-xs text-slate-400 leading-relaxed">Own the character's NFT? Unlock instantly, plus earn rarity-based per-run bonuses every single run. Sell the NFT and the unlock is removed, but mastery persists.</div>
                        </div>
                    </div>
                    <div className="flex gap-4 bg-slate-900/60 rounded-xl p-4 border border-cyan-800/40 items-start">
                        <div className="text-2xl shrink-0">⚔️</div>
                        <div>
                            <div className="font-bold text-cyan-300 text-sm mb-1">Kill Milestones (Permanent)</div>
                            <div className="text-xs text-slate-400 leading-relaxed">Reach cumulative kill thresholds (2k, 5k, 10k, 20k kills) to permanently unlock characters. These unlocks are <strong className="text-white">never removed</strong>, even if you don't own the NFT.</div>
                        </div>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="📝 Important Notes" color="green">
                <div className="space-y-2 text-xs md:text-sm text-slate-400">
                    <p>✓ Bonuses are per-character-per-run (only the character you're playing gets its NFT bonus).</p>
                    <p>✓ NFT status is checked automatically on login — no manual claiming required.</p>
                    <p>✓ Kill mastery <strong className="text-white">never resets</strong> and is shared between NFT unlocks and milestone unlocks.</p>
                    <p>✓ You start with <strong className="text-white">NeoByte unlocked</strong> by default. All other characters require NFT ownership or milestone progression.</p>
                </div>
            </SectionCard>
        </div>
    ),

    vip: <VipTab />,
    combat: null, // defined below after VipTab
};

// Phase 2 started Monday 2026-03-09 (Week 1)
const PHASE2_START = new Date('2026-03-09T00:00:00Z');

function getVipPhaseInfo() {
    const now = new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksSincePhase2 = Math.floor((now - PHASE2_START) / msPerWeek);

    if (weeksSincePhase2 < 0) {
        return { phase: 2, week: 1, totalWeeks: 10, status: 'upcoming' };
    } else if (weeksSincePhase2 < 10) {
        return { phase: 2, week: weeksSincePhase2 + 1, totalWeeks: 10, status: 'active' };
    } else if (weeksSincePhase2 < 20) {
        return { phase: 3, week: weeksSincePhase2 - 9, totalWeeks: 10, status: 'active' };
    } else {
        return { phase: 3, week: 10, totalWeeks: 10, status: 'complete' };
    }
}

function VipTab() {
    const phaseInfo = getVipPhaseInfo();
    const { phase, week, totalWeeks, status } = phaseInfo;

    const phaseLabel = status === 'complete'
        ? 'Phase 3 complete — future allocation TBD'
        : `Phase ${phase} — Week ${week} of ${totalWeeks} (Mon–Sun cycles)`;

    return (
        <div className="space-y-4 md:space-y-6">
            <SectionCard title="👑 VIP Status" color="amber">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    VIP status is earned through your activity and investment in the <strong className="text-amber-400">OmenX ecosystem</strong>. The higher your VIP level, the better your in-game bonuses every single run.
                </p>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-amber-800/40 text-xs text-slate-400">
                    Your VIP level is fetched <strong className="text-white">once</strong> from your OmenX wallet when you sign in, then cached for the session — your in-game bonuses apply instantly with zero background polling. Upgraded your tier? Use the <strong className="text-amber-300">Refresh VIP</strong> button on your Profile page (24h cooldown) to pull the new value.
                </div>
            </SectionCard>

            <SectionCard title="⚡ VIP Bonuses" color="purple">
                <p className="text-sm text-slate-300 leading-relaxed mb-3">
                    Each VIP tier grants <strong className="text-purple-400">+1% Damage</strong> and <strong className="text-purple-400">+1% Max HP</strong> per run, stacking with every tier you reach.
                </p>
                <div className="space-y-1.5">
                    {[
                        { tier: 'Bronze 1',   level: 1,  color: 'text-amber-700',   border: 'border-amber-900/50',   bg: 'bg-amber-950/30' },
                        { tier: 'Bronze 2',   level: 2,  color: 'text-amber-700',   border: 'border-amber-900/50',   bg: 'bg-amber-950/30' },
                        { tier: 'Silver 1',   level: 3,  color: 'text-slate-300',   border: 'border-slate-500/50',   bg: 'bg-slate-800/40' },
                        { tier: 'Silver 2',   level: 4,  color: 'text-slate-300',   border: 'border-slate-500/50',   bg: 'bg-slate-800/40' },
                        { tier: 'Silver 3',   level: 5,  color: 'text-slate-300',   border: 'border-slate-500/50',   bg: 'bg-slate-800/40' },
                        { tier: 'Gold 1',     level: 6,  color: 'text-yellow-400',  border: 'border-yellow-700/50',  bg: 'bg-yellow-950/30' },
                        { tier: 'Gold 2',     level: 7,  color: 'text-yellow-400',  border: 'border-yellow-700/50',  bg: 'bg-yellow-950/30' },
                        { tier: 'Platinum 1', level: 8,  color: 'text-cyan-300',    border: 'border-cyan-800/50',    bg: 'bg-cyan-950/30' },
                        { tier: 'Platinum 2', level: 9,  color: 'text-cyan-300',    border: 'border-cyan-800/50',    bg: 'bg-cyan-950/30' },
                        { tier: 'Platinum 3', level: 10, color: 'text-cyan-300',    border: 'border-cyan-800/50',    bg: 'bg-cyan-950/30' },
                        { tier: 'Diamond 1',  level: 11, color: 'text-blue-300',    border: 'border-blue-700/50',    bg: 'bg-blue-950/30' },
                        { tier: 'Diamond 2',  level: 12, color: 'text-blue-300',    border: 'border-blue-700/50',    bg: 'bg-blue-950/30' },
                        { tier: 'Diamond 3',  level: 13, color: 'text-blue-300',    border: 'border-blue-700/50',    bg: 'bg-blue-950/30' },
                        { tier: 'Diamond 4',  level: 14, color: 'text-blue-300',    border: 'border-blue-700/50',    bg: 'bg-blue-950/30' },
                    ].map(v => (
                        <div key={v.tier} className={`flex items-center justify-between gap-3 ${v.bg} rounded-lg px-3 py-2 border ${v.border}`}>
                            <div className="flex items-center gap-2">
                                <Crown className={`w-3.5 h-3.5 shrink-0 ${v.color}`} />
                                <span className={`font-bold text-sm ${v.color}`}>{v.tier}</span>
                            </div>
                            <span className="text-xs font-mono text-purple-400 font-bold">+{v.level}% DMG / HP</span>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/40 rounded-lg border border-slate-800/50 opacity-50">
                        <Crown className="w-3.5 h-3.5 text-slate-600" />
                        <span className="text-xs text-slate-600 italic">Higher tiers — coming soon</span>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="🔮 How to Get VIP" color="cyan">
                <div className="space-y-3">
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-cyan-900/40">
                        <div className="font-bold text-cyan-300 text-sm mb-1">Purchase a VIP Tier</div>
                        <p className="text-xs text-slate-400 leading-relaxed">VIP tiers are purchased with <strong className="text-white">real money</strong> directly through the OmenX platform. Each tier comes with a <strong className="text-purple-300">weekly OMENX token allocation</strong> sent to your wallet — so your subscription pays you back in crypto!</p>
                        <div className="mt-2 bg-slate-800/60 rounded-lg p-2 border border-slate-700/50 text-[11px] text-slate-400 space-y-0.5">
                            <div className="flex items-center gap-2">
                                <span className={`font-bold ${phase === 2 ? 'text-cyan-400' : 'text-purple-400'}`}>Phase {phase}</span>
                                <span>{phaseLabel}</span>
                            </div>
                            {status !== 'complete' && phase === 2 && (
                                <div className="flex items-center gap-2"><span className="text-purple-400 font-bold">Phase 3</span><span>10 weeks — follows Phase 2</span></div>
                            )}
                            <div className="flex items-center gap-2"><span className="text-slate-500 font-bold">Beyond</span><span className="text-slate-500 italic">Allocation TBD after Phase 3</span></div>
                        </div>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-purple-900/40">
                        <div className="font-bold text-purple-300 text-sm mb-1">Automatic Detection (Once Per Sign-In)</div>
                        <p className="text-xs text-slate-400 leading-relaxed">Sign in with OmenX and your VIP tier is fetched <strong className="text-white">once</strong>, then cached — no codes, no background polling, no setup. Your in-game bonuses apply instantly every run. If you upgrade your VIP tier on OmenX, hit the <strong className="text-amber-300">Refresh VIP</strong> button on your Profile page to pull the new value (24h cooldown).</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-amber-900/40">
                        <div className="font-bold text-amber-300 text-sm mb-1">Stacks with Everything</div>
                        <p className="text-xs text-slate-400 leading-relaxed">VIP bonuses stack on top of all your permanent, weekly, and seasonal upgrades. It's the best long-term multiplier in the game — and it pays for itself.</p>
                    </div>
                </div>
            </SectionCard>
        </div>
    );
}

TABS_CONTENT.combat = (
        <div className="space-y-4">
            <SectionCard title="⚔️ Sectors & Penalties" color="cyan">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    Each sector has a unique environment, enemy pool, and difficulty. Unlock new sectors by completing runs with each character. Every sector has its own environmental effect:
                </p>
                <div className="bg-slate-900/40 rounded-lg p-3 border border-cyan-700/50 text-xs text-slate-400 mb-4">
                    <strong className="text-cyan-400">Dynamic Difficulty:</strong> Enemies adapt to your performance — if you're crushing a sector, spawns get faster and tougher; if you're struggling, the game eases up. <strong className="text-white">No gold penalties</strong> for replaying earlier sectors.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 text-sm">
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-cyan-900/40 text-center flex flex-col justify-center">
                        <div className="text-cyan-400 font-bold mb-1">Neon Rain</div>
                        <div className="text-slate-400 text-xs md:text-sm">+Speed for all</div>
                    </div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-slate-700 text-center flex flex-col justify-center">
                        <div className="text-slate-300 font-bold mb-1">Fog</div>
                        <div className="text-slate-400 text-xs md:text-sm">-Speed, fewer spawns</div>
                    </div>
                    <div className="bg-slate-900/60 p-3 md:p-4 rounded-xl border border-orange-900/40 text-center flex flex-col justify-center">
                        <div className="text-orange-400 font-bold mb-1">Solar Flare</div>
                        <div className="text-slate-400 text-xs md:text-sm">+Enemy spawns</div>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="📊 Dynamic Difficulty Pill" color="orange">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-3">
                    The pill under <strong className="text-white">KILLS</strong> in your in-run HUD shows how the game is reading your performance <em>right now</em>. If you're dominating, spawns ramp up; if you're struggling, they ease off — the pill tells you exactly which side you're on.
                </p>
                <div className="space-y-1.5 mb-3">
                    <div className="flex items-center justify-between gap-3 bg-slate-900/60 rounded-lg px-3 py-2 border border-cyan-500/40">
                        <div className="flex items-center gap-2">
                            <span className="text-base">❄️</span>
                            <span className="font-black text-cyan-300 text-xs tracking-widest uppercase">CHILL</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">&lt; 0.8× spawn rate — easing up</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-slate-900/60 rounded-lg px-3 py-2 border border-slate-600/60">
                        <div className="flex items-center gap-2">
                            <span className="text-base">⚪</span>
                            <span className="font-black text-slate-300 text-xs tracking-widest uppercase">STEADY</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">0.8×–1.2× — baseline pacing</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-slate-900/60 rounded-lg px-3 py-2 border border-orange-500/50">
                        <div className="flex items-center gap-2">
                            <span className="text-base">🔥</span>
                            <span className="font-black text-orange-300 text-xs tracking-widest uppercase">HEATED</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">1.2×–2× — elite spawn boost kicks in</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-slate-900/60 rounded-lg px-3 py-2 border border-fuchsia-500/60 shadow-[0_0_10px_rgba(217,70,239,0.2)]">
                        <div className="flex items-center gap-2">
                            <span className="text-base">⚡</span>
                            <span className="font-black text-fuchsia-300 text-xs tracking-widest uppercase">IN THE ZONE</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">2×–3× — end-of-run taper bypassed</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-slate-900/60 rounded-lg px-3 py-2 border border-red-500/70 shadow-[0_0_10px_rgba(248,113,113,0.25)]">
                        <div className="flex items-center gap-2">
                            <span className="text-base">💀</span>
                            <span className="font-black text-red-300 text-xs tracking-widest uppercase">FRENZY</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">≥ 3× — burst spawns, mobs double up</span>
                    </div>
                </div>
                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/60 text-xs text-slate-400 leading-relaxed">
                    💡 The higher tiers aren't a punishment — they're a reward. <strong className="text-white">IN THE ZONE</strong> exempts you from the final-30s spawn taper, and <strong className="text-white">FRENZY</strong> doubles up every spawn so strong players keep racking up kills and XP. More kills = more level² score = better leaderboard finish.
                </div>
            </SectionCard>

            <SectionCard title="🌟 Level Ups & Rarity" color="purple">
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4">
                    Every time you level up mid-run, you pick 1 of 3 random upgrades. Each can be one of 4 rarities:
                </p>
                <div className="bg-slate-900/40 rounded-lg p-3 border border-emerald-700/50 text-xs text-slate-400 mb-4">
                    <strong className="text-emerald-400">💡 Pool Bias points:</strong> Every <strong className="text-white">permanent</strong> stat, talent and weapon level you buy in the <strong className="text-white">Upgrade Lounge</strong> grants Pool Bias points (1 pt per level for the first 10, then 1 pt per 2 levels). Spend them on the <strong className="text-white">Loadouts</strong> page to make specific weapons or stats appear <strong className="text-white">+10% more often per point</strong> in your in-run level-up choices. They also give a <strong className="text-white">small rarity tilt</strong> — biased picks have a <strong className="text-white">+1% chance per point (capped at 10%)</strong> to roll one rarity tier higher when they appear. <span className="text-slate-500">Weekly and seasonal upgrades don't grant points.</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 text-sm text-center">
                    <div className="rounded-xl p-3 md:p-4 border border-slate-600 bg-slate-800/50 flex flex-col justify-center">
                        <div className="text-slate-300 font-bold mb-1">Common</div>
                        <div className="text-slate-500 text-xs">×1 value</div>
                    </div>
                    <div className="rounded-xl p-3 md:p-4 border border-blue-700 bg-blue-950/30 flex flex-col justify-center">
                        <div className="text-blue-400 font-bold mb-1">Rare</div>
                        <div className="text-slate-400 text-xs">×1.5 value</div>
                    </div>
                    <div className="rounded-xl p-3 md:p-4 border border-purple-700 bg-purple-950/30 flex flex-col justify-center">
                        <div className="text-purple-400 font-bold mb-1">Epic</div>
                        <div className="text-slate-400 text-xs">×2 value</div>
                    </div>
                    <div className="rounded-xl p-3 md:p-4 border border-amber-600 bg-amber-950/30 flex flex-col justify-center">
                        <div className="text-amber-400 font-bold mb-1">Legendary</div>
                        <div className="text-slate-400 text-xs">×3 value</div>
                    </div>
                </div>
                <div className="mt-4 space-y-2">
                    <div className="bg-slate-900/60 rounded-lg p-3 border border-emerald-700/40">
                        <div className="font-bold text-emerald-300 text-xs md:text-sm mb-1.5 flex items-center gap-1.5">
                            <img src="/assets/69de258a7e072380b89d66e3/01838179d_omenx_logo.png" className="w-3.5 h-3.5" alt="OMENX" /> In-Run OMENX Actions
                        </div>
                        <ul className="text-xs md:text-sm text-slate-400 space-y-1 leading-relaxed">
                            <li>• <strong className="text-white">Reroll</strong> the 3 upgrade choices — <strong className="text-emerald-300">2 OMENX</strong> (once per level-up).</li>
                            <li>• <strong className="text-white">Banish</strong> an upgrade from the pool for the rest of the run — tiered cost: <strong className="text-emerald-300">2 OMENX</strong> for the first 3 banishes, then <strong className="text-amber-300">4 OMENX</strong> for the next 3, then <strong className="text-rose-300">6 OMENX</strong> per banish.</li>
                            <li>• <strong className="text-white">Emergency Revive</strong> on death — <strong className="text-emerald-300">4 OMENX</strong> for 50% HP and 3s of invincibility.</li>
                        </ul>
                    </div>
                    <p className="text-xs text-slate-600">💡 Banishing a weapon you don't want increases the odds of getting your preferred ones on future level-ups.</p>
                </div>
            </SectionCard>

            <SectionCard title="👑 Boss Encounters" color="rose">
                <p className="text-sm text-slate-300 leading-relaxed mb-2">
                    Bosses appear at the end of certain sectors and in <strong className="text-purple-300">Endless Void</strong> (every 3 minutes after the previous boss is defeated). When a boss is active, normal enemy spawning stops.
                </p>
                <p className="text-sm text-slate-300 leading-relaxed">
                    Defeating a boss drops <strong className="text-fuchsia-400">Relic Fragments</strong> and rewards you with bonus Gold. Boss difficulty scales with game time and sector.
                </p>
            </SectionCard>

            <SectionCard title="🌍 Difficulty Modes" color="green">
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">Difficulty changes enemy strength + how much XP and Gold you earn per run. Score is driven by the formula in the Compete tab.</p>
                <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3 bg-slate-900/50 rounded-lg p-3 border border-emerald-900/40">
                        <div className="flex items-center gap-3">
                            <span className="text-emerald-400 font-bold w-20 shrink-0">Easy</span>
                            <span className="text-slate-400 text-xs">Forgiving start for new pilots. Slower enemies.</span>
                        </div>
                        <span className="text-emerald-400 font-bold text-xs font-mono shrink-0">−50% XP & Gold</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-slate-900/50 rounded-lg p-3 border border-cyan-900/40">
                        <div className="flex items-center gap-3">
                            <span className="text-cyan-400 font-bold w-20 shrink-0">Normal</span>
                            <span className="text-slate-400 text-xs">Standard experience. Good for learning the ropes.</span>
                        </div>
                        <span className="text-cyan-400 font-bold text-xs font-mono shrink-0">Baseline</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-slate-900/50 rounded-lg p-3 border border-pink-900/40">
                        <div className="flex items-center gap-3">
                            <span className="text-pink-400 font-bold w-20 shrink-0">Hard</span>
                            <span className="text-slate-400 text-xs">Tougher enemies. Occasional hazards.</span>
                        </div>
                        <span className="text-pink-400 font-bold text-xs font-mono shrink-0">+100% XP & Gold</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-slate-900/50 rounded-lg p-3 border border-violet-900/40">
                        <div className="flex items-center gap-3">
                            <span className="text-violet-400 font-bold w-20 shrink-0">Cosmic</span>
                            <span className="text-slate-400 text-xs">Maximum chaos. Frequent hazards.</span>
                        </div>
                        <span className="text-violet-400 font-bold text-xs font-mono shrink-0">+200% XP & Gold</span>
                    </div>
                </div>
            </SectionCard>
        </div>
);

export default function Info() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('basics');

    return (
        <div className="min-h-screen relative text-slate-200 font-sans overflow-hidden">
            <SpaceBackground />

            <div className="relative z-10 max-w-3xl mx-auto px-4 pt-4 pb-20">
                <button
                    onClick={() => { SoundManager.playUIClick(); navigate('/'); }}
                    className="mb-4 flex items-center gap-2 text-slate-400 hover:text-white transition-colors font-bold text-sm bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700"
                >
                    <ArrowLeft size={16} /> Back
                </button>

                <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                    <h1 className="text-3xl md:text-4xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#0CA7B8] to-[#D946EF] mb-1 drop-shadow-[0_0_10px_rgba(217,70,239,0.5)]">
                        HOW TO PLAY
                    </h1>
                    <p className="text-slate-500 text-sm mb-5">Everything you need to know about Sloths in Space.</p>

                    {/* Tabs */}
                    <div className="flex gap-1.5 flex-wrap mb-5">
                        {TABS.map(tab => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => { SoundManager.playUIClick(); setActiveTab(tab.id); }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs md:text-sm transition-all ${
                                        activeTab === tab.id
                                            ? 'bg-cyan-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                                    }`}
                                >
                                    <Icon size={14} /> {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Content */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                        >
                            {TABS_CONTENT[activeTab]}
                        </motion.div>
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    );
}