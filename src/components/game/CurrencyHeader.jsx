import React from 'react';
import { Star, Puzzle, Coins } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import { maskWallet } from '@/lib/maskWallet';

function OmenXIcon({ className }) {
    return <img src="/assets/69de258a7e072380b89d66e3/01838179d_omenx_logo.png" className={className} alt="OMENX" />;
}

export default function CurrencyHeader() {
    const { save, omenxBalance, loading: omenxLoading } = useCurrency();

    const formatBalance = (bal) => {
        if (bal === null || bal === undefined) return '…';
        return bal.toFixed(2);
    };

    return (
        <div className="flex flex-wrap justify-end gap-1.5 md:gap-3">
            <div className="flex items-center gap-1.5 text-xs md:text-sm lg:text-base font-black text-yellow-300 bg-yellow-950/60 backdrop-blur px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.2)]" title="Star Fragments">
                <Star className="w-3 h-3 md:w-4 md:h-4 fill-yellow-400 text-yellow-400" /> {save.starFragments || 0}
            </div>
            <div className="flex items-center gap-1.5 text-xs md:text-sm lg:text-base font-black text-fuchsia-300 bg-fuchsia-950/60 backdrop-blur px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-fuchsia-700/50 shadow-[0_0_10px_rgba(217,70,239,0.2)]" title="Relic Fragments">
                <Puzzle className="w-3 h-3 md:w-4 md:h-4 fill-fuchsia-400 text-fuchsia-400" /> {save.relicFragments || 0}
            </div>
            <div
                className={`flex items-center gap-1.5 text-xs md:text-sm lg:text-base font-black text-purple-300 bg-purple-950/60 backdrop-blur px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)] transition-all ${omenxLoading ? 'opacity-60' : ''}`}
                title="OMENX Wallet Balance (real-time)"
            >
                <OmenXIcon className="w-4 h-4 md:w-5 md:h-5" />
                <span className={omenxBalance === null ? 'opacity-40' : ''}>
                    {omenxLoading && omenxBalance === null ? '…' : formatBalance(omenxBalance)}
                </span>
                <span className="text-[9px] md:text-[10px] text-purple-500 font-bold tracking-wider">OMENX</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs md:text-sm lg:text-base font-black text-yellow-400 bg-amber-950/60 backdrop-blur px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]" title="Gold">
                <Coins className="w-3 h-3 md:w-4 md:h-4 fill-yellow-500 text-yellow-500" /> {save.gold}
            </div>
        </div>
    );
}