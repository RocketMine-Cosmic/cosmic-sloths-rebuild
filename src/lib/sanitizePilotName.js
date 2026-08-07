// Display-time fallback for missing/empty player names. The server is now the
// authoritative source: saveScore + squadActions + createSquad all read
// PlayerSave.player_name (set via Profile) and never trust client-submitted
// names. So in normal use the stored name is already what the player chose.
//
// This helper only kicks in for legacy rows or empty values, replacing them
// with an anonymous Pilot_XXXXXX handle derived from the wallet/user id.

export function sanitizePilotName(name, walletOrUserId = '') {
    const fallback = walletOrUserId
        ? `Pilot_${String(walletOrUserId).slice(-6).toUpperCase()}`
        : 'Anonymous Pilot';
    if (!name || typeof name !== 'string') return fallback;
    const trimmed = name.trim();
    if (!trimmed) return fallback;
    return trimmed;
}