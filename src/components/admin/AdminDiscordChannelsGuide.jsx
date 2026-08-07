import React from 'react';
import { Bell, AlertTriangle, Coins, Shield, Swords, Trophy, Megaphone, Code } from 'lucide-react';

// Common error patterns posted to #errors. Mapped from the actual throw sites in
// backend functions (purchaseSku, syncSave, refundAllOmenx, squadWarEngine, etc.)
// so staff can triage faster without reading the source.
const ERROR_CODES = [
    {
        pattern: '❌ purchaseSku failed',
        meaning: 'A player tried to buy something with OMENX and it crashed.',
        commonCauses: [
            'OmenX dev portal API down or rate-limited (all 8 payment keys exhausted)',
            'Player\'s wallet has insufficient OMENX balance',
            'Grant validation failed (out-of-sync save, prereq not met)',
            'PlayerSave write failed AFTER charge confirmed (rare — needs manual refund)',
        ],
        action: 'If charge confirmed but grant failed → refund OMENX manually + retry sync. Otherwise check OmenX API status.',
    },
    {
        pattern: '❌ syncSave failed / sync blocked',
        meaning: 'Cloud save merge rejected client data — usually anti-cheat catching stale or tampered values.',
        commonCauses: [
            'Client timestamp older than cloud (player on multiple devices)',
            'Suspicious value injection (gold/kills jumped impossibly fast)',
            'Period mismatch (weekly/seasonal stamp from old cycle)',
        ],
        action: 'Check SyncBlockLog entity. Real players hitting this = bug. Repeat offenders = cheating.',
    },
    {
        pattern: '❌ refundAllOmenx / payout failures',
        meaning: 'Bulk OMENX transfer to players failed mid-batch.',
        commonCauses: [
            'OmenX rewards API rate-limit (try fewer recipients per batch)',
            'One or more wallets invalid/blacklisted on OmenX side',
            'Treasury balance insufficient for total payout',
        ],
        action: 'Re-run with smaller batches. Check which wallets failed in the response payload.',
    },
    {
        pattern: '❌ squadWarEngine / scheduledSquadWarPairing',
        meaning: 'Weekly squad-war scheduler or resolver crashed.',
        commonCauses: [
            'No squads available to pair (low player count week)',
            'Stale war records from previous week not resolved',
            'Database write conflict during batch resolve',
        ],
        action: 'Re-run pairing manually from admin panel. Check Squad/SquadWar entities for stuck rows.',
    },
    {
        pattern: '❌ getPlayerBalance / getNFTs / getVipLevel',
        meaning: 'OmenX dev portal lookup failed for a single player.',
        commonCauses: [
            'OmenX API temporarily down',
            'All balance/auth API keys hit rate-limit at once',
            'Player wallet not registered on OmenX (new sign-up race condition)',
        ],
        action: 'Usually transient — retries on next request. Persistent = check OmenX status page.',
    },
    {
        pattern: '❌ exchangeOmenXCode',
        meaning: 'OAuth login flow failed — player cannot sign in.',
        commonCauses: [
            'Code/verifier mismatch (PKCE)',
            'Redirect URI not whitelisted on OmenX dev portal',
            'OMENX_AUTH_API_KEY revoked or expired',
        ],
        action: 'Player should retry login. Persistent = check OAuth config + auth key validity.',
    },
    {
        pattern: '❌ saveScore / submitBossDamage',
        meaning: 'End-of-run write failed — player just lost their score.',
        commonCauses: [
            'Anti-cheat rejected impossible kills/time/damage values',
            'Player was blacklisted between run start & end',
            'Database temporarily unavailable',
        ],
        action: 'Check logs for "blocked" reason. Genuine losses → manual score restore from admin panel.',
    },
    {
        pattern: 'Generic 500 / "Internal Server Error"',
        meaning: 'Unhandled exception not caught by friendly error path.',
        commonCauses: [
            'Code bug — null reference, undefined property, etc.',
            'Base44 SDK transient failure',
            'Schema drift (entity field renamed but old code still references it)',
        ],
        action: 'Read full stack trace in webhook payload. Likely needs a code fix.',
    },
];

// Reference card for the Discord webhooks wired into the app's backend functions.
// Helps staff understand what each alert channel covers so they can triage faster.
const CHANNELS = [
    {
        secret: 'DISCORD_ERROR_WEBHOOK',
        name: '#errors',
        purpose: 'Backend crashes & unexpected failures',
        color: 'red',
        icon: AlertTriangle,
        triggers: [
            'A backend function throws an unhandled exception (e.g. purchaseSku, refundAllOmenx)',
            'External API failures (OmenX payment / balance / NFT lookups, Base44 SDK errors)',
            'Internal data corruption detected during writes',
        ],
        severity: 'High',
        action: 'Investigate stack trace immediately. May indicate a bug, downtime, or upstream API outage.',
    },
    {
        secret: 'DISCORD_ECONOMY_WEBHOOK',
        name: '#economy-alerts',
        purpose: 'Large or suspicious OMENX/gold movements',
        color: 'amber',
        icon: Coins,
        triggers: [
            'Single OMENX purchase ≥ 1,000 (whale-tier spend signal)',
            'Gold-loss audit triggered by player support ticket',
            'Bulk refunds and treasury payouts',
        ],
        severity: 'Medium',
        action: 'Cross-check player wallet & spend log. Confirms VIPs or flags whales/abuse for review.',
    },
    {
        secret: 'DISCORD_MOD_WEBHOOK',
        name: '#moderation',
        purpose: 'Player moderation actions',
        color: 'orange',
        icon: Shield,
        triggers: [
            'Squad chat message deleted by moderator',
            'Wallet muted or unmuted from squad chat',
            'Blacklist additions / removals',
        ],
        severity: 'Low',
        action: 'Audit trail only — confirms moderator actions are being logged. Review for pattern abuse.',
    },
    {
        secret: 'DISCORD_SQUADWARS_WEBHOOK',
        name: '#squad-wars',
        purpose: 'Weekly Squad Wars lifecycle events',
        color: 'red',
        icon: Swords,
        triggers: [
            'Weekly pairings posted (Monday 00:00 UTC)',
            'Wars resolved Sunday night with winners + kill counts',
            'Bye-week assignments',
        ],
        severity: 'Info',
        action: 'No action needed. Public-facing community channel. Verify scheduler ran on time each Monday.',
    },
    {
        secret: 'DISCORD_LEADERBOARD_WEBHOOK',
        name: '#leaderboard',
        purpose: 'Weekly & seasonal leaderboard recaps',
        color: 'cyan',
        icon: Trophy,
        triggers: [
            'Weekly top 100 posted at end of cycle (with OMENX payouts)',
            'Seasonal recap every 4 weeks',
            'Squad Champions OMENX prize pool distributions',
        ],
        severity: 'Info',
        action: 'No action needed. Promotes ranked competition. Confirm payouts match the on-chain transfers.',
    },
    {
        secret: 'DISCORD_ALERT_WEBHOOK',
        name: '#leaderboard-takeover',
        purpose: 'Notable rank changes during the week',
        color: 'fuchsia',
        icon: Megaphone,
        triggers: [
            'A player takes #1 on the weekly leaderboard',
            'Top-10 shake-ups (large rank jumps)',
        ],
        severity: 'Info',
        action: 'No action needed. Hype/community channel. Helps drive engagement & FOMO mid-week.',
    },
];

const COLOR_CLASSES = {
    red:     { border: 'border-red-700/50',     bg: 'bg-red-950/30',     text: 'text-red-400',     pill: 'bg-red-900/60 text-red-200' },
    amber:   { border: 'border-amber-700/50',   bg: 'bg-amber-950/30',   text: 'text-amber-400',   pill: 'bg-amber-900/60 text-amber-200' },
    orange:  { border: 'border-orange-700/50',  bg: 'bg-orange-950/30',  text: 'text-orange-400',  pill: 'bg-orange-900/60 text-orange-200' },
    cyan:    { border: 'border-cyan-700/50',    bg: 'bg-cyan-950/30',    text: 'text-cyan-400',    pill: 'bg-cyan-900/60 text-cyan-200' },
    fuchsia: { border: 'border-fuchsia-700/50', bg: 'bg-fuchsia-950/30', text: 'text-fuchsia-400', pill: 'bg-fuchsia-900/60 text-fuchsia-200' },
};

const SEVERITY_CLASSES = {
    High:   'bg-red-900/60 text-red-200 border-red-700',
    Medium: 'bg-amber-900/60 text-amber-200 border-amber-700',
    Low:    'bg-slate-800 text-slate-300 border-slate-600',
    Info:   'bg-cyan-900/60 text-cyan-200 border-cyan-700',
};

function ChannelCard({ channel }) {
    const c = COLOR_CLASSES[channel.color];
    const Icon = channel.icon;
    return (
        <div className={`bg-[#0b0416]/80 border ${c.border} rounded-xl overflow-hidden`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${c.border} ${c.bg}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                    <Icon size={16} className={c.text} />
                    <div className="min-w-0">
                        <div className={`text-sm font-black ${c.text}`}>{channel.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">{channel.secret}</div>
                    </div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${SEVERITY_CLASSES[channel.severity]}`}>
                    {channel.severity}
                </span>
            </div>
            <div className="p-4 space-y-3">
                <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Purpose</div>
                    <div className="text-sm text-slate-200">{channel.purpose}</div>
                </div>
                <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">What triggers a post</div>
                    <ul className="space-y-1">
                        {channel.triggers.map((t, i) => (
                            <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                                <span className={c.text}>•</span>
                                <span>{t}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Staff action</div>
                    <div className={`text-xs px-3 py-2 rounded ${c.pill}`}>{channel.action}</div>
                </div>
            </div>
        </div>
    );
}

export default function AdminDiscordChannelsGuide() {
    return (
        <div className="space-y-4">
            <div className="bg-[#0b0416]/80 border border-indigo-900/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                    <Bell size={16} /> Discord Alert Channels
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                    Reference for staff: what each Discord webhook posts, how urgent it is, and what to do when you see a message there.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {CHANNELS.map(c => <ChannelCard key={c.secret} channel={c} />)}
            </div>

            {/* Error code reference — what the messages in #errors actually mean */}
            <div className="bg-[#0b0416]/80 border border-red-900/50 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-red-900/50 bg-red-950/30">
                    <Code size={16} className="text-red-400" />
                    <h3 className="text-sm font-black text-red-400 uppercase tracking-widest">#errors — Error Code Reference</h3>
                </div>
                <p className="text-xs text-slate-400 px-4 pt-3">
                    Each entry shows the message prefix you'll see in <span className="font-mono text-red-300">#errors</span>, what it actually means, why it usually happens, and what to do.
                </p>
                <div className="p-4 space-y-2">
                    {ERROR_CODES.map((err, i) => (
                        <details key={i} className="bg-slate-900/60 border border-red-900/30 rounded-lg overflow-hidden group">
                            <summary className="px-3 py-2 cursor-pointer text-xs font-mono text-red-300 hover:bg-red-950/30 transition-colors flex items-center gap-2">
                                <AlertTriangle size={12} className="shrink-0" />
                                <span className="font-bold">{err.pattern}</span>
                            </summary>
                            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-red-900/30">
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-0.5">What it means</div>
                                    <div className="text-xs text-slate-200">{err.meaning}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-0.5">Common causes</div>
                                    <ul className="space-y-0.5">
                                        {err.commonCauses.map((c, j) => (
                                            <li key={j} className="text-xs text-slate-300 flex items-start gap-2">
                                                <span className="text-red-400">•</span>
                                                <span>{c}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-0.5">Staff action</div>
                                    <div className="text-xs px-3 py-2 rounded bg-red-900/40 text-red-100">{err.action}</div>
                                </div>
                            </div>
                        </details>
                    ))}
                </div>
            </div>
        </div>
    );
}