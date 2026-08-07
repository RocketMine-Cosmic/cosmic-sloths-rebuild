import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
function getCurrentWeekId() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const week_id = getCurrentWeekId();

        const bossRecords = await base44.asServiceRole.entities.GlobalBoss.filter({ week_id });
        if (bossRecords.length > 0) return Response.json({ boss: bossRecords[0] });

        let charCodeSum = 0;
        for (let i = 0; i < week_id.length; i++) charCodeSum += week_id.charCodeAt(i);

        const bossNames = ["The World Eater", "Cosmic Leviathan", "Star Devourer", "Void Sovereign"];
        const bossName = bossNames[charCodeSum % bossNames.length];
        const bossHp = 50000;

        const newBoss = await base44.asServiceRole.entities.GlobalBoss.create({
            week_id, boss_id: 'world_boss_' + (charCodeSum % 4),
            name: bossName, max_hp: bossHp, current_hp: bossHp,
            reward_type: 'gold', reward_id: '25000',
            is_defeated: false, level: 1
        });

        return Response.json({ boss: newBoss });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});