// Normalize an NFT metadata name to match our in-game character IDs.
//
// OmenX added an "Asset Managers" collection (2026-05-19) where the metadata
// name carries an `_am` suffix (e.g. "novabyte_am", "dataphantom_am"). The
// character portion of the name is the same as the original collection, so
// holders of these NFTs should still get the same character unlock + perks.
//
// Keep this dumb-simple — strip the suffix and lowercase. Future collections
// with other suffixes can be added here as a single line.
export function normalizeNftCharacterName(rawName) {
    if (!rawName || typeof rawName !== 'string') return '';
    return rawName.toLowerCase().replace(/_am$/, '');
}