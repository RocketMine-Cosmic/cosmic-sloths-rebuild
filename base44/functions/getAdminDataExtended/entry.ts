import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Auth: Base44 session → linked wallet → AdminWallet lookup.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const callerWallet = me.wallet_address?.toLowerCase();
        if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
        const adminWallets = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
        if (adminWallets.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const { type, query, period, squadId } = await req.json();

        if (type === 'overview') {
            // Fast path — only sample what's needed for the dashboard cards/chart.
            // Previously this paginated the ENTIRE RunScore + PlayerSave tables (up to
            // 25k rows each) on every Overview load, taking 10-30+ seconds and timing
            // out under load. The Overview only needs:
            //   - Approximate player + score counts (cards)
            //   - Top characters bar chart (last ~1000 runs is plenty representative)
            // Exact totals are exposed via the dedicated Health/Audit tabs if needed.
            const SAMPLE = 1000;
            const [scoresSample, savesSample] = await Promise.all([
                base44.asServiceRole.entities.RunScore.list('-created_date', SAMPLE),
                base44.asServiceRole.entities.PlayerSave.filter({}, '-created_date', SAMPLE),
            ]);

            // Counts: report the sample size and flag if it hit the cap (so the UI
            // can render "1000+" instead of an exact number).
            const totalScores = scoresSample.length;
            const totalPlayers = savesSample.length;
            const scoresCapped = scoresSample.length >= SAMPLE;
            const playersCapped = savesSample.length >= SAMPLE;

            const charCounts = {};
            for (const s of scoresSample) {
                if (s.character_id) {
                    charCounts[s.character_id] = (charCounts[s.character_id] || 0) + 1;
                }
            }
            const topCharacters = Object.entries(charCounts)
                .map(([character_id, count]) => ({ character_id, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 8);

            return Response.json({ totalPlayers, totalScores, scoresCapped, playersCapped, topCharacters });
        }

        if (type === 'scores') {
            let allScores = await base44.asServiceRole.entities.RunScore.list('-score', 200);
            // Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
            const computeIsoWeek = () => {
                const now = new Date();
                const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                const dayNum = tmp.getUTCDay() || 7;
                tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
                const isoYear = tmp.getUTCFullYear();
                const yearStart = new Date(Date.UTC(isoYear, 0, 1));
                const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
                return { isoYear, isoWeek };
            };
            if (period === 'weekly') {
                const { isoYear, isoWeek } = computeIsoWeek();
                const week_id = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
                allScores = allScores.filter(s => s.week_id === week_id);
            } else if (period === 'seasonal') {
                const { isoYear, isoWeek } = computeIsoWeek();
                const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
                const season_id = `${isoYear}-S${seasonNum}`;
                allScores = allScores.filter(s => s.season_id === season_id);
            }
            return Response.json({ scores: allScores.slice(0, 200) });
        }

        if (type === 'playerSearch') {
            if (!query) {
                const saves = await base44.asServiceRole.entities.PlayerSave.list('-created_date', 30);
                return Response.json({ players: saves });
            }
            const q = query.toLowerCase();

            // Fast path — exact wallet address. Avoids the heavy pagination + RunScore/SquadMember scans
            // that were rate-limiting (429s) when the admin pasted a full wallet. A direct filter is one
            // cheap API call and is the most common search admins do.
            if (/^0x[0-9a-f]{40}$/.test(q)) {
                const direct = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: q }, '-created_date', 1);
                const players = direct.map(p => ({ ...p, _matchedVia: 'current', _matchedName: p.save_data?.player_name || p.player_name || '' }));
                return Response.json({ players });
            }

            // Page through all PlayerSaves once — used both for current-name matching
            // AND as the canonical lookup table when resolving wallets from historical names.
            const all = [];
            let page = 1;
            const PAGE = 500;
            while (true) {
                const batch = await base44.asServiceRole.entities.PlayerSave.filter({}, '-created_date', PAGE, page);
                if (!batch || batch.length === 0) break;
                all.push(...batch);
                if (batch.length < PAGE) break;
                page++;
                if (page > 50) break;
            }
            const byWallet = new Map();
            for (const s of all) {
                if (s.wallet_address) byWallet.set(s.wallet_address.toLowerCase(), s);
            }

            // Tier 1 — direct match on PlayerSave (wallet or current name).
            const matchedWallets = new Set();
            const tagged = []; // { player, matchedVia, matchedName }
            for (const s of all) {
                if (
                    s.wallet_address?.toLowerCase().includes(q) ||
                    s.save_data?.player_name?.toLowerCase().includes(q) ||
                    s.player_name?.toLowerCase().includes(q)
                ) {
                    matchedWallets.add(s.wallet_address.toLowerCase());
                    tagged.push({ player: s, matchedVia: 'current', matchedName: s.save_data?.player_name || s.player_name || '' });
                }
            }

            // Tier 2 — historical name match via RunScore. Catches players who renamed
            // themselves but had old runs under the searched name.
            try {
                const recentRuns = await base44.asServiceRole.entities.RunScore.list('-created_date', 2000);
                const seenHistorical = new Map(); // wallet -> first historical name found
                for (const r of recentRuns) {
                    if (!r.wallet_address || !r.player_name) continue;
                    const w = r.wallet_address.toLowerCase();
                    if (matchedWallets.has(w)) continue; // already surfaced via current name
                    if (!r.player_name.toLowerCase().includes(q)) continue;
                    if (!seenHistorical.has(w)) seenHistorical.set(w, r.player_name);
                }
                for (const [w, oldName] of seenHistorical) {
                    const player = byWallet.get(w);
                    if (player) {
                        matchedWallets.add(w);
                        tagged.push({ player, matchedVia: 'historical_run', matchedName: oldName });
                    }
                }
            } catch (e) {
                console.warn('[playerSearch] historical RunScore scan failed:', e.message);
            }

            // Tier 3 — historical squad name match. Cheap; SquadMember rows are small.
            try {
                const members = await base44.asServiceRole.entities.SquadMember.list('-created_date', 2000);
                const seenSquad = new Map();
                for (const m of members) {
                    if (!m.wallet_address || !m.player_name) continue;
                    const w = m.wallet_address.toLowerCase();
                    if (matchedWallets.has(w)) continue;
                    if (!m.player_name.toLowerCase().includes(q)) continue;
                    if (!seenSquad.has(w)) seenSquad.set(w, m.player_name);
                }
                for (const [w, oldName] of seenSquad) {
                    const player = byWallet.get(w);
                    if (player) {
                        matchedWallets.add(w);
                        tagged.push({ player, matchedVia: 'historical_squad', matchedName: oldName });
                    }
                }
            } catch (e) {
                console.warn('[playerSearch] historical SquadMember scan failed:', e.message);
            }

            // Decorate with match metadata so the UI can show "matched via old name: X".
            const players = tagged.slice(0, 30).map(t => ({
                ...t.player,
                _matchedVia: t.matchedVia,
                _matchedName: t.matchedName,
            }));
            return Response.json({ players });
        }

        if (type === 'squads') {
            const squads = await base44.asServiceRole.entities.Squad.list('-weekly_kills', 200);
            return Response.json({ squads });
        }

        if (type === 'squadMembers') {
            if (!squadId) return Response.json({ members: [] });
            const members = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId });
            return Response.json({ members });
        }

        if (type === 'suspiciousRuns') {
            // Heuristic anomaly detector — surfaces runs that violate basic physics.
            // Thresholds are conservative to keep false positives low; tune as needed.
            const scores = await base44.asServiceRole.entities.RunScore.list('-created_date', 500);
            const flagged = [];
            for (const s of scores) {
                const reasons = [];
                const t = Number(s.time_survived || 0);
                const k = Number(s.kills || 0);
                const lvl = Number(s.level || 0);
                const score = Number(s.score || 0);

                if (t > 0 && k / t > 50) reasons.push(`${(k/t).toFixed(1)} kills/sec (>50)`);
                if (t > 0 && t < 60 && lvl >= 50) reasons.push(`Lvl ${lvl} in ${t}s (impossible)`);
                if (t === 0 && score > 1000) reasons.push(`${score} pts with 0s survived`);
                if (lvl > 200) reasons.push(`Level ${lvl} (cap exceeded)`);
                if (score > 1000000) reasons.push(`Score ${score.toLocaleString()} (>1M)`);
                if (k > 50000) reasons.push(`${k.toLocaleString()} kills (extreme)`);
                if (t > 14400) reasons.push(`${t}s survived (>4h)`);

                if (reasons.length > 0) flagged.push({ ...s, _reasons: reasons });
            }
            flagged.sort((a, b) => b._reasons.length - a._reasons.length || b.score - a.score);
            return Response.json({ runs: flagged.slice(0, 100) });
        }

        if (type === 'mutedWallets') {
            const all = await base44.asServiceRole.entities.MutedWallet.list('-created_date', 500);
            const now = Date.now();
            const active = all.filter(m => {
                if (!m.muted_until) return true;
                return new Date(m.muted_until).getTime() >= now;
            });
            return Response.json({ mutes: active });
        }

        if (type === 'squadMessages') {
            const filter = squadId ? { squad_id: squadId } : {};
            const messages = await base44.asServiceRole.entities.SquadMessage.filter(filter, '-created_date', 200);
            // Attach squad name for context
            const squadIds = [...new Set(messages.map(m => m.squad_id))];
            const squads = squadIds.length > 0
                ? await Promise.all(squadIds.map(id => base44.asServiceRole.entities.Squad.get(id).catch(() => null)))
                : [];
            const squadMap = {};
            squads.forEach(s => { if (s) squadMap[s.id] = s.name || s.tag; });
            const enriched = messages.map(m => ({ ...m, squad_name: squadMap[m.squad_id] || '(unknown)' }));
            return Response.json({ messages: enriched });
        }

        if (type === 'raid') {
            // Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
            const now = new Date();
            const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const dayNum = tmp.getUTCDay() || 7;
            tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
            const isoYear = tmp.getUTCFullYear();
            const yearStart = new Date(Date.UTC(isoYear, 0, 1));
            const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
            const week_id = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;

            const [bosses, contributions] = await Promise.all([
                base44.asServiceRole.entities.GlobalBoss.filter({ week_id }),
                base44.asServiceRole.entities.GlobalBossContribution.filter({ week_id }),
            ]);

            const boss = bosses.length > 0 ? bosses[0] : null;
            return Response.json({ boss, contributions });
        }

        return Response.json({ error: 'Unknown type' }, { status: 400 });
    } catch (error) {
        console.error('[getAdminDataExtended]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});