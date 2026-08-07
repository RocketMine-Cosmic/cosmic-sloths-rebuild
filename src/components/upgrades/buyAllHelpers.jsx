// Shared helpers for the "Buy All" buttons (stats + weapon stats).
// Goal: be resilient to transient 429/5xx errors while still stopping fast
// on terminal errors like 402 (insufficient funds) or 422 (validation).

import { base44 } from '@/api/base44Client';

// Spacing between sequential purchases to stay friendly with the rate limiter.
export const PURCHASE_THROTTLE_MS = 200;

// Retry policy for a single purchase call.
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 400;

function isRetriableStatus(status) {
    // 429 = rate limit, 500/502/503/504 = transient server errors.
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isFatalStatus(status) {
    // 402 = payment required (not enough OMENX), 422 = validation (bad SKU/level/etc),
    // 400/401/403 = bad request / auth → no point retrying.
    return status === 400 || status === 401 || status === 402 || status === 403 || status === 422;
}

/**
 * Invoke purchaseSku with retry on transient errors. Stops immediately on fatal ones.
 * Returns the axios-style response (`{ data, status, ... }`) on success.
 * Throws the original error on terminal failure (with `.classification` annotated).
 */
export async function invokePurchaseWithRetry(payload) {
    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await base44.functions.invoke('purchaseSku', payload);
            // Backend returns 200 with { success: false, error } for terminal errors
            // (e.g. price mismatch, settlement failure). Surface those as fatal.
            if (res?.data?.success === false) {
                const err = new Error(res.data.error || 'Purchase failed');
                err.classification = 'fatal';
                err.serverData = res.data;
                throw err;
            }
            return res;
        } catch (e) {
            lastErr = e;
            // If we already classified it as fatal above, bail immediately.
            if (e?.classification === 'fatal') throw e;

            const status = e?.response?.status;
            if (isFatalStatus(status)) {
                e.classification = 'fatal';
                throw e;
            }
            if (!isRetriableStatus(status) || attempt === MAX_RETRIES) {
                // Unknown / network errors: treat as fatal after exhausting retries.
                e.classification = attempt === MAX_RETRIES ? 'exhausted' : 'fatal';
                throw e;
            }

            // Exponential backoff with jitter for 429/5xx.
            const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 200;
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

/** Format an error from invokePurchaseWithRetry into a user-friendly string. */
export function formatPurchaseError(e) {
    const status = e?.response?.status;
    const serverMsg = e?.serverData?.error || e?.response?.data?.error || e?.message || '';
    if (status === 402) return serverMsg || 'Not enough OMENX to continue.';
    if (status === 422) return serverMsg || 'Server rejected the purchase.';
    if (e?.classification === 'exhausted') return 'Server is busy — couldn\'t complete the batch. Try again in a moment.';
    return serverMsg || 'Something went wrong — stopped batch.';
}

/** Simple delay helper for spacing purchases. */
export function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}