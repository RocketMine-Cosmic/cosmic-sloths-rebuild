import { useEffect, useState } from 'react';
import { getStatus, subscribe } from '@/lib/maintenanceStatus';

// Reads the global OMENX kill-switch flag from the shared maintenance cache.
// All polling is centralized in lib/maintenanceStatus — this hook does NO
// network requests of its own (previously every mount polled getMaintenanceMode
// independently, which contributed to the 429 storm that left the kill-switch
// silently failing for many players).
export function useOmenXPurchasesDisabled() {
    const [state, setState] = useState(() => {
        const s = getStatus();
        return { disabled: !!s.omenxPurchasesDisabled, message: s.omenxPurchasesMessage || '' };
    });

    useEffect(() => {
        return subscribe(s => {
            setState({ disabled: !!s.omenxPurchasesDisabled, message: s.omenxPurchasesMessage || '' });
        });
    }, []);

    return state;
}