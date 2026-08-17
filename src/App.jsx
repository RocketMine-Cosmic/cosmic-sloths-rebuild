import React, { useState, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import OmenXCallback from './pages/OmenXCallback';
import PlayCarousel from './pages/PlayCarousel';
import Game from './pages/Game';
import { SaveManager } from './game/SaveManager';

// Heavy pages — lazy loaded for faster initial bundle
const MainMenu = React.lazy(() => import('./pages/MainMenu'));
const Hub = React.lazy(() => import('./pages/Hub'));
const Upgrades = React.lazy(() => import('./pages/Upgrades'));
const LeaderboardPage = React.lazy(() => import('./pages/LeaderboardPage'));
const Info = React.lazy(() => import('./pages/Info'));
const Credits = React.lazy(() => import('./pages/Credits'));
const Achievements = React.lazy(() => import('./pages/Achievements'));
const Squads = React.lazy(() => import('./pages/Squads'));
const Bestiary = React.lazy(() => import('./pages/Bestiary'));
const SynergyCodex = React.lazy(() => import('./pages/SynergyCodex'));
const Profile = React.lazy(() => import('./pages/Profile'));
const NFTDashboard = React.lazy(() => import('./pages/NFTDashboard'));
const LeviathanTrials = React.lazy(() => import('./pages/LeviathanTrials'));
const Dailys = React.lazy(() => import('./pages/Dailys'));
const GlobalRaid = React.lazy(() => import('./pages/GlobalRaid'));
const Mastery = React.lazy(() => import('./pages/Mastery'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard.jsx'));
const AdminMetrics = React.lazy(() => import('./pages/AdminMetrics'));
const SkuEditor = React.lazy(() => import('./pages/SkuEditor'));
const CosmeticStudio = React.lazy(() => import('./pages/CosmeticStudio'));
const Jukebox = React.lazy(() => import('./pages/Jukebox'));
const Titles = React.lazy(() => import('./pages/Titles'));
const Wardrobe = React.lazy(() => import('./pages/Wardrobe'));
const Loadouts = React.lazy(() => import('./pages/Loadouts'));
const SquadWars = React.lazy(() => import('./pages/SquadWars'));
const WarArchive = React.lazy(() => import('./pages/WarArchive'));
const SquadLeaderDashboard = React.lazy(() => import('./pages/SquadLeaderDashboard'));
const SquadMeteor = React.lazy(() => import('./pages/SquadMeteor'));
const Sandbox = React.lazy(() => import('./pages/Sandbox'));
import { initOmenX } from '@/lib/omenx';
import { enforceWeeklyOmenSession } from '@/lib/omenxSessionWeek';
import { flushPendingScores, bindFlushListeners } from '@/lib/flushPendingScores';
import { updateOmenXUser } from '@/lib/omenxUser';
import { SoundManager } from './game/SoundManager';
import GamepadManager from './components/GamepadManager';
import Base44AuthLinker from './components/Base44AuthLinker';
import ErrorBoundary from './components/ErrorBoundary';
import MaintenanceGate from './components/MaintenanceGate';
import SyncStatusBanner from './components/SyncStatusBanner';
import DailyGoalBanner from './components/squads/DailyGoalBanner';
import FirstTimeSetupLoader from './components/FirstTimeSetupLoader';
import SaveStatusIndicator from './components/SaveStatusIndicator';
import ReauthNotice from './components/game/ReauthNotice';
import S6WelcomeModal from './components/onboarding/S6WelcomeModal';
import { CurrencyProvider } from '@/lib/CurrencyContext';
import { OmenXAuthProvider } from '@/lib/OmenXAuthContext';
import { fetchPlayerData } from '@/lib/playerDataCache';


const MainApp = () => {
  const [saveInitialized, setSaveInitialized] = useState(false);

  useEffect(() => {
    // Show UI immediately with local save, then merge cloud save in background
    setSaveInitialized(true);
    
    // Load cloud save in background
    SaveManager.initialize();
  }, []);

  // In preview mode, bypass all auth gates
  const isPreview = window.self !== window.top;
  const fallback = <div className="fixed inset-0 flex items-center justify-center bg-slate-950"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>;

  if (isPreview) {
    return (
      <React.Suspense fallback={fallback}>
        <Routes>
          <Route path="/" element={<PlayCarousel />} />
          {/* Carousel-mirrored standalone routes — redirect into the carousel
              with the matching ?slide= so users always get the WarpMenu / arrows.
              Routes NOT in this list (e.g. /admin, /squad-wars, /game) stay standalone. */}
          <Route path="/hub" element={<Navigate to="/?slide=1" replace />} />
          <Route path="/dailys" element={<Navigate to="/?slide=2" replace />} />
          <Route path="/upgrades" element={<Navigate to="/?slide=3" replace />} />
          <Route path="/leaderboard" element={<Navigate to="/?slide=4" replace />} />
          <Route path="/squads" element={<Navigate to="/?slide=5" replace />} />
          <Route path="/bestiary" element={<Navigate to="/?slide=7" replace />} />
          <Route path="/synergy-codex" element={<Navigate to="/?slide=8" replace />} />
          <Route path="/mastery" element={<Navigate to="/?slide=9" replace />} />
          <Route path="/trials" element={<Navigate to="/?slide=10" replace />} />
          <Route path="/global-raid" element={<Navigate to="/?slide=11" replace />} />
          <Route path="/nft-dashboard" element={<Navigate to="/?slide=12" replace />} />
          <Route path="/profile" element={<Navigate to="/?slide=13" replace />} />
          <Route path="/jukebox" element={<Navigate to="/?slide=14" replace />} />
          <Route path="/titles" element={<Navigate to="/?slide=15" replace />} />
          <Route path="/wardrobe" element={<Navigate to="/?slide=16" replace />} />
          <Route path="/game" element={<Game />} />
          <Route path="/info" element={<Info />} />
          <Route path="/credits" element={<Credits />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin-metrics" element={<AdminMetrics />} />
          <Route path="/sku-editor" element={<SkuEditor />} />
          <Route path="/cosmetic-studio" element={<CosmeticStudio />} />
          <Route path="/loadouts" element={<Loadouts />} />
          <Route path="/squad-wars" element={<SquadWars />} />
          <Route path="/war-archive" element={<WarArchive />} />
          <Route path="/squad-leader" element={<SquadLeaderDashboard />} />
          <Route path="/squad-meteor" element={<SquadMeteor />} />
          <Route path="/sandbox" element={<Sandbox />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </React.Suspense>
    );
  }

  // Show loading spinner while initializing save
  if (!saveInitialized) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Render the main app
  return (
    <>
    <Routes>
      <Route path="/" element={<PlayCarousel />} />
      {/* Carousel-mirrored standalone routes — redirect into the carousel
          with the matching ?slide= so users always get the WarpMenu / arrows.
          Routes NOT in this list (e.g. /admin, /squad-wars, /game) stay standalone. */}
      <Route path="/hub" element={<Navigate to="/?slide=1" replace />} />
      <Route path="/dailys" element={<Navigate to="/?slide=2" replace />} />
      <Route path="/upgrades" element={<Navigate to="/?slide=3" replace />} />
      <Route path="/leaderboard" element={<Navigate to="/?slide=4" replace />} />
      <Route path="/squads" element={<Navigate to="/?slide=5" replace />} />
      <Route path="/bestiary" element={<Navigate to="/?slide=7" replace />} />
      <Route path="/synergy-codex" element={<Navigate to="/?slide=8" replace />} />
      <Route path="/mastery" element={<Navigate to="/?slide=9" replace />} />
      <Route path="/trials" element={<Navigate to="/?slide=10" replace />} />
      <Route path="/global-raid" element={<Navigate to="/?slide=11" replace />} />
      <Route path="/nft-dashboard" element={<Navigate to="/?slide=12" replace />} />
      <Route path="/profile" element={<Navigate to="/?slide=13" replace />} />
      <Route path="/jukebox" element={<Navigate to="/?slide=14" replace />} />
      <Route path="/titles" element={<Navigate to="/?slide=15" replace />} />
      <Route path="/wardrobe" element={<Navigate to="/?slide=16" replace />} />
      <Route path="/game" element={<Game />} />
      <Route path="/info" element={<Info />} />
      <Route path="/credits" element={<Credits />} />
      <Route path="/achievements" element={<Achievements />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin-metrics" element={<AdminMetrics />} />
      <Route path="/sku-editor" element={<SkuEditor />} />
      <Route path="/cosmetic-studio" element={<CosmeticStudio />} />
      <Route path="/loadouts" element={<Loadouts />} />
      <Route path="/squad-wars" element={<SquadWars />} />
      <Route path="/war-archive" element={<WarArchive />} />
      <Route path="/squad-leader" element={<SquadLeaderDashboard />} />
      <Route path="/squad-meteor" element={<SquadMeteor />} />
      <Route path="/sandbox" element={<Sandbox />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </>
  );
};


function App() {
  useEffect(() => {
    // Weekly Omen session refresh — clears cached auth minted in an earlier ISO
    // week so the player re-runs the OAuth flow (recording a fresh Omen session,
    // which the developer API now requires within 30 days). Skipped on /game so
    // nobody is ever bounced to a Connect Wallet gate mid-run.
    if (!window.location.pathname.startsWith('/game')) {
      enforceWeeklyOmenSession().catch(err => console.error('[omenSession]', err));
    }
    initOmenX().catch(err => console.error('[OmenX] init failed', err));
    // Retry any runs that failed to save in a previous session.
    flushPendingScores().catch(err => console.error('[flushPendingScores]', err));
    // Auto-retry the queue when auth (re)establishes or tab regains focus.
    bindFlushListeners();
    // CurrencyProvider subscription will handle centralized fetch

    // Listen for auth data pushed from parent page (when embedded on Omen website).
    // omenx_auth_data is OAuth-only after Option A migration (2026-05-08) — profile
    // fields live in cosmic_sloth_save.profile. Simple merge with whatever was there
    // (e.g. tokens we may have refreshed locally).
    const onParentMessage = (event) => {
      const { type, authData } = event.data || {};
      if ((type === 'omenx_auth' || type === 'omenx_auth_response') && authData?.accessToken) {
        console.log('[OmenX] Received auth from parent iframe');
        try {
          const existing = JSON.parse(localStorage.getItem('omenx_auth_data') || '{}');
          // Do NOT stamp a fresh auth_week here. This token was pushed in by the
          // parent page — no PKCE flow ran, so Omen recorded NO new session for
          // it. Stamping it would mark the session "fresh" every single week and
          // permanently exempt these players from enforceWeeklyOmenSession, which
          // is exactly how a wallet ends up with a months-stale Omen session.
          // Keeping the existing stamp (or none at all) lets the weekly check
          // clear it and run the real OAuth flow.
          const merged = { ...existing, ...authData };
          localStorage.setItem('omenx_auth_data', JSON.stringify(merged));
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'omenx_auth_data',
            newValue: JSON.stringify(merged),
            storageArea: localStorage,
          }));
        } catch (e) {}
      }
    };
    window.addEventListener('message', onParentMessage);

    // Browsers block autoplay until the user interacts with the page.
    // Kick off menu BGM on the first click/tap/keypress, then remove the listeners.
    const startBgmOnce = () => {
      SoundManager.playBGM();
      window.removeEventListener('pointerdown', startBgmOnce);
      window.removeEventListener('keydown', startBgmOnce);
      window.removeEventListener('touchstart', startBgmOnce);
    };
    window.addEventListener('pointerdown', startBgmOnce);
    window.addEventListener('keydown', startBgmOnce);
    window.addEventListener('touchstart', startBgmOnce);

    return () => {
      window.removeEventListener('message', onParentMessage);
      window.removeEventListener('pointerdown', startBgmOnce);
      window.removeEventListener('keydown', startBgmOnce);
      window.removeEventListener('touchstart', startBgmOnce);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClientInstance}>
      <OmenXAuthProvider>
        <CurrencyProvider>
          <GamepadManager />
          <Base44AuthLinker />
          <SyncStatusBanner />
          <DailyGoalBanner />
          <FirstTimeSetupLoader />
          <SaveStatusIndicator />
          <ReauthNotice />
          <S6WelcomeModal />
          <Router>
          <MaintenanceGate />
          <React.Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-slate-950"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>}>
            <ErrorBoundary label="Cosmic Sloths">
              <Routes>
                {/* OmenX OAuth callback */}
                <Route path="/auth/callback" element={<OmenXCallback />} />
                <Route path="*" element={<MainApp />} />
              </Routes>
            </ErrorBoundary>
          </React.Suspense>
        </Router>
        <Toaster />
        </CurrencyProvider>
      </OmenXAuthProvider>
    </QueryClientProvider>
  )
}

export default App