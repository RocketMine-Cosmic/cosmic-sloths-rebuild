import { useState, useCallback, useEffect, useRef } from 'react';
import { getStatus, subscribe, refreshNow, isOmenxDisabled } from '@/lib/maintenanceStatus';

// Confirmation flow for OMENX purchases.
// Reads the kill-switch flag from the SHARED maintenance cache (lib/maintenanceStatus)
// — no per-hook polling. The shared cache is refreshed once per ~60s globally
// and on visibility change; refreshNow() forces a fresh check at click time
// before firing the optimistic grant.
export function useOmenXConfirmation(pageId) {
    const [pending, setPending] = useState(null);
    const callbackRef = useRef(null);
    const disabledRef = useRef(isOmenxDisabled());

    useEffect(() => subscribe(s => { disabledRef.current = !!s.omenxPurchasesDisabled; }), []);

    const isDisabledFor24h = useCallback(() => {
        const disabledUntil = localStorage.getItem(`omenx_confirm_disabled_${pageId}`);
        if (!disabledUntil) return false;
        return Date.now() < parseInt(disabledUntil);
    }, [pageId]);

    const confirm = useCallback((amount, itemName, onConfirmCallback, options = {}) => {
        // `force: true` — ALWAYS show the modal, even if the player ticked
        // "don't show for 24h" on a previous purchase. Used for accidental-
        // click-sensitive in-run buttons (Squad ULTs) that sit over the
        // playfield where players panic-tap during fights.
        const force = !!options.force;
        const proceed = () => {
            // Block entirely if the kill-switch is on, regardless of 24h-skip.
            if (disabledRef.current) {
                callbackRef.current = onConfirmCallback;
                setPending({
                    amount, itemName,
                    onConfirm: () => {
                        setPending(null);
                        if (!disabledRef.current && callbackRef.current) callbackRef.current();
                    },
                    onCancel: () => setPending(null),
                });
                return;
            }
            // Fast path — user opted into 24h skip and purchases are enabled.
            // Skipped when `force` is set (in-run ULTs).
            if (!force && isDisabledFor24h()) {
                onConfirmCallback();
                return;
            }
            // Default — show the confirmation modal.
            callbackRef.current = onConfirmCallback;
            setPending({
                amount, itemName,
                onConfirm: () => {
                    setPending(null);
                    if (callbackRef.current) callbackRef.current();
                },
                onCancel: () => setPending(null),
            });
        };

        // Force a fresh check at click time — the cache may be up to a minute
        // stale and we MUST NOT fire the optimistic grant if the kill-switch
        // just flipped on. refreshNow() dedupes parallel callers, so this is
        // safe to call frequently.
        refreshNow().then(s => { disabledRef.current = !!s.omenxPurchasesDisabled; })
                    .finally(proceed);
    }, [isDisabledFor24h]);

    return { pending, setPending, confirm };
}