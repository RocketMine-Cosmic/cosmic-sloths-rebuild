import React, { createContext, useContext, useEffect, useState } from 'react';
import { subscribePlayerData, fetchPlayerData } from '@/lib/playerDataCache';
import { SaveManager } from '@/game/SaveManager';

const CurrencyContext = createContext();

export const CurrencyProvider = ({ children }) => {
  const [save, setSave] = useState(SaveManager.load());
  const [omenxBalance, setOmenxBalance] = useState(null);
  const [vipLevel, setVipLevel] = useState(0);
  const [nfts, setNfts] = useState([]);
  const [omenxUser, setOmenxUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribePlayerData((data) => {
      if (data) {
        setOmenxBalance(data.balance ?? null);
        setVipLevel(data.vipLevel ?? 0);
        setNfts(data.nfts ?? []);
        if (data.user) setOmenxUser(data.user);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleSaveUpdated = (e) => setSave(e.detail);
    window.addEventListener('saveUpdated', handleSaveUpdated);
    return () => window.removeEventListener('saveUpdated', handleSaveUpdated);
  }, []);

  // Profile fields (player_name / player_title / pilot_icon) live in
  // cosmic_sloth_save.profile (Option A, 2026-05-08). Any change to the save —
  // either local edit (Profile/Titles page) or cloud load (SaveManager.initialize)
  // — flows through saveUpdated. We re-project the profile fields onto omenxUser
  // here so consumers see the latest values without needing their own listeners.
  // The legacy `omenxUserUpdated` event is kept for instant in-flight feedback
  // (updateOmenXUser fires it before the save round-trip completes).
  useEffect(() => {
    const reproject = (saveData) => {
      const profile = saveData?.profile || {};
      setOmenxUser(prev => {
        if (!prev) return prev; // wait for the first cache load to seed wallet/etc.
        return {
          ...prev,
          player_name: profile.player_name ?? prev.player_name,
          pilot_icon: profile.pilot_icon ?? prev.pilot_icon,
          data: {
            ...(prev.data || {}),
            player_name: profile.player_name ?? prev.data?.player_name,
            player_title: profile.player_title !== undefined ? profile.player_title : prev.data?.player_title,
            pilot_icon: profile.pilot_icon ?? prev.data?.pilot_icon,
          },
        };
      });
    };
    const handleSaveUpdated = (e) => reproject(e.detail);
    const handleUserUpdated = (e) => {
      // updates is the new profile slice — fold it in directly.
      const u = e.detail || {};
      setOmenxUser(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          player_name: u.player_name ?? prev.player_name,
          pilot_icon: u.pilot_icon ?? prev.pilot_icon,
          data: {
            ...(prev.data || {}),
            player_name: u.player_name ?? prev.data?.player_name,
            player_title: u.player_title !== undefined ? u.player_title : prev.data?.player_title,
            pilot_icon: u.pilot_icon ?? prev.data?.pilot_icon,
          },
        };
      });
    };
    window.addEventListener('saveUpdated', handleSaveUpdated);
    window.addEventListener('omenxUserUpdated', handleUserUpdated);
    return () => {
      window.removeEventListener('saveUpdated', handleSaveUpdated);
      window.removeEventListener('omenxUserUpdated', handleUserUpdated);
    };
  }, []);

  // Initial seed: when omenxUser arrives from playerDataCache (with wallet/username
  // but no profile), immediately project the current save.profile onto it so
  // equipped title / pilot icon show up on first paint instead of after the
  // first edit.
  useEffect(() => {
    if (!omenxUser || omenxUser.data?.player_title !== undefined) return;
    const profile = save?.profile || {};
    if (!profile.player_name && !profile.player_title && !profile.pilot_icon) return;
    setOmenxUser(prev => prev ? ({
      ...prev,
      player_name: profile.player_name ?? prev.player_name,
      pilot_icon: profile.pilot_icon ?? prev.pilot_icon,
      data: {
        ...(prev.data || {}),
        player_name: profile.player_name ?? prev.data?.player_name,
        player_title: profile.player_title ?? '',
        pilot_icon: profile.pilot_icon ?? prev.data?.pilot_icon,
      },
    }) : prev);
  }, [omenxUser, save]);

  return (
    <CurrencyContext.Provider value={{ save, omenxBalance, loading, refresh: () => fetchPlayerData(true), vipLevel, nfts, omenxUser }}>
      {children}
    </CurrencyContext.Provider>
  );

  // User is now fetched by playerDataCache and merged into omenxUser via subscribePlayerData
  // No additional /v1/oauth/user calls needed — all components share cached data
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within CurrencyProvider');
  }
  return context;
};

export const useOmenXUserFromCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useOmenXUserFromCurrency must be used within CurrencyProvider');
  }
  // Return just the user-related data
  return {
    user: context.omenxUser,
    loading: context.loading,
  };
};

export const useOmenXVipFromCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useOmenXVipFromCurrency must be used within CurrencyProvider');
  }
  // Return just the VIP-related data
  return {
    vip: context.vipLevel,
    loading: context.loading,
  };
};