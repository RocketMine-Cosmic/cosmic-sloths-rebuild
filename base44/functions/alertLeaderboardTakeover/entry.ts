import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
function getCurrentPeriodIds() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    const week_id = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
    const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
    const season_id = `${isoYear}-S${seasonNum}`;
    return { week_id, season_id };
}

async function postToDiscord(webhookUrl, embed) {
    const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Discord error ${res.status}: ${err}`);
    }
}



function isTakeover(top2, newScore) {
    const currentTop = top2[0];
    if (!currentTop) return false;
    const isThisPlayer = currentTop.wallet_address === newScore.wallet_address || currentTop.user_id === newScore.user_id;
    const isThisScore = currentTop.score === newScore.score;
    if (!isThisPlayer || !isThisScore) return false;
    const prevTop = top2[1];
    return !prevTop || prevTop.wallet_address !== newScore.wallet_address;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const webhookUrl = Deno.env.get('DISCORD_ALERT_WEBHOOK');
        if (!webhookUrl) return Response.json({ error: 'DISCORD_ALERT_WEBHOOK not configured' }, { status: 500 });

        const body = await req.json();
        const newScore = body.data;

        if (!newScore || !newScore.score) return Response.json({ skipped: 'no score data' });

        const { week_id, season_id } = getCurrentPeriodIds();
        const isCurrentWeek = newScore.week_id === week_id;
        const isCurrentSeason = newScore.season_id === season_id;

        if (!isCurrentWeek && !isCurrentSeason) return Response.json({ skipped: 'not current period' });

        // Endless runs have their own leaderboard — never compete for weekly/seasonal #1.
        if (newScore.arena_id === 'endless') return Response.json({ skipped: 'endless run' });

        const name = newScore.player_name || 'Unknown Pilot';
        // Only accept short emoji-style icons. URLs / long strings get dropped so
        // Discord doesn't auto-link an uploaded image into the message body.
        const rawIcon = newScore.pilot_icon || '';
        const icon = (rawIcon && rawIcon.length <= 8 && !/^https?:\/\//i.test(rawIcon)) ? rawIcon : '🦥';
        const title = newScore.player_title ? ` — *${newScore.player_title}*` : '';
        const score = newScore.score?.toLocaleString() || '0';

        const alerts = [];

        // Endless runs share the same week_id/season_id as normal runs but have their
        // own dedicated leaderboard — they must be excluded from weekly/seasonal rankings,
        // matching the UI in components/game/Leaderboard.jsx.
        const getTopTwoWithBase44 = async (filter) => {
            const scores = await base44.asServiceRole.entities.RunScore.filter(filter, '-score', 100);
            const seen = new Set();
            const unique = [];
            for (const s of scores) {
                if (s.arena_id === 'endless') continue;
                const key = s.wallet_address || s.user_id;
                if (!key || seen.has(key)) continue;
                seen.add(key);
                unique.push(s);
                if (unique.length >= 2) break;
            }
            return unique;
        };

        const [weeklyTop2, seasonalTop2] = await Promise.all([
            isCurrentWeek   ? getTopTwoWithBase44({ week_id })   : Promise.resolve([]),
            isCurrentSeason ? getTopTwoWithBase44({ season_id }) : Promise.resolve([]),
        ]);

        if (isCurrentWeek && isTakeover(weeklyTop2, newScore)) {
            alerts.push({
                title: '👑 Weekly #1 Takeover!',
                description: `${icon} **${name}**${title} has seized the top of the **Weekly Leaderboard**!\n\n🏆 Score: **${score} pts**\n📅 Week: ${week_id}`,
                color: 0x0CA7B8,
                footer: { text: 'Cosmic Sloths · Weekly Leaderboard' },
                timestamp: new Date().toISOString(),
            });
        }

        if (isCurrentSeason && isTakeover(seasonalTop2, newScore)) {
            alerts.push({
                title: '👑 Seasonal #1 Takeover!',
                description: `${icon} **${name}**${title} has seized the top of the **Seasonal Leaderboard**!\n\n🏆 Score: **${score} pts**\n🗓️ Season: ${season_id}`,
                color: 0xD946EF,
                footer: { text: 'Cosmic Sloths · Seasonal Leaderboard' },
                timestamp: new Date().toISOString(),
            });
        }

        if (alerts.length === 0) return Response.json({ skipped: 'not a #1 takeover' });

        await Promise.all(alerts.map(embed => postToDiscord(webhookUrl, embed)));

        return Response.json({ success: true, alerts: alerts.length });
    } catch (error) {
        console.error('[alertLeaderboardTakeover]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});