import { useEffect, useState } from 'react';

// Shown ONLY for first-time users (no local save) while SaveManager waits for
// the Base44 wallet link and pulls cloud save. Prevents the "ghost data" feel
// where a fresh user sees an empty default save before cloud data lands.
export default function FirstTimeSetupLoader() {
    const [active, setActive] = useState(false);

    useEffect(() => {
        const onStart = () => setActive(true);
        const onEnd = () => setActive(false);
        window.addEventListener('firstTimeSetupStart', onStart);
        window.addEventListener('firstTimeSetupEnd', onEnd);
        return () => {
            window.removeEventListener('firstTimeSetupStart', onStart);
            window.removeEventListener('firstTimeSetupEnd', onEnd);
        };
    }, []);

    if (!active) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-[#0b0416]/95 backdrop-blur-md flex items-center justify-center">
            <div className="flex flex-col items-center gap-5 p-6 text-center">
                <div className="w-12 h-12 border-4 border-fuchsia-500 border-t-transparent rounded-full animate-spin" />
                <div>
                    <div className="text-white font-black text-lg md:text-xl tracking-widest uppercase">Setting up your pilot</div>
                    <div className="text-fuchsia-300/80 text-xs md:text-sm mt-2">Linking wallet & loading your save…</div>
                </div>
            </div>
        </div>
    );
}