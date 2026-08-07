import { useCurrency } from '@/lib/CurrencyContext';

export function useOmenXVip() {
    const { vipLevel, loading } = useCurrency();
    return { vip: vipLevel, loading };
}