/**
 * THE REGISTRY — every base44 backend function this bundle calls, and what the
 * adapter does about it. 73 names, 291 call sites.
 *
 * 🔴 THE POINT OF THIS FILE IS THAT THE GAPS ARE ENUMERATED RATHER THAN FELT.
 * _check_drift.sh verifies consistency, not coverage; a name that is missing
 * from a seam is a silence, and this project's four worst findings were all
 * silences every document agreed on. So every name gets a state and a reason,
 * and anything not on this list throws too — an unknown name is not a pass.
 *
 * States:
 *   ported      routed to a Supabase RPC or Edge Function. The value is what.
 *   stubbed     answered locally, deliberately, because the server-side concept
 *               does not exist and the dark build's answer is knowable. There
 *               is exactly ONE of these and it warns on every call.
 *   not_ported  THROWS 501. No Supabase path yet. The value says why.
 *   retired     THROWS 410. Will never exist here. The value says why.
 */
export const REGISTRY = {
  // ---- PORTED (6) ----------------------------------------------------
  getWeeklyKillLeaderboard: ['ported', 'cs_weekly_kills(p_week_id)'],
  loadSave: ['ported', 'load_save()'],
  purchaseSku: ['ported', 'Edge Function \'purchase\''],
  saveScore: ['ported', 'cs_start_run() + save_score() — see run.js'],
  spendGold: ['ported', 'spend_gold(p_grant, p_idempotency_key)'],
  syncSave: ['ported', 'sync_save(p_client, p_expected_version)'],

  // ---- STUBBED (1) ---------------------------------------------------
  getMaintenanceMode: ['stubbed', 'no maintenance concept exists server-side yet; the dark build is never in maintenance. §5.'],

  // ---- NOT_PORTED (27) ------------------------------------------------
  checkpointRun: ['not_ported', 'Run recovery is unported. The run now has an identity (cs_start_run), so the base44 pendingRunSnapshot design does not port as-is.'],
  claimBossReward: ['not_ported', 'The Global Raid is unported — D-165.'],
  claimBounty: ['not_ported', 'The daily loop is a later session — named in save_score\'s own comment.'],
  claimDailyLogin: ['not_ported', 'The daily loop is a later session — named in save_score\'s own comment.'],
  claimDailyTask: ['not_ported', 'The daily loop is a later session — named in save_score\'s own comment.'],
  claimSeasonalSkin: ['not_ported', 'Seasonal skin claim has no server path.'],
  craftRelic: ['not_ported', 'The forge is unported — its gold sink is one of D-105\'s four ledger writers.'],
  createSquad: ['not_ported', 'Squads are unported.'],
  deleteSquadMessage: ['not_ported', 'Squads are unported.'],
  // 🔴 042: this was ['not_ported', 'OMENX code redemption is unported.'] — a
  // note that reads as promo-code redemption. It is the OAuth authorization-code
  // exchange, i.e. the whole of sign-in, and it was triaged by its name.
  exchangeOmenXCode: ['ported', 'OAuth authorization-code exchange -> omen-auth Edge Function (D-141/D-145), which also installs the Supabase session.'],
  forgeAction: ['not_ported', 'The forge is unported — D-105, and forgeAction:284 charges gold and logs nothing.'],
  getNFTs: ['not_ported', 'NFT reads are unported — same reason. D-108: the live lookup lives in the CALLER, and the caller is not the browser.'],
  getOrSpawnWeeklyBoss: ['not_ported', 'The Global Raid is unported — D-165.'],
  getPlayerBalance: ['not_ported', 'OMENX balance reads are unported — they belong on the Edge Function side with the key pools, never in the browser.'],
  getPlayerNftsAndVip: ['not_ported', 'OMENX NFT + VIP read — same reason as getNFTs/getVipLevel. D-108: the live lookup lives in the CALLER, and the caller is not the browser.'],
  getSquadChampionsStandings: ['not_ported', 'The champions board is being rebuilt on a new basis — D-125, 29 §5.'],
  getSquadMeteorState: ['not_ported', 'Squads are unported.'],
  getSquadProfile: ['not_ported', 'Squads are unported.'],
  getSquadWarMemberContributions: ['not_ported', 'Squad wars GO — D-126.'],
  getVipLevel: ['not_ported', 'VIP reads are unported — same reason as getPlayerBalance.'],
  leaderboardPayoutConfig: ['not_ported', 'Payout config is read from payout_configs directly (D-132); the write half is admin (D-89).'],
  linkWalletToUser: ['not_ported', 'Superseded by omen-auth (D-141/D-145) — the wallet IS the identity here. Kept as not_ported rather than retired until the sign-in path is exercised end to end.'],
  prestigeRelic: ['not_ported', 'Prestige is unported — D-105.'],
  squadActions: ['not_ported', 'Squads are unported end to end — no table, no RPC. D-126/D-127 change the basis first.'],
  squadWarEngine: ['not_ported', 'Squad wars GO — D-126. Nothing to port.'],
  submitBossDamage: ['not_ported', 'The Global Raid is unported — and D-165 hangs on it (five titles).'],
  submitSquadMeteorDamage: ['not_ported', 'Squads are unported.'],

  // ---- RETIRED (39) ---------------------------------------------------
  adminHealthCheck: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  adminPatchSave: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  adminRefreshPlayerNFTs: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  adminSquadOps: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  auditPlayerGold: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  backfillKillSnapshot: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  backfillRunScoreNames: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  backfillStaffPayouts: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  backfillTokenSpendLogWallets: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  backupData: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  cleanupKeepTopScoresPerPlayer: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  cleanupOldSpendLogs: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  distributeKillPool: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  distributeSquadChampions: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  distributeStaffPayout: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  fullWipeIncludingUsers: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  generateCosmeticAsset: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  getAdminData: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  getAdminDataExtended: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  getPlayerDeepMetrics: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  getPlayerRetention: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  manageAdminWallet: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  manageBlacklist: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  manuallyDistributeRewards: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  muteWallet: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  previewPayouts: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  refundAllOmenx: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  refundSinglePlayer: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  resetAllPlayerData: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  restoreDataBackup: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  restoreDeletedRunScore: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  resyncSquadWarKills: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  seedSquadTreasuries: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  setGlobalXpBuff: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  setMaintenanceMode: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  setMinClientVersion: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  setStaffPayoutPct: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  softDeleteRunScore: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
  topupWeeklyPayout: ['retired', 'Admin surface. D-89 puts the admin suite in its own Vercel project against the same Supabase — it is not part of the game bundle.'],
};

export function lookup(name) {
  return REGISTRY[name] || null;
}
