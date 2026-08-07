/**
 * Reads OmenX auth data, falling back to IndexedDB if localStorage is unavailable.
 * Use this everywhere instead of directly reading localStorage.
 */
import { getAuthFromIndexedDB } from '@/lib/indexedDbAuth';

export function getAuthDataSync() {
    try {
        const raw = localStorage.getItem('omenx_auth_data');
        if (raw) return JSON.parse(raw);
    } catch {}
    return null;
}

export async function getAuthData() {
    const fromLocal = getAuthDataSync();
    if (fromLocal?.walletAddress && fromLocal?.accessToken) return fromLocal;

    // Fallback: try IndexedDB (survives browser history clear & some iframe restrictions)
    try {
        const fromIDB = await getAuthFromIndexedDB();
        if (fromIDB?.walletAddress && fromIDB?.accessToken) {
            // Sync back to localStorage for future sync reads
            try { localStorage.setItem('omenx_auth_data', JSON.stringify(fromIDB)); } catch {}
            return fromIDB;
        }
    } catch {}

    return null;
}