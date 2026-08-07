import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Lightweight anti-mash cooldown for buttons that fire billable OmenX purchases
 * (Reroll, Banish, Squad Ultimate, Revive). When the user clicks, the button
 * locks for `cooldownMs` and exposes a remaining-time value so the UI can show
 * a countdown / progress state.
 *
 * Returns:
 *   - locked: boolean — true while cooldown is active
 *   - remainingMs: number — ms remaining (0 when unlocked)
 *   - trigger(fn): wraps your click handler. If locked, the call is dropped.
 */
// 2026-05-18: enforce a 1500ms minimum floor so individual callers can't
// accidentally pass a tiny value (or 0) and let players spam-click during
// an OmenX outage — which generates the retry storm we're trying to avoid.
const MIN_COOLDOWN_MS = 1500;
export function useAntiMashCooldown(cooldownMs = 2500) {
    const effectiveCooldown = Math.max(MIN_COOLDOWN_MS, cooldownMs);
    const [unlockAt, setUnlockAt] = useState(0);
    const [, setTick] = useState(0);
    const intervalRef = useRef(null);

    useEffect(() => {
        if (unlockAt === 0) return;
        intervalRef.current = setInterval(() => {
            if (Date.now() >= unlockAt) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
                setUnlockAt(0);
            } else {
                setTick(t => t + 1);
            }
        }, 100);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [unlockAt]);

    const now = Date.now();
    const locked = unlockAt > now;
    const remainingMs = locked ? unlockAt - now : 0;

    const trigger = useCallback((fn) => {
        if (Date.now() < unlockAt) return; // mash blocked
        setUnlockAt(Date.now() + effectiveCooldown);
        if (typeof fn === 'function') fn();
    }, [unlockAt, effectiveCooldown]);

    return { locked, remainingMs, trigger };
}