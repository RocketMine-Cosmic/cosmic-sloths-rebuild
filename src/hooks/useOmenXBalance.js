import { useState, useEffect } from 'react';

// Singleton cache — shared with useOmenXVip via the playerData cache
import { fetchPlayerData, subscribePlayerData } from '@/lib/playerDataCache';

export function useOmenXBalance() {
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = subscribePlayerData((data) => {
            setBalance(data?.balance ?? null);
            setLoading(false);
        });
        fetchPlayerData();
        return unsub;
    }, []);

    return { balance, loading, refresh: () => fetchPlayerData(true) };
}