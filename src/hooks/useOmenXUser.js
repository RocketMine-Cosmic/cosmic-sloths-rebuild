import { useContext } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';

export function useOmenXUser() {
    const { omenxUser, loading } = useCurrency();
    return { user: omenxUser, loading };
}