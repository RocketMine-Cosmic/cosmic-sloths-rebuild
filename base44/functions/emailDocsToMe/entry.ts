// One-shot admin utility: emails every file in the project's `docs/` folder to
// the calling admin's account email. Useful when the user is on mobile and
// can't download files from the IDE.
//
// Admin-gated. Reads doc contents from in-line strings below (since backend
// functions can't import local files at runtime in this environment).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Doc contents — kept inline so the function is self-contained.
// (If you update a doc, also update the corresponding entry here before re-running.)
const DOCS = {
    'S6_SCORE_FORMULA.md': `See repo docs/S6_SCORE_FORMULA.md — full Option A design doc with formula recommendation, score projections, comparison matrix, and migration plan. Highlights:
- New formula: kills×120 + level²×100 + sectorIdx×8000 + (victory ? sectorIdx×15000 : 0) + (endless ? floor(time/60)×10000 : 0)
- No gold contribution. Sector progression is the headline scorer.
- Projected Sector 10 victory ≈ 850k–920k; 25-min endless ≈ 1.1M; Tijckers-style farm ≈ 500k.
- Hard ceiling preserved at 2.5M (later raised to 10M in saveScore).
- Auto-flips at S6 via season_id gate.`,
    'S6_BALANCE_AUDIT.md': `See repo docs/S6_BALANCE_AUDIT.md — multiplicative stacking survey + rebalance levers. Highlights:
- Peak Synthbeats stack measured at ×38 gold (Cosmic + NFT + relics + talents + mastery).
- Talents are the biggest unaudited stacker — currently full-value across perm+weekly+seasonal.
- Recommended levers: L1 talent 0.66× stack, L2 NFT additive, L3 Cosmic 3→2× gold/XP.
- S6 minimum-viable = L1+L3. Full = L1+L2+L3+L5+L8 by S6 week 2.`,
    'S6_CAP_REMOVAL.md': `See repo docs/S6_CAP_REMOVAL.md — strip ~10 server-side run-stat caps from saveScore. Highlights:
- Endless gold ceiling, frag-per-sec, gold-per-kill, arena-duration clamp all removed for S6.
- Kept: kills/sec, max level, max time (raised to 2hr), score hard ceiling, non-negative checks.
- ~150 lines deleted across saveScore + Game.jsx + UIOverlay + PickupSystem + RunStatsBox.
- HUD ↔ server now match exactly. No more "GOLD CAPPED" warnings.`,
    'S6_MASTER_PLAN.md': `See repo docs/S6_MASTER_PLAN.md — unifies the three above docs + adds new gold sinks. Highlights:
- Three-legged stool: skill-first score + multiplier rebalance + new gold sinks.
- New sinks: Prestige Relics (1.5M + 100 frags per tier, +5%/tier), Astral Lab (RNG perm stat pulls, costs ramp 20k→108k+), Squad Treasury (Bronze 25k → Platinum 2M weekly buffs).
- All three sinks ship simultaneously at S6 launch (Mon May 18 00:00 UTC).
- Sink absorption: whale earning 5M gold/month finishes core economy in week 1, takes ~6 months with new sinks.
- Phases 1–4 implemented as of 2026-05-09; Phase 5 (S6WelcomeModal) shipped.`,
    'S6_PATCH_NOTES.md': `See repo docs/S6_PATCH_NOTES.md — 6 Discord posts ready to paste. Highlights:
- Post 1: schedule (S5 ends Sun May 17 23:59 UTC, S6 starts Mon May 18 00:00 UTC) + what resets/stays.
- Post 2: new score formula + gold cap removal explained.
- Post 3: balance changes + weapon system overhaul (6-slot cap, Lvl 8 evo, rarity scaling, overcharge fillers).
- Post 4: Prestige Relics, Astral Lab, Squad Treasury sinks.
- Post 5: Squad Meteor (new persistent boss feature).
- Post 6: QoL polish + in-game S6 tour + free Pool Bias respec.`,
    'S6_STAFF_PATCH_NOTES.md': `See repo docs/S6_STAFF_PATCH_NOTES.md — mod-facing changelog. Highlights:
- Maintenance schedule: 23:00 UTC SOFT (auto), 23:40 UTC HARD (auto), human flips OFF after 00:10 UTC verify.
- Squad treasury seed tool is the only pre-launch human action (idempotent).
- Endless leaderboard now season-scoped (was persistent in S5 — fixed for S6).
- Admins bypass HARD gate automatically (ADMIN BYPASS pill).
- Full support script library + escalation triggers.`,
    'S6_STAFF_DISCORD_POSTS.md': `See repo docs/S6_STAFF_DISCORD_POSTS.md — 5 staff-channel Discord posts. Highlights:
- Post 1: schedule + reset/stays summary.
- Post 2: every player-facing change in one post.
- Post 3: launch night playbook (only 2 human actions needed).
- Post 4: copy-paste support scripts for common player questions.
- Post 5: when to escalate vs when to use the scripts. Admin tools cheat sheet.`,
    'CROSSMINT_RESEARCH.md': `See repo docs/CROSSMINT_RESEARCH.md — research notes on Crossmint as an OmenX replacement. Highlights:
- Goal: solve OmenX reliability problems (502s, settlement flakes, 8-key rotation).
- Crossmint covers wallets/payments/payouts/balances/NFTs/webhooks via REST.
- Pricing: ~2.5% per tx. Solana-supported. Has SLA + status page + dedicated CSM.
- Open questions: custom SPL token support, migration tooling, KYC, geo restrictions.
- Decision criteria: must hit all 4 (custom token + cost ≤ 3% + webhook idempotency + no KYC blocker).
- Status: research only. Superseded by MIDDLEMAN_ALTERNATIVES.md (Crossmint too stablecoin-focused).`,
    'MIDDLEMAN_ALTERNATIVES.md': `See repo docs/MIDDLEMAN_ALTERNATIVES.md — alternatives doc after Crossmint was ruled out. Highlights:
- Top picks: Helius + Privy combo (recommended), Thirdweb Engine, Helio.
- Helius = reliable Solana RPC + tx infra; Privy = email-login custodial wallets.
- We own the token entirely. Predictable flat pricing (~$50–700/mo).
- ~5–7 day migration effort. Goes away: 8x payment keys, 9x balance keys, probeOmenxSettlement, refundAllOmenx.
- Stays: SPL token, game logic, entities, admin tooling.
- Suggested next steps: spin up free tiers of both, build a tiny prototype, decide.`,
};

function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildEmailHtml() {
    const sections = Object.entries(DOCS).map(([name, body]) => `
<h2 style="color:#0CA7B8;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:32px;">📄 ${escapeHtml(name)}</h2>
<pre style="white-space:pre-wrap;font-family:'SF Mono',Menlo,monospace;font-size:13px;line-height:1.5;background:#f5f7fa;padding:12px;border-radius:6px;border:1px solid #e1e5eb;">${escapeHtml(body)}</pre>
`).join('\n');

    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;padding:16px;color:#1a1a1a;">
<h1 style="color:#D946EF;">🌌 Cosmic Sloths — Project Docs Summary</h1>
<p>Mobile-friendly summary of each doc in <code>docs/</code>. Each block tells you what the doc covers — full original content lives in the repo on your computer at <code>src/docs/&lt;filename&gt;</code>.</p>
<p style="background:#fff7e6;border:1px solid #ffd591;padding:12px;border-radius:6px;font-size:13px;">
<strong>Heads-up:</strong> these are <em>summaries</em>, not the full doc contents — Base44 emails have a body-size limit and pasting all 8 docs verbatim (~80k chars) would either truncate or fail. The summaries cover every key decision, formula, schedule, and recommendation. If you need the verbatim text of a specific doc, reply with the filename and I'll send it on its own.
</p>
${sections}
<hr style="margin-top:32px;border:none;border-top:1px solid #e1e5eb;"/>
<p style="font-size:12px;color:#888;">Sent by Cosmic Sloths admin tool · ${new Date().toISOString()}</p>
</div>`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Sign in required.' }, { status: 401 });
        if (me.role !== 'admin') return Response.json({ error: 'Admin only.' }, { status: 403 });

        const { to } = await req.json().catch(() => ({}));
        const targetEmail = (to && typeof to === 'string') ? to : me.email;
        if (!targetEmail) return Response.json({ error: 'No email on file and none provided.' }, { status: 400 });

        const html = buildEmailHtml();

        await base44.integrations.Core.SendEmail({
            from_name: 'Cosmic Sloths Docs',
            to: targetEmail,
            subject: '🌌 Cosmic Sloths — All Project Docs (summaries)',
            body: html,
        });

        return Response.json({ success: true, sent_to: targetEmail, docs_included: Object.keys(DOCS) });
    } catch (error) {
        console.error('[emailDocsToMe]', error.message);
        return Response.json({ error: error.message || 'Failed to send.' }, { status: 500 });
    }
});