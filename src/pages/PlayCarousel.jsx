import React, { useState, useEffect, useCallback, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SpaceBackground from '../components/game/SpaceBackground';
import WarpMenu from '../components/game/WarpMenu';
import WelcomeModal from '../components/onboarding/WelcomeModal';
import { SoundManager } from '../game/SoundManager';

// Static imports — bundled into the main entry chunk so they can't suffer
// from stale dynamic-chunk timestamps when Vite's dev server restarts.
import MainMenu from './MainMenu';
import Hub from './Hub';
import Dailys from './Dailys';
import Upgrades from './Upgrades';
import LeaderboardPage from './LeaderboardPage';
import Squads from './Squads';
import Bestiary from './Bestiary';
import SynergyCodex from './SynergyCodex';
import Mastery from './Mastery';
import LeviathanTrials from './LeviathanTrials';
import GlobalRaid from './GlobalRaid';
import NFTDashboard from './NFTDashboard';
import Profile from './Profile';
import Jukebox from './Jukebox';
import Titles from './Titles';
import Wardrobe from './Wardrobe';
import SquadWars from './SquadWars';

const SLIDE_LABELS = [
    { name: 'Main Menu', color: 'text-white' },
    { name: 'Sloth Command', color: 'text-cyan-300' },
    { name: 'Star Ops', color: 'text-emerald-300' },
    { name: 'Cosmic Armory', color: 'text-fuchsia-300' },
    { name: 'Hall of Fame', color: 'text-amber-300' },
    { name: 'Sloth Squads', color: 'text-orange-300' },
    { name: 'Squad Wars', color: 'text-red-400' },
    { name: 'Galactic Bestiary', color: 'text-rose-300' },
    { name: 'Cosmic Codex', color: 'text-pink-400' },
    { name: 'Pilot Mastery', color: 'text-amber-500' },
    { name: 'Cosmic Mutations', color: 'text-red-400' },
    { name: 'Galactic Raid', color: 'text-red-500' },
    { name: 'Cosmic Vault', color: 'text-purple-300' },
    { name: 'Pilot Profile', color: 'text-violet-300' },
    { name: 'Stellar Jukebox', color: 'text-fuchsia-300' },
    { name: 'Star Callsigns', color: 'text-amber-300' },
    { name: 'Wardrobe', color: 'text-cyan-300' },
];

// Renders a slide ONLY when it's active or adjacent. Off-screen slides stay
// as empty divs (carousel layout preserved) until the user navigates near them.
function LazySlide({ children, shouldMount }) {
    const [hasMounted, setHasMounted] = useState(shouldMount);

    useEffect(() => {
        // Once mounted, keep mounted (so state isn't lost when scrolling away).
        if (shouldMount && !hasMounted) setHasMounted(true);
    }, [shouldMount, hasMounted]);

    return (
        <div className="flex-[0_0_100%] min-w-0 min-h-0 h-full overflow-y-auto select-none transform-gpu" style={{ WebkitOverflowScrolling: 'touch' }}>
            {hasMounted ? children : null}
        </div>
    );
}

export default function PlayCarousel() {
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

    // Initialize from ?slide= so deep-links and the back button restore the right page.
    const initialSlide = (() => {
        const raw = parseInt(searchParams.get('slide') || '0', 10);
        return Number.isFinite(raw) && raw >= 0 && raw < 17 ? raw : 0;
    })();
    const [selectedIndex, setSelectedIndex] = useState(initialSlide);
    // Tracks whether a slide change came from the URL (popstate / back button)
    // so we don't push a redundant history entry in response.
    const syncingFromUrlRef = useRef(false);

    const scrollPrev = useCallback(() => { SoundManager.playUIClick(); emblaApi?.scrollPrev(); }, [emblaApi]);
    const scrollNext = useCallback(() => { SoundManager.playUIClick(); emblaApi?.scrollNext(); }, [emblaApi]);

    // Keyboard arrow navigation for desktop users.
    useEffect(() => {
        if (!emblaApi) return;
        const onKey = (e) => {
            // Ignore when typing in inputs/textareas/contenteditable.
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
            if (e.key === 'ArrowLeft') { emblaApi.scrollPrev(); SoundManager.playUIClick(); }
            else if (e.key === 'ArrowRight') { emblaApi.scrollNext(); SoundManager.playUIClick(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [emblaApi]);

    useEffect(() => {
        if (emblaApi && location.state?.slide !== undefined) {
            emblaApi.scrollTo(location.state.slide, true);
        }
    }, [emblaApi, location.state]);

    // Snap to the slide indicated by the URL (e.g. when the user hits the
    // browser/hardware back button, the URL changes and we follow it).
    useEffect(() => {
        if (!emblaApi) return;
        const raw = parseInt(searchParams.get('slide') || '0', 10);
        const target = Number.isFinite(raw) && raw >= 0 && raw < 17 ? raw : 0;
        if (target !== emblaApi.selectedScrollSnap()) {
            syncingFromUrlRef.current = true;
            emblaApi.scrollTo(target, true);
        }
    }, [emblaApi, searchParams]);

    useEffect(() => {
        if (!emblaApi) return;
        const onSelect = () => {
            const idx = emblaApi.selectedScrollSnap();
            setSelectedIndex(idx);

            // Mirror the active slide into the URL. Use replace for the initial
            // slide (0) so we don't pollute history, and push for navigations
            // away from it so the back button works.
            if (syncingFromUrlRef.current) {
                syncingFromUrlRef.current = false;
                return;
            }
            const currentParam = parseInt(searchParams.get('slide') || '0', 10);
            if (currentParam === idx) return;
            const newSearch = idx === 0 ? '' : `?slide=${idx}`;
            navigate(`/${newSearch}`, { replace: false });
        };
        emblaApi.on('select', onSelect);
        onSelect();
        return () => { emblaApi.off('select', onSelect); };
    }, [emblaApi, navigate, searchParams]);

    // A slide should mount if it's the current one or one adjacent (handles
    // wrap-around at start/end since the carousel is loop:true).
    const TOTAL = SLIDE_LABELS.length;
    const isNear = (idx) => {
        const diff = Math.abs(idx - selectedIndex);
        return diff <= 1 || diff >= TOTAL - 1;
    };

    return (
        <div className="h-[100dvh] bg-[#0b0416] flex flex-col overflow-hidden select-none relative font-sans">
            <SpaceBackground />
            <WelcomeModal />

            {/* Desktop navigation arrows — hidden on mobile (where swipe works). */}
            <button
                onClick={scrollPrev}
                aria-label="Previous page"
                className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-12 h-12 rounded-full bg-fuchsia-900/40 hover:bg-fuchsia-700/60 border-2 border-fuchsia-500/50 hover:border-fuchsia-300 text-fuchsia-200 hover:text-white backdrop-blur-md transition-all hover:scale-110 shadow-[0_0_20px_rgba(217,70,239,0.3)]"
            >
                <ChevronLeft className="w-6 h-6" />
            </button>
            <button
                onClick={scrollNext}
                aria-label="Next page"
                className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-12 h-12 rounded-full bg-fuchsia-900/40 hover:bg-fuchsia-700/60 border-2 border-fuchsia-500/50 hover:border-fuchsia-300 text-fuchsia-200 hover:text-white backdrop-blur-md transition-all hover:scale-110 shadow-[0_0_20px_rgba(217,70,239,0.3)]"
            >
                <ChevronRight className="w-6 h-6" />
            </button>

            {/* Warp button at top — anchored under the status bar with safe-area padding. */}
            <div
                className="px-3 pt-2 pb-2 md:px-6 md:pt-3 md:pb-3 flex justify-center items-center z-20 relative shrink-0"
                style={{ paddingTop: 'max(calc(env(safe-area-inset-top, 0px) + 8px), 12px)' }}
            >
                <WarpMenu
                    currentIndex={selectedIndex}
                    onWarp={(idx) => emblaApi?.scrollTo(idx)}
                    currentLabel={SLIDE_LABELS[selectedIndex]}
                />
            </div>

            <div
                className="flex-1 min-h-0 overflow-hidden"
                ref={emblaRef}
            >
                <div className="flex h-full min-h-0 touch-pan-y">
                    <LazySlide shouldMount={isNear(0)}><MainMenu isCarousel={true} onNavigateToPlay={() => emblaApi?.scrollTo(1)} /></LazySlide>
                    <LazySlide shouldMount={isNear(1)}><Hub isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(2)}><Dailys isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(3)}><Upgrades isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(4)}><LeaderboardPage isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(5)}><Squads isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(6)}><SquadWars isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(7)}><Bestiary isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(8)}><SynergyCodex isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(9)}><Mastery isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(10)}><LeviathanTrials isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(11)}><GlobalRaid isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(12)}><NFTDashboard isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(13)}><Profile isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(14)}><Jukebox isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(15)}><Titles isCarousel={true} /></LazySlide>
                    <LazySlide shouldMount={isNear(16)}><Wardrobe isCarousel={true} /></LazySlide>
                </div>
            </div>

        </div>
    );
}