import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useOmenXUser } from '@/hooks/useOmenXUser';
import { Users, Search, Plus, MessageSquare, Shield, Send, ArrowLeft, Gift, Settings, Crown, UserX, Coins, Puzzle, Swords, Globe, Star, Lock, ShieldQuestion, Vault } from 'lucide-react';
import SquadTreasuryPanel from '../components/squads/SquadTreasuryPanel';
import EmojiPicker, { SQUAD_ICONS } from '../components/game/EmojiPicker';
import JoinRequestsPanel from '../components/squads/JoinRequestsPanel';
import PrivacySelector from '../components/squads/PrivacySelector';
import { SoundManager } from '../game/SoundManager';
import { SaveManager } from '../game/SaveManager';
import { useToast } from "@/components/ui/use-toast";
import moment from 'moment';
import { getSquadLevel, getNextSquadLevel, getSquadXpProgress } from '../game/SquadLevels';
import SpaceBackground from '../components/game/SpaceBackground';
import OmenXGate from '../components/game/OmenXGate';
import CurrencyHeader from '../components/game/CurrencyHeader';
import SquadProfileModal from '../components/squads/SquadProfileModal';
import { sanitizePilotName } from '@/lib/sanitizePilotName';
import { getCurrentPeriodIds } from '@/lib/periodIds';
import { isS6OrLater } from '@/lib/seasonGate';

// System messages contain player names baked into the content string
// (e.g. "William Luce has joined the squad!"). Pre-privacy-fix rows may have
// real OAuth names; mask any space-containing token-with-uppercase pattern that
// looks like a real name. Single-word handles like "Pilot_ABC123" pass through.
function sanitizeSystemMessage(content) {
    if (!content || typeof content !== 'string') return content;
    // Match "<word> <word>" at start of message (e.g. "William Luce") and replace
    // with an anonymous "A pilot" placeholder. Keeps the rest of the message intact.
    return content.replace(/^([A-Z][a-z]+ [A-Z][a-z]+)(?=\s)/, 'A pilot');
}

const MAX_SQUAD_MEMBERS = 5;

// Bounty tiers scale with squad level. Rewards are PER-MEMBER — every member
// claims independently once per period when the squad hits the target.
// (MUST mirror functions/squadActions WEEKLY_BOUNTY_TIERS / DAILY_BOUNTY_TIERS.)
const BOUNTY_TIERS = [
    { minLevel: 1, target: 2000,  gold: 250,  fragments: 1, label: 'Rookie Bounty' },
    { minLevel: 2, target: 5000,  gold: 600,  fragments: 1, label: 'Drifter Bounty' },
    { minLevel: 3, target: 10000, gold: 1250, fragments: 2, label: 'Hunter Bounty' },
    { minLevel: 4, target: 18000, gold: 2000, fragments: 2, label: 'Vanguard Bounty' },
    { minLevel: 5, target: 30000, gold: 3250, fragments: 3, label: 'Reaper Bounty' },
    { minLevel: 6, target: 50000, gold: 5000, fragments: 4, label: 'Legend Bounty' },
    { minLevel: 7, target: 75000, gold: 7500, fragments: 5, label: 'Cosmic Bounty' },
];

const DAILY_BOUNTY_TIERS = [
    { minLevel: 1, target: 300,   gold: 75,   fragments: 0, label: 'Daily Patrol' },
    { minLevel: 2, target: 800,   gold: 150,  fragments: 0, label: 'Daily Sweep' },
    { minLevel: 3, target: 1500,  gold: 300,  fragments: 0, label: 'Daily Hunt' },
    { minLevel: 4, target: 2500,  gold: 500,  fragments: 1, label: 'Daily Purge' },
    { minLevel: 5, target: 4500,  gold: 750,  fragments: 1, label: 'Daily Assault' },
    { minLevel: 6, target: 7500,  gold: 1250, fragments: 1, label: 'Daily Crusade' },
    { minLevel: 7, target: 12000, gold: 2000, fragments: 2, label: 'Daily Annihilation' },
];

function getBountyTier(level) {
    let tier = BOUNTY_TIERS[0];
    for (const t of BOUNTY_TIERS) {
        if (level >= t.minLevel) tier = t;
    }
    return tier;
}

function getDailyBountyTier(level) {
    let tier = DAILY_BOUNTY_TIERS[0];
    for (const t of DAILY_BOUNTY_TIERS) {
        if (level >= t.minLevel) tier = t;
    }
    return tier;
}

export default function Squads({ isCarousel }) {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user: omenxUser } = useOmenXUser();
    const [user, setUser] = useState(null);
    const [myMemberRecord, setMyMemberRecord] = useState(null);
    const [mySquad, setMySquad] = useState(null);
    const walletAddr = user ? (user?.walletAddress || user?.wallet_address || user?.data?.wallet_address || '').trim() : '';
    
    // States for No Squad
    const [allSquads, setAllSquads] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newSquadName, setNewSquadName] = useState('');
    const [newSquadTag, setNewSquadTag] = useState('');
    const [newSquadDesc, setNewSquadDesc] = useState('');

    // States for In Squad
    const [activeTab, setActiveTab] = useState('chat'); // 'chat', 'members', or 'settings'
    const [squadMembers, setSquadMembers] = useState([]);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const chatEndRef = useRef(null);

    // Profile modal state — viewing any squad's public profile
    const [profileSquadId, setProfileSquadId] = useState(null);

    // Tracks in-flight claim calls so a player can't accidentally fire the
    // bounty endpoint 3-4 times in 2 seconds (each call = 5 DB reads/writes →
    // rate-limit bucket overflow → 429 → all retries fail → unpaid bounty).
    const [claimingWeekly, setClaimingWeekly] = useState(false);
    const [claimingDaily, setClaimingDaily] = useState(false);

    // Confirmation modal for leaving the squad — prevents accidental taps on the
    // small "Leave" button (which triggers a 24h cooldown). All 3 Leave buttons
    // (mobile strip, desktop panel, settings "Danger Zone") open the same modal.
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [pendingTransferMember, setPendingTransferMember] = useState(null);
    const [isTransferringLeadership, setIsTransferringLeadership] = useState(false);

    // Browse tab — lazy-loaded the first time it's opened (and refreshed at
    // most once per 60s). Avoids the always-on Squad.list('-created_date', 50)
    // for every page load.
    const browseLoadedAt = useRef(0);
    const loadBrowseSquads = async () => {
        if (Date.now() - browseLoadedAt.current < 60_000 && allSquads.length > 0) return;
        try {
            const squads = await base44.entities.Squad.list('-created_date', 50);
            setAllSquads(squads);
            browseLoadedAt.current = Date.now();
        } catch {}
    };

    // Settings edit state
    const [editName, setEditName] = useState('');
    const [editTag, setEditTag] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editIcon, setEditIcon] = useState('🛡️');
    const [editPrivacy, setEditPrivacy] = useState('open');
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [showSquadIconPicker, setShowSquadIconPicker] = useState(false);

    // Use canonical ISO 8601 week (Mon-start, Sun 23:59 UTC end). moment's `ww` token is
    // locale-week (Sun-start in en-US) which rolled W19 over a day early on Sundays.
    const getCurrentWeek = () => getCurrentPeriodIds().week_id;
    // UTC-day for daily-bounty comparisons. Server stamps last_daily_payout_date using
    // UTC (`new Date().toISOString().split('T')[0]`), so the client MUST compare against
    // the same UTC day — otherwise non-UTC players see stale "already claimed" state
    // (or worse, the CLAIM button reappears prematurely and the server rejects with
    // "already claimed" giving a confusing error toast). Hugo bug 2026-05-06.
    const getCurrentDayUTC = () => new Date().toISOString().split('T')[0];

    useEffect(() => {
         const loadUserAndSquad = async () => {
             try {
                 if (!omenxUser) {
                     setUser({});
                     return;
                 }
                 setUser(omenxUser);
                 if (omenxUser) {
                     const memberships = await base44.entities.SquadMember.filter({ wallet_address: omenxUser.wallet_address || omenxUser.walletAddress });
                     // Cache membership for Game.jsx to read without network call
                     const walletKey = omenxUser.wallet_address || omenxUser.walletAddress;
                     if (memberships.length > 0) {
                         localStorage.setItem(`squad_membership_${walletKey}`, JSON.stringify(memberships[0]));
                     } else {
                         localStorage.removeItem(`squad_membership_${walletKey}`);
                     }
                     if (memberships.length > 0) {
                         const member = memberships[0];
                         setMyMemberRecord(member);

                         const squad = await base44.entities.Squad.get(member.squad_id);

                         // Check weekly/daily reset
                         const currentWeek = getCurrentWeek();
                         const currentDay = getCurrentDayUTC();
                         let needsUpdate = false;
                         const updateData = {};
                         let updatedSquad = squad;

                         if (squad.current_week !== currentWeek) {
                             const earnedXp = squad.weekly_kills || 0;
                             const newXp = (squad.xp || 0) + earnedXp;
                             const newLevelData = getSquadLevel(newXp);
                             updateData.current_week = currentWeek;
                             updateData.weekly_kills = 0;
                             updateData.xp = newXp;
                             updateData.level = newLevelData.level;
                             needsUpdate = true;
                         }

                         // Only trigger a reset when the stored day is STRICTLY BEHIND today
                         // (matches squadActions resetPeriods + saveScore logic). Using `!==`
                         // here previously fired a reset for empty/null/future-stamped values
                         // too, contributing to the "daily kills reset a double time" bug
                         // (Texxy 2026-05-15). Server is still authoritative — this just
                         // decides whether to make the call at all.
                         const storedDay = squad.current_day || '';
                         if (storedDay && storedDay < currentDay) {
                             updateData.current_day = currentDay;
                             updateData.daily_kills = 0;
                             needsUpdate = true;
                         } else if (storedDay !== currentDay) {
                             // Heal missing/future-stamped day without wiping kills.
                             updateData.current_day = currentDay;
                             needsUpdate = true;
                         }

                         if (needsUpdate) {
                             // Spread the thundering herd at midnight UTC: every active player's
                             // client hits resetPeriods + squadWarEngine + getSquadRaidLeaderboard
                             // simultaneously when the week rolls over, triggering 429 rate-limits
                             // across the board (Hugo bug 2026-05-04 ~00:35 BST). A small random
                             // jitter (0–45s) staggers the calls so they don't all stampede at once.
                             // The server is authoritative anyway — kills won't be lost.
                             const jitterMs = Math.floor(Math.random() * 45000);
                             await new Promise(r => setTimeout(r, jitterMs));
                             const res = await base44.functions.invoke('squadActions', {
                                 action: 'resetPeriods',
                                 squadId: squad.id,
                                 updateData,
                             });
                             if (res.data?.squad) updatedSquad = res.data.squad;
                         }

                         setMySquad(updatedSquad);
                         // Don't pre-load all squads here — when the player is already in a
                         // squad, they only need the Browse list if they click the Browse tab.
                         // Pre-loading was ~50 Squad rows per page open for every member of
                         // every squad, on every storage tick. Lazy-loaded in the tab below.
                     } else {
                         // No squad — load the squad list so they can find one to join.
                         const squads = await base44.entities.Squad.list('-created_date', 50);
                         setAllSquads(squads);
                     }
                 }
             } catch (e) {
                 console.error(e);
                 // Handle RLS or access errors gracefully
                 if (e?.message?.includes('Forbidden') || e?.status === 403) {
                     setUser({}); // Reset to avoid retry loop
                     toast({ title: "Access Denied", description: "You may have been removed from your squad." });
                 }
             }
         };
         loadUserAndSquad();

         // Only re-fetch if the WALLET itself changes (e.g., user switched accounts).
         // Pre-fix: any write to omenx_auth_data (every save sync, every profile
         // edit, every cloud merge) re-ran the full squad load + resetPeriods round-trip,
         // hammering squadActions with 429s. Profile name/title edits get picked up
         // through the omenxUser dependency on this effect anyway.
         let lastWallet = (omenxUser?.wallet_address || omenxUser?.walletAddress || '').toLowerCase();
         const handleStorageChange = (e) => {
             if (e.key !== 'omenx_auth_data') return;
             try {
                 const next = JSON.parse(e.newValue || '{}');
                 const nextWallet = (next?.walletAddress || '').toLowerCase();
                 if (nextWallet && nextWallet !== lastWallet) {
                     lastWallet = nextWallet;
                     loadUserAndSquad();
                 }
             } catch {}
         };
         window.addEventListener('storage', handleStorageChange);
         return () => window.removeEventListener('storage', handleStorageChange);
     }, [omenxUser]);

    useEffect(() => {
        if (mySquad) {
            setEditName(mySquad.name || '');
            setEditTag(mySquad.tag || '');
            setEditDesc(mySquad.description || '');
            setEditIcon(mySquad.icon || '🛡️');
            setEditPrivacy(mySquad.privacy || 'open');
        }
    }, [mySquad]);

    // Re-fetch members + messages only when the SQUAD ID changes, not on every
    // squad-record update tick. The squad subscription previously caused a full
    // re-fetch of members (5-table aggregation in getSquadProfile) every time
    // weekly_kills ticked up — basically every kill credit by any member.
    const mySquadId = mySquad?.id;
    useEffect(() => {
        if (mySquadId) {
            const loadMembersAndMessages = async () => {
                // Use getSquadProfile so members come pre-enriched with weekly kills,
                // raid damage, and war wins — same data the profile modal uses.
                try {
                    const res = await base44.functions.invoke('getSquadProfile', { squadId: mySquadId });
                    if (res.data?.success) {
                        setSquadMembers(res.data.members);
                    } else {
                        const members = await base44.entities.SquadMember.filter({ squad_id: mySquadId });
                        setSquadMembers(members);
                    }
                } catch {
                    const members = await base44.entities.SquadMember.filter({ squad_id: mySquadId });
                    setSquadMembers(members);
                }
                
                const msgs = await base44.entities.SquadMessage.filter({ squad_id: mySquadId }, '-created_date', 50);
                setMessages(msgs.reverse());
            };
            loadMembersAndMessages();
            
            // Subscriptions
            const unsubMessages = base44.entities.SquadMessage.subscribe((event) => {
                if (event.type === 'create' && event.data.squad_id === mySquadId) {
                    setMessages(prev => {
                        // If this message is already in the list (e.g. from optimistic update), skip
                        if (prev.some(m => m.id === event.data.id)) return prev;
                        // Replace any optimistic message from the same user with same content
                        const hasOptimistic = prev.some(m => m.id?.startsWith('optimistic-') && m.content === event.data.content && m.user_id === event.data.user_id);
                        if (hasOptimistic) {
                            return prev.map(m => (m.id?.startsWith('optimistic-') && m.content === event.data.content && m.user_id === event.data.user_id) ? event.data : m);
                        }
                        return [...prev, event.data];
                    });
                }
            });
            const unsubSquad = base44.entities.Squad.subscribe((event) => {
                if (event.type === 'update' && event.id === mySquadId) {
                    setMySquad(event.data);
                }
            });
            return () => { unsubMessages(); unsubSquad(); };
        }
    }, [mySquadId]);

    useEffect(() => {
        if (chatEndRef.current) {
            const container = chatEndRef.current.parentElement;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }
    }, [messages, activeTab]);

    const handleCreateSquad = async (e) => {
        e.preventDefault();
        if (!newSquadName || !newSquadTag || !user) return;
        
        try {
            SoundManager.playUIClick();
            
            if (!walletAddr) {
                toast({ title: "Error", description: "Wallet address not found. Please log in again." });
                return;
            }
            
            const currentSave = SaveManager.load();
            if (currentSave.lastSquadLeaveTime && Date.now() - currentSave.lastSquadLeaveTime < 24 * 60 * 60 * 1000) {
                const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - currentSave.lastSquadLeaveTime)) / (60 * 60 * 1000));
                toast({ title: "Cooldown Active", description: `You must wait ${hoursLeft} hours after leaving a squad before creating a new one.` });
                return;
            }

            const displayName = (currentSave.player_name || user?.data?.player_name || user?.player_name || `Pilot_${walletAddr.slice(-6).toUpperCase()}`).trim();
            const res = await base44.functions.invoke('createSquad', {
                squadName: newSquadName,
                squadTag: newSquadTag,
                squadDesc: newSquadDesc,
                playerName: displayName,
                playerTitle: (user?.data?.player_title || '').trim(),
            });
            
            if (!res.data?.success) {
                toast({ title: "Error", description: res.data?.error || "Failed to create squad. Please try again." });
                return;
            }
            
            setMySquad(res.data.squad);
            setMyMemberRecord(res.data.member);
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: e?.response?.data?.error || e?.message || "Failed to create squad. Please try again." });
        }
    };

    const handleJoinSquad = async (squadId) => {
        if (!user) return;
        try {
            SoundManager.playUIClick();
            
            const currentSave = SaveManager.load();
            if (currentSave.lastSquadLeaveTime && Date.now() - currentSave.lastSquadLeaveTime < 24 * 60 * 60 * 1000) {
                const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - currentSave.lastSquadLeaveTime)) / (60 * 60 * 1000));
                toast({ title: "Cooldown Active", description: `You must wait ${hoursLeft} hours after leaving a squad before joining a new one.` });
                return;
            }

            const localSave = SaveManager.load();
            const displayName = (localSave.player_name || user?.data?.player_name || user?.player_name || `Pilot_${walletAddr.slice(-6).toUpperCase()}`).trim();
            const res = await base44.functions.invoke('squadActions', {
                action: 'join', squadId,
                playerName: displayName,
                playerTitle: (user?.data?.player_title || '').trim(),
            });
            if (!res.data?.success) {
                // If the squad is invite-only, surface a helpful CTA — server returns
                // requiresRequest:true so we can route the player to the request flow.
                if (res.data?.requiresRequest) {
                    toast({ title: "Invite-Only Squad", description: "Send a join request — the leader will review it." });
                    return;
                }
                toast({ title: "Error", description: res.data?.error || "Failed to join squad." });
                return;
            }
            // Fall back to a fresh fetch if the server response is missing the full
            // squad record — keeps the UI from getting stuck on the squad-list view.
            let joinedSquad = res.data.squad;
            if (!joinedSquad?.id || !joinedSquad?.name) {
                try { joinedSquad = await base44.entities.Squad.get(squadId); } catch {}
            }
            if (joinedSquad?.id) {
                setMyMemberRecord(res.data.member);
                setMySquad(joinedSquad);
                // Cache membership so Game.jsx can read it without a network call.
                const walletKey = user?.wallet_address || user?.walletAddress;
                if (walletKey && res.data.member) {
                    localStorage.setItem(`squad_membership_${walletKey}`, JSON.stringify(res.data.member));
                }
                toast({ title: "Joined Squad!", description: `Welcome to ${joinedSquad.name}.` });
            } else {
                toast({ title: "Joined Squad!", description: "Refreshing squad info…" });
                // Last-resort: refresh the page state from scratch.
                setMySquad(null);
                setMyMemberRecord(null);
                setAllSquads([]);
                setUser({ ...user });
            }
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: e?.response?.data?.error || "Failed to join squad." });
        }
    };

    const handleLeaveSquad = async () => {
        if (!myMemberRecord) return;
        if (isLeaving) return;
        setIsLeaving(true);
        try {
            SoundManager.playUIClick();
            const localSave = SaveManager.load();
            const leaveName = (localSave.player_name || user?.data?.player_name || user?.player_name || `Pilot_${walletAddr.slice(-6).toUpperCase()}`).trim();
            const res = await base44.functions.invoke('squadActions', {
                action: 'leave',
                memberId: myMemberRecord.id,
                squadId: mySquad.id,
                playerName: leaveName,
            });
            if (!res.data?.success) {
                toast({ title: "Error", description: res.data?.error || "Failed to leave squad." });
                return;
            }

            const currentSave = SaveManager.load();
            currentSave.lastSquadLeaveTime = Date.now();
            SaveManager.save(currentSave);

            setMyMemberRecord(null);
            setMySquad(null);
            const squads = await base44.entities.Squad.list('-created_date', 50);
            setAllSquads(squads);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLeaving(false);
            setShowLeaveConfirm(false);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !mySquad || !user) return;
        
        const content = newMessage.trim();
        setNewMessage('');
        SoundManager.playUIClick();

        const localSave = SaveManager.load();
        const displayName = (localSave.player_name || user?.data?.player_name || user?.player_name || `Pilot_${walletAddr.slice(-6).toUpperCase()}`).trim();
        const optimisticMsg = {
            id: `optimistic-${Date.now()}`,
            squad_id: mySquad.id,
            wallet_address: walletAddr,
            player_name: displayName,
            player_title: (user?.data?.player_title || '').trim(),
            content: content,
            created_date: new Date().toISOString()
        };
        setMessages(prev => [...prev, optimisticMsg]);
        
        try {
            const res = await base44.functions.invoke('squadActions', {
                action: 'sendMessage',
                squadId: mySquad.id,
                content,
                playerName: displayName,
                playerTitle: (user?.data?.player_title || '').trim(),
            });
            if (res.data?.message) {
                setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? res.data.message : m));
            }
        } catch (e) {
            console.error('[Squad] Failed to send message:', e);
            setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
        }
    };

    const isLeader = myMemberRecord?.role === 'leader';
    const isOfficer = myMemberRecord?.role === 'officer';
    const canModerate = isLeader || isOfficer; // approve/deny join requests, kick

    const handleRequestJoin = async (squadId) => {
        if (!user) return;
        try {
            SoundManager.playUIClick();
            const res = await base44.functions.invoke('squadActions', { action: 'requestJoin', squadId });
            if (!res.data?.success) {
                toast({ title: "Error", description: res.data?.error || "Failed to send request." });
                return;
            }
            toast({ title: "Request Sent", description: "The squad's leaders will review your request." });
        } catch (e) {
            toast({ title: "Error", description: e?.message || "Failed to send request." });
        }
    };

    const handleSetRank = async (member, rank) => {
        if (!isLeader) return;
        try {
            SoundManager.playUIClick();
            const res = await base44.functions.invoke('squadActions', {
                action: 'setRank',
                squadId: mySquad.id,
                targetMemberId: member.id,
                rank,
            });
            if (!res.data?.success) {
                toast({ title: "Error", description: res.data?.error || "Failed to update rank." });
                return;
            }
            setSquadMembers(prev => prev.map(m => m.id === member.id ? { ...m, role: rank } : m));
            toast({
                title: rank === 'officer' ? 'Promoted to Officer' : 'Demoted to Member',
                description: sanitizePilotName(member.player_name, member.wallet_address),
            });
        } catch (e) {
            toast({ title: "Error", description: e?.message || "Failed." });
        }
    };

    const reloadMembers = async () => {
        // getSquadProfile already returns the squad record — use that instead
        // of doing a second Squad.get round-trip (was halving the squad call
        // budget on every member-list refresh).
        try {
            const res = await base44.functions.invoke('getSquadProfile', { squadId: mySquad.id });
            if (res.data?.success) {
                setSquadMembers(res.data.members);
                if (res.data.squad) setMySquad(prev => ({ ...prev, ...res.data.squad }));
            }
        } catch {}
    };

    const handleKickMember = async (member) => {
        if (!isLeader) return;
        try {
            SoundManager.playUIClick();
            const res = await base44.functions.invoke('squadActions', {
                action: 'kick',
                squadId: mySquad.id,
                targetMemberId: member.id,
            });
            if (!res.data?.success) {
                toast({ title: "Error", description: res.data?.error || "Failed to kick member." });
                return;
            }
            setSquadMembers(prev => prev.filter(m => m.id !== member.id));
            toast({ title: "Member Kicked", description: `${sanitizePilotName(member.player_name, member.wallet_address)} has been removed.` });
        } catch (e) {
            console.error(e);
        }
    };

    const handleTransferLeadership = async (member) => {
        if (!isLeader) return;
        // 2026-07-06: gate behind confirm dialog — accidental mis-taps on the small
        // crown icon (right next to Kick) were transferring leadership silently.
        setPendingTransferMember(member);
    };

    const confirmTransferLeadership = async () => {
        const member = pendingTransferMember;
        if (!isLeader || !member) return;
        setIsTransferringLeadership(true);
        try {
            SoundManager.playUIClick();
            const res = await base44.functions.invoke('squadActions', {
                action: 'transferLeadership',
                squadId: mySquad.id,
                targetMemberId: member.id,
            });
            if (!res.data?.success) {
                toast({ title: "Error", description: res.data?.error || "Failed to transfer leadership." });
                return;
            }
            const { newLeaderMemberId, oldLeaderMemberId } = res.data;
            setMyMemberRecord(prev => ({ ...prev, role: 'member' }));
            setSquadMembers(prev => prev.map(m => {
                if (m.id === oldLeaderMemberId) return { ...m, role: 'member' };
                if (m.id === newLeaderMemberId) return { ...m, role: 'leader' };
                return m;
            }));
            toast({ title: "Leadership Transferred", description: `${sanitizePilotName(member.player_name, member.wallet_address)} is now the leader.` });
            setPendingTransferMember(null);
        } catch (e) {
            console.error(e);
        } finally {
            setIsTransferringLeadership(false);
        }
    };

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        if (!editName.trim() || !editTag.trim()) return;
        setIsSavingSettings(true);
        try {
            const res = await base44.functions.invoke('squadActions', {
                action: 'saveSettings',
                squadId: mySquad.id,
                name: editName.trim(),
                tag: editTag.trim(),
                description: editDesc.trim(),
                icon: editIcon,
                privacy: editPrivacy,
            });
            if (!res.data?.success) {
                toast({ title: "Error", description: res.data?.error || "Failed to save settings." });
                return;
            }
            if (res.data.squad) setMySquad(res.data.squad);
            toast({ title: "Settings Saved", description: "Squad info has been updated." });
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Failed to save settings." });
        }
        setIsSavingSettings(false);
    };

    const handleClaimWeekly = async () => {
        if (!mySquad || !myMemberRecord) return;
        if (claimingWeekly) return; // already in flight — block repeat taps
        const currentWeek = getCurrentWeek();
        const tier = getBountyTier(mySquad.level || 1);

        if ((mySquad.weekly_kills || 0) >= tier.target && myMemberRecord.last_payout_week !== currentWeek) {
            setClaimingWeekly(true);
            try {
                SoundManager.playLevelUp();
                const res = await base44.functions.invoke('squadActions', {
                    action: 'claimWeekly',
                    memberId: myMemberRecord.id,
                    squadId: mySquad.id,
                    currentWeek,
                });
                if (!res.data?.success) { toast({ title: "Error", description: res.data?.error }); return; }

                // Apply server-authoritative totals to local save
                const currentSave = SaveManager.load();
                if (res.data.saveData?.gold !== undefined) currentSave.gold = res.data.saveData.gold;
                if (res.data.saveData?.relicFragments !== undefined) currentSave.relicFragments = res.data.saveData.relicFragments;
                SaveManager.save(currentSave);
                setMyMemberRecord(res.data.member);
                toast({ title: "Weekly Bounty Claimed!", description: `You received ${res.data.reward.gold.toLocaleString()} Gold and ${res.data.reward.fragments} Relic Fragments!` });
            } catch (e) {
                console.error(e);
            } finally {
                setClaimingWeekly(false);
            }
        }
    };

    const handleClaimDaily = async () => {
        if (!mySquad || !myMemberRecord) return;
        if (claimingDaily) return; // already in flight — block repeat taps
        const currentDay = getCurrentDayUTC();
        const tier = getDailyBountyTier(mySquad.level || 1);

        if ((mySquad.daily_kills || 0) >= tier.target && myMemberRecord.last_daily_payout_date !== currentDay) {
            setClaimingDaily(true);
            try {
                SoundManager.playGoldPickup();
                const res = await base44.functions.invoke('squadActions', {
                    action: 'claimDaily',
                    memberId: myMemberRecord.id,
                    squadId: mySquad.id,
                    currentDay,
                });
                if (!res.data?.success) { toast({ title: "Error", description: res.data?.error }); return; }

                // Apply server-authoritative totals to local save
                const currentSave = SaveManager.load();
                if (res.data.saveData?.gold !== undefined) currentSave.gold = res.data.saveData.gold;
                if (res.data.saveData?.relicFragments !== undefined) currentSave.relicFragments = res.data.saveData.relicFragments;
                SaveManager.save(currentSave);
                setMyMemberRecord(res.data.member);
                const dGold = res.data.reward.gold;
                const dFrag = res.data.reward.fragments;
                const dXp = res.data.dailyXpAwarded || 0;
                const xpSuffix = dXp > 0 ? ` Squad earned ${dXp.toLocaleString()} XP!` : '';
                toast({ title: "Daily Bounty Claimed!", description: `You received ${dGold.toLocaleString()} Gold${dFrag > 0 ? ` and ${dFrag} Relic Fragments` : ''}!${xpSuffix}` });
            } catch (e) {
                console.error(e);
            } finally {
                setClaimingDaily(false);
            }
        }
    };

    if (!user) return <div className="p-8 text-white">Loading...</div>;

    return (
        <OmenXGate isCarousel={isCarousel}>
        <div className={`${isCarousel ? 'h-full flex flex-col' : 'h-[100dvh] flex flex-col'} relative text-slate-200 p-2 pb-2 md:p-6 font-sans overflow-hidden`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col min-h-0">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 mb-4 md:mb-6 border-b border-slate-800 pb-2 md:pb-4 shrink-0">
                    <div>
                        {!isCarousel && (
                            <button 
                                onClick={() => { SoundManager.playUIClick(); navigate('/'); }}
                                className="mb-2 md:mb-4 flex items-center gap-1.5 md:gap-2 text-slate-400 hover:text-white transition-colors font-bold text-xs md:text-sm bg-slate-900 px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-slate-700 w-fit"
                            >
                                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Main Menu
                            </button>
                        )}
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-2" style={{ background: 'linear-gradient(90deg, #F59E0B, #F97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(245,158,11,0.5))' }}>
                            <Users className="w-6 h-6 md:w-8 md:h-8 text-amber-400" /> SLOTH SQUADS
                        </h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">Team up, slay together, earn rewards.</p>
                    </div>
                    <CurrencyHeader />
                </header>

                {!mySquad ? (
                    // --- NO SQUAD VIEW ---
                    <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden min-h-0">
                        <div className="flex-1 bg-[#0b0416]/60 backdrop-blur-xl rounded-xl border border-orange-500/30 p-4 flex flex-col overflow-hidden min-h-0 shadow-[0_0_30px_rgba(249,115,22,0.15)]">
                            <div className="flex justify-between items-center mb-4 shrink-0">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Search className="w-5 h-5 text-cyan-400" /> Find a Squad
                                </h2>

                                <button 
                                    onClick={() => setIsCreating(!isCreating)}
                                    className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded-lg font-bold text-sm flex items-center gap-1 transition-colors"
                                >
                                    <Plus className="w-4 h-4" /> Create Squad
                                </button>
                            </div>
                            
                            {isCreating ? (
                                <form onSubmit={handleCreateSquad} className="bg-slate-800 p-4 rounded-lg border border-slate-700 space-y-4 shrink-0">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">Squad Name</label>
                                        <input 
                                            required maxLength={20}
                                            value={newSquadName} onChange={e => setNewSquadName(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-orange-500"
                                            placeholder="e.g. Astro Sloths"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">Tag (Max 4 chars)</label>
                                        <input 
                                            required maxLength={4}
                                            value={newSquadTag} onChange={e => setNewSquadTag(e.target.value.toUpperCase())}
                                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-orange-500 uppercase"
                                            placeholder="ASTR"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">Description</label>
                                        <input 
                                            maxLength={50}
                                            value={newSquadDesc} onChange={e => setNewSquadDesc(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-orange-500"
                                            placeholder="Chill vibes only"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-500 text-white py-2 rounded font-bold transition-colors">
                                            Create
                                        </button>
                                        <button type="button" onClick={() => setIsCreating(false)} className="px-4 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded font-bold transition-colors">
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                                    {allSquads.length === 0 ? (
                                        <div className="text-center text-slate-500 py-8">No squads found. Be the first to create one!</div>
                                    ) : (
                                        allSquads.map(squad => {
                                            const lvl = getSquadLevel(squad.xp || 0);
                                            return (
                                            <button
                                                key={squad.id}
                                                type="button"
                                                onClick={() => { SoundManager.playUIClick(); setProfileSquadId(squad.id); }}
                                                className="w-full text-left bg-slate-800 hover:bg-slate-750 hover:border-cyan-500/60 p-3 rounded-lg flex justify-between items-center transition-colors cursor-pointer"
                                                style={{ border: `1px solid ${lvl.borderColor}50` }}
                                            >
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg w-6 h-6 inline-flex items-center justify-center overflow-hidden rounded-md shrink-0">
                                                            {(squad.icon || lvl.badge).startsWith('http') ? <img src={squad.icon} className="w-full h-full object-cover" alt="squad" /> : (squad.icon || lvl.badge)}
                                                        </span>
                                                        <span className="font-bold text-white text-lg">{squad.name}</span>
                                                        <span className="px-1.5 py-0.5 rounded text-xs border bg-slate-900"
                                                            style={{ color: lvl.borderColor, borderColor: lvl.borderColor + '60' }}
                                                        >[{squad.tag}]</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                            style={{ color: lvl.borderColor, background: lvl.glowColor }}
                                                        >Lv.{lvl.level} {lvl.name}</span>
                                                        {squad.privacy === 'request' && (
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-700/50 flex items-center gap-1">
                                                                <ShieldQuestion className="w-2.5 h-2.5" /> Invite-Only
                                                            </span>
                                                        )}
                                                        {squad.privacy === 'closed' && (
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700 flex items-center gap-1">
                                                                <Lock className="w-2.5 h-2.5" /> Closed
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-slate-400 mt-1">{squad.description || 'No description'}</div>
                                                    <div className="text-xs text-slate-500 mt-0.5">
                                                        <Users className="w-3 h-3 inline mr-1" />
                                                        {squad.member_count || 1}/{MAX_SQUAD_MEMBERS} Members
                                                    </div>
                                                </div>
                                                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest shrink-0 ml-2">
                                                    View →
                                                </span>
                                            </button>
                                        )})
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // --- IN SQUAD VIEW ---
                    <div className="flex-1 flex flex-col md:flex-row gap-3 md:gap-4 overflow-hidden min-h-0">
                        {/* MOBILE: Compact squad info bar — full LEFT PANEL on desktop */}
                        {(() => {
                            const squadXp = mySquad.xp || 0;
                            const lvlData = getSquadLevel(squadXp);
                            const nextLvl = getNextSquadLevel(squadXp);
                            const xpProgress = getSquadXpProgress(squadXp);
                            const tier = getBountyTier(mySquad.level || 1);
                            const kills = mySquad.weekly_kills || 0;
                            const isComplete = kills >= tier.target;
                            const isClaimed = myMemberRecord?.last_payout_week === getCurrentWeek();
                            
                            const dailyTier = getDailyBountyTier(mySquad.level || 1);
                            const dailyKills = mySquad.daily_kills || 0;
                            const isDailyComplete = dailyKills >= dailyTier.target;
                            const isDailyClaimed = myMemberRecord?.last_daily_payout_date === getCurrentDayUTC();
                            return (
                                <>
                                {/* MOBILE compact strip */}
                                <div className="md:hidden bg-[#0b0416]/80 backdrop-blur-xl rounded-xl p-3 shrink-0" style={{ border: `2px solid ${lvlData.borderColor}`, boxShadow: `0 0 20px ${lvlData.glowColor}` }}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-xl shrink-0 w-8 h-8 inline-flex items-center justify-center overflow-hidden rounded-md">
                                                {(mySquad.icon || lvlData.badge).startsWith('http') ? <img src={mySquad.icon} className="w-full h-full object-cover" alt="squad" /> : (mySquad.icon || lvlData.badge)}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-bold text-white text-sm truncate">{mySquad.name}</span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded border shrink-0" style={{ color: lvlData.borderColor, borderColor: lvlData.borderColor + '60', background: lvlData.glowColor }}>
                                                        [{mySquad.tag}] Lv.{lvlData.level}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => { SoundManager.playUIClick(); setShowLeaveConfirm(true); }} className="text-xs text-red-400 bg-red-950/30 px-2 py-1 rounded border border-red-900/50 shrink-0 ml-2">
                                            Leave
                                        </button>
                                    </div>
                                    {/* XP bar */}
                                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${xpProgress}%`, background: lvlData.borderColor }} />
                                    </div>
                                    {/* Daily Bounty progress row */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <Shield className="w-3 h-3 text-cyan-400 shrink-0" />
                                        <span className="text-[10px] text-slate-400 flex-1 truncate">{dailyTier.label}: {Math.min(dailyKills, dailyTier.target).toLocaleString()}/{dailyTier.target.toLocaleString()}</span>
                                        <div className="w-20 bg-slate-800 h-2 rounded-full overflow-hidden shrink-0">
                                            <div className="bg-gradient-to-r from-cyan-600 to-cyan-300 h-full" style={{ width: `${Math.min(100, (dailyKills / dailyTier.target) * 100)}%` }} />
                                        </div>
                                        {isDailyComplete && !isDailyClaimed && (
                                            <button onClick={handleClaimDaily} disabled={claimingDaily} className="text-[10px] bg-emerald-600 disabled:bg-slate-700 disabled:opacity-60 text-white px-2 py-0.5 rounded font-bold animate-pulse shrink-0">
                                                {claimingDaily ? '…' : 'CLAIM'}
                                            </button>
                                        )}
                                        {isDailyClaimed && <span className="text-[10px] text-emerald-500 font-bold shrink-0">✓ Claimed</span>}
                                    </div>
                                    {/* Weekly Bounty progress row */}
                                    <div className="flex items-center gap-2">
                                        <Shield className="w-3 h-3 text-yellow-400 shrink-0" />
                                        <span className="text-[10px] text-slate-400 flex-1 truncate">{tier.label}: {Math.min(kills, tier.target).toLocaleString()}/{tier.target.toLocaleString()}</span>
                                        <div className="w-20 bg-slate-800 h-2 rounded-full overflow-hidden shrink-0">
                                            <div className="bg-gradient-to-r from-orange-600 to-yellow-400 h-full" style={{ width: `${Math.min(100, (kills / tier.target) * 100)}%` }} />
                                        </div>
                                        {isComplete && !isClaimed && (
                                            <button onClick={handleClaimWeekly} disabled={claimingWeekly} className="text-[10px] bg-emerald-600 disabled:bg-slate-700 disabled:opacity-60 text-white px-2 py-0.5 rounded font-bold animate-pulse shrink-0">
                                                {claimingWeekly ? '…' : 'CLAIM'}
                                            </button>
                                        )}
                                        {isClaimed && <span className="text-[10px] text-emerald-500 font-bold shrink-0">✓ Claimed</span>}
                                    </div>
                                </div>

                                {/* DESKTOP full left panel */}
                                <div className="hidden md:flex w-80 flex-col gap-4 shrink-0 overflow-y-auto min-h-0 pr-1">
                                    <div className="bg-[#0b0416]/80 backdrop-blur-xl rounded-xl p-4" style={{ border: `2px solid ${lvlData.borderColor}`, boxShadow: `0 0 30px ${lvlData.glowColor}` }}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-2xl shrink-0 w-8 h-8 inline-flex items-center justify-center overflow-hidden rounded-md">
                                                        {(mySquad.icon || lvlData.badge).startsWith('http') ? <img src={mySquad.icon} className="w-full h-full object-cover" alt="squad" /> : (mySquad.icon || lvlData.badge)}
                                                    </span>
                                                    <h2 className="text-xl font-bold text-white">{mySquad.name}</h2>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-slate-800 px-1.5 py-0.5 rounded text-xs border" style={{ color: lvlData.borderColor, borderColor: lvlData.borderColor + '60' }}>
                                                        [{mySquad.tag}]
                                                    </span>
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: lvlData.borderColor, background: lvlData.glowColor }}>
                                                        Lv.{lvlData.level} {lvlData.name}
                                                    </span>
                                                </div>
                                            </div>
                                            <button onClick={() => { SoundManager.playUIClick(); setShowLeaveConfirm(true); }} className="text-xs text-red-400 hover:text-red-300 bg-red-950/30 px-2 py-1 rounded border border-red-900/50">
                                                Leave
                                            </button>
                                        </div>
                                        <p className="text-sm text-slate-400 mb-3">{mySquad.description}</p>
                                        <div className="mb-4">
                                            <div className="flex justify-between text-xs font-bold mb-1">
                                                <span style={{ color: lvlData.borderColor }}>Squad XP</span>
                                                {nextLvl ? (
                                                    <span className="text-slate-400">{squadXp.toLocaleString()} / {nextLvl.xpRequired.toLocaleString()}</span>
                                                ) : (
                                                    <span className="text-yellow-400">MAX LEVEL</span>
                                                )}
                                            </div>
                                            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                                                <div className="h-full transition-all duration-700 rounded-full" style={{ width: `${xpProgress}%`, background: `linear-gradient(to right, ${lvlData.borderColor}99, ${lvlData.borderColor})` }} />
                                            </div>
                                            {nextLvl && <div className="text-[10px] text-slate-500 mt-1">Next: {nextLvl.badge} {nextLvl.name} — earned at end of each week</div>}
                                        </div>
                                        <div className="border-t border-slate-800 pt-4 flex flex-col gap-4">
                                            {/* Daily Bounty */}
                                            <div className="bg-slate-900/50 rounded-xl p-3 border border-cyan-900/40">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                                                        <Shield className="w-4 h-4" /> {dailyTier.label} (Daily)
                                                    </h3>
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-cyan-500/50 bg-cyan-950/50 text-cyan-300">
                                                        Lv.{mySquad.level || 1}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-300 mb-2">Defeat {dailyTier.target.toLocaleString()} enemies today.</div>
                                                <div className="text-[10px] text-emerald-400 font-bold mb-2 flex items-center gap-1">
                                                    ⚡ +{(mySquad.level >= 7 ? 2000 : [500,700,900,1200,1500,1800][Math.max(0, (mySquad.level || 1) - 1)]).toLocaleString()} Squad XP on first daily claim
                                                </div>
                                                <div className="flex gap-2 mb-3">
                                                    <div className="flex-1 bg-slate-800/60 rounded-lg p-2 text-center border border-slate-700 flex flex-col items-center">
                                                        <Coins className="w-4 h-4 fill-yellow-500 text-yellow-500 mb-1" />
                                                        <div className="text-xs font-bold text-yellow-400">{dailyTier.gold.toLocaleString()} Gold</div>
                                                    </div>
                                                    {dailyTier.fragments > 0 && (
                                                        <div className="flex-1 bg-slate-800/60 rounded-lg p-2 text-center border border-slate-700 flex flex-col items-center">
                                                            <Puzzle className="w-4 h-4 fill-fuchsia-400 text-fuchsia-400 mb-1" />
                                                            <div className="text-xs font-bold text-fuchsia-400">{dailyTier.fragments} Fragments</div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex justify-between text-xs font-bold mb-1">
                                                    <span className="text-slate-400">Progress</span>
                                                    <span className="text-white">{Math.min(dailyKills, dailyTier.target).toLocaleString()} / {dailyTier.target.toLocaleString()}</span>
                                                </div>
                                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700 mb-3">
                                                    <div className="bg-gradient-to-r from-cyan-600 to-cyan-300 h-full transition-all duration-500" style={{ width: `${Math.min(100, (dailyKills / dailyTier.target) * 100)}%` }} />
                                                </div>
                                                {isDailyComplete && !isDailyClaimed ? (
                                                    <button onClick={handleClaimDaily} disabled={claimingDaily} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:opacity-60 disabled:animate-none text-white font-bold py-1.5 text-xs rounded-lg flex items-center justify-center gap-1.5 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                                                        <Gift className="w-3 h-3" /> {claimingDaily ? 'CLAIMING…' : 'CLAIM DAILY'}
                                                    </button>
                                                ) : isDailyClaimed ? (
                                                    <div className="text-center text-xs font-bold text-emerald-500 bg-emerald-950/30 py-1.5 rounded-lg border border-emerald-900/50">
                                                        ✓ CLAIMED FOR TODAY
                                                    </div>
                                                ) : null}
                                            </div>

                                            {/* Weekly Bounty */}
                                            <div className="bg-slate-900/50 rounded-xl p-3 border border-yellow-900/40">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-sm font-bold text-yellow-400 flex items-center gap-2">
                                                        <Shield className="w-4 h-4" /> {tier.label} (Weekly)
                                                    </h3>
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-yellow-500/50 bg-yellow-950/50 text-yellow-300">
                                                        Lv.{mySquad.level || 1}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-300 mb-2">Defeat {tier.target.toLocaleString()} enemies this week.</div>
                                                <div className="flex gap-2 mb-3">
                                                    <div className="flex-1 bg-slate-800/60 rounded-lg p-2 text-center border border-slate-700 flex flex-col items-center">
                                                        <Coins className="w-4 h-4 fill-yellow-500 text-yellow-500 mb-1" />
                                                        <div className="text-xs font-bold text-yellow-400">{tier.gold.toLocaleString()} Gold</div>
                                                    </div>
                                                    <div className="flex-1 bg-slate-800/60 rounded-lg p-2 text-center border border-slate-700 flex flex-col items-center">
                                                        <Puzzle className="w-4 h-4 fill-fuchsia-400 text-fuchsia-400 mb-1" />
                                                        <div className="text-xs font-bold text-fuchsia-400">{tier.fragments} Fragments</div>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between text-xs font-bold mb-1">
                                                    <span className="text-slate-400">Progress</span>
                                                    <span className="text-white">{Math.min(kills, tier.target).toLocaleString()} / {tier.target.toLocaleString()}</span>
                                                </div>
                                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700 mb-3">
                                                    <div className="bg-gradient-to-r from-orange-600 to-yellow-400 h-full transition-all duration-500" style={{ width: `${Math.min(100, (kills / tier.target) * 100)}%` }} />
                                                </div>
                                                {isComplete && !isClaimed ? (
                                                    <button onClick={handleClaimWeekly} disabled={claimingWeekly} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:opacity-60 disabled:animate-none text-white font-bold py-1.5 text-xs rounded-lg flex items-center justify-center gap-1.5 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                                                        <Gift className="w-3 h-3" /> {claimingWeekly ? 'CLAIMING…' : 'CLAIM WEEKLY'}
                                                    </button>
                                                ) : isClaimed ? (
                                                    <div className="text-center text-xs font-bold text-emerald-500 bg-emerald-950/30 py-1.5 rounded-lg border border-emerald-900/50">
                                                        ✓ CLAIMED FOR THIS WEEK
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                </>
                            );
                        })()}

                        {/* RIGHT PANEL: CHAT, MEMBERS & SETTINGS */}
                        <div className="flex-1 bg-[#0b0416]/80 backdrop-blur-xl border border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.15)] rounded-xl flex flex-col overflow-hidden min-h-0">
                            <div className="m-2 mb-0 flex flex-col sm:flex-row gap-2">
                                <button
                                    onClick={() => {
                                        SoundManager.playUIClick();
                                        // Inside the carousel, Squad Wars is slide 6 — navigate to / with
                                        // ?slide=6 so the carousel snaps to it. Standalone /squads route
                                        // can use the regular /squad-wars route.
                                        if (isCarousel) navigate('/?slide=6');
                                        else navigate('/squad-wars');
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-red-600/30 to-amber-600/30 border border-red-500/50 hover:border-red-400 text-red-200 hover:text-white font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                                >
                                    <Swords className="w-4 h-4" /> Squad Wars
                                </button>
                                {isS6OrLater() ? (
                                    <button
                                        onClick={() => { SoundManager.playUIClick(); navigate('/squad-meteor'); }}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-purple-600/40 to-fuchsia-600/40 border border-purple-400/60 hover:border-purple-300 text-purple-100 hover:text-white font-black text-xs uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.7)] animate-pulse"
                                    >
                                        <span className="text-base">☄️</span> Squad Meteor
                                        <span className="text-[9px] bg-purple-500/50 px-1.5 py-0.5 rounded text-white">NEW</span>
                                    </button>
                                ) : (
                                    <button
                                        disabled
                                        title="Unlocks with Season 6 (Mon May 18 00:00 UTC)"
                                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-500 font-black text-xs uppercase tracking-widest cursor-not-allowed opacity-70"
                                    >
                                        <Lock className="w-3.5 h-3.5" /> Squad Meteor
                                        <span className="text-[9px] bg-purple-500/30 px-1.5 py-0.5 rounded text-purple-300 border border-purple-500/40">S6</span>
                                    </button>
                                )}
                                {isLeader && (
                                    <button
                                        onClick={() => { SoundManager.playUIClick(); navigate('/squad-leader'); }}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-amber-600/30 to-orange-600/30 border border-amber-500/50 hover:border-amber-400 text-amber-200 hover:text-white font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                                    >
                                        <Crown className="w-4 h-4" /> Leader Dashboard
                                    </button>
                                )}
                            </div>
                            <div className="flex border-b border-slate-800 shrink-0">
                                <button 
                                    onClick={() => setActiveTab('chat')}
                                    className={`flex-1 py-3 font-bold text-sm flex justify-center items-center gap-2 ${activeTab === 'chat' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800/30'}`}
                                >
                                    <MessageSquare className="w-4 h-4" /> Chat
                                </button>
                                <button 
                                    onClick={() => setActiveTab('members')}
                                    className={`flex-1 py-3 font-bold text-sm flex justify-center items-center gap-2 ${activeTab === 'members' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800/30'}`}
                                >
                                    <Users className="w-4 h-4" /> Members ({squadMembers.length}/{MAX_SQUAD_MEMBERS})
                                </button>
                                <button
                                    onClick={() => { setActiveTab('browse'); loadBrowseSquads(); }}
                                    className={`flex-1 py-3 font-bold text-sm flex justify-center items-center gap-2 ${activeTab === 'browse' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800/30'}`}
                                >
                                    <Globe className="w-4 h-4" /> <span className="hidden sm:inline">Browse</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('treasury')}
                                    className={`flex-1 py-3 font-bold text-sm flex justify-center items-center gap-2 ${activeTab === 'treasury' ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800/30'}`}
                                >
                                    <Vault className="w-4 h-4" /> <span className="hidden sm:inline">Treasury</span>
                                </button>
                                {isLeader && (
                                    <button 
                                        onClick={() => setActiveTab('settings')}
                                        className={`flex-1 py-3 font-bold text-sm flex justify-center items-center gap-2 ${activeTab === 'settings' ? 'text-orange-400 border-b-2 border-orange-400 bg-slate-800/50' : 'text-slate-400 hover:bg-slate-800/30'}`}
                                    >
                                        <Settings className="w-4 h-4" /> Settings
                                    </button>
                                )}
                            </div>
                            
                            {activeTab === 'chat' ? (
                                <>
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                        {messages.length === 0 ? (
                                            <div className="text-center text-slate-500 mt-10">No messages yet. Say hi!</div>
                                        ) : (
                                            messages.map(msg => (
                                                <div key={msg.id} className={`flex flex-col ${msg.wallet_address === user.wallet_address ? 'items-end' : 'items-start'}`}>
                                                    {msg.wallet_address === 'system' ? (
                                                        <div className="w-full text-center text-xs text-slate-500 my-2 italic">
                                                            {sanitizeSystemMessage(msg.content)}
                                                        </div>
                                                    ) : (
                                                        <div className={`max-w-[70%] rounded-lg p-2 ${
                                                            msg.wallet_address === user.wallet_address 
                                                                ? 'bg-cyan-900/50 text-white border border-cyan-800' 
                                                                : 'bg-slate-800 text-slate-200 border border-slate-700'
                                                        }`}>
                                                            <div className="text-[10px] font-bold opacity-50 mb-0.5 flex items-center gap-1">
                                                                {sanitizePilotName(msg.player_name, msg.wallet_address)}
                                                                {msg.player_title && <span className="px-1 bg-slate-900/50 rounded text-[8px] tracking-wider text-amber-300">{msg.player_title}</span>}
                                                            </div>
                                                            <div className="text-sm break-words">
                                                                {msg.content}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                        <div ref={chatEndRef} />
                                    </div>
                                    <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-900 shrink-0 flex gap-2">
                                        <input 
                                            type="text"
                                            value={newMessage}
                                            onChange={e => setNewMessage(e.target.value)}
                                            placeholder="Type a message..."
                                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
                                            maxLength={200}
                                        />
                                        <button 
                                            type="submit"
                                            disabled={!newMessage.trim()}
                                            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center"
                                        >
                                            <Send className="w-5 h-5" />
                                        </button>
                                    </form>
                                </>
                            ) : activeTab === 'members' ? (
                                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                    <button
                                        onClick={() => { SoundManager.playUIClick(); setProfileSquadId(mySquad.id); }}
                                        className="w-full mb-2 bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-200 hover:text-white border border-cyan-700/50 hover:border-cyan-400 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                                    >
                                        📊 View Full Squad Profile & Member Stats
                                    </button>
                                    {/* Join request inbox — only visible to leaders + officers when squad is invite-only */}
                                    {canModerate && mySquad.privacy === 'request' && (
                                        <JoinRequestsPanel squadId={mySquad.id} onApproved={reloadMembers} />
                                    )}
                                    {squadMembers.map(member => {
                                        const memberWallet = (member.wallet_address || '').toLowerCase();
                                        const myWallet = (user.wallet_address || '').toLowerCase();
                                        const hasStats = member.weekly_kills !== undefined;
                                        const safeName = sanitizePilotName(member.player_name, member.wallet_address);
                                        return (
                                        <div key={member.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-400 shrink-0">
                                                        {safeName.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                                                            {member.role === 'leader' && <Crown className="w-3 h-3 text-yellow-400 shrink-0" />}
                                                            {member.role === 'officer' && <Star className="w-3 h-3 text-cyan-400 shrink-0 fill-cyan-400" />}
                                                            <span className="truncate">{safeName}</span>
                                                            {member.player_title && <span className="text-[9px] bg-slate-900/80 text-amber-300 px-1.5 py-0.5 rounded border border-amber-900/50 tracking-wider">{member.player_title}</span>}
                                                            {memberWallet === myWallet && <span className="text-[10px] bg-cyan-900 text-cyan-400 px-1.5 rounded">YOU</span>}
                                                        </div>
                                                        <div className="text-xs text-slate-400 capitalize">{member.role}</div>
                                                    </div>
                                                </div>
                                                {memberWallet !== myWallet && (
                                                    <div className="flex flex-wrap gap-2 shrink-0 justify-end">
                                                        {/* Leader-only: transfer leadership + promote/demote officer */}
                                                        {isLeader && member.role !== 'leader' && (
                                                            member.role === 'officer' ? (
                                                                <button
                                                                    onClick={() => handleSetRank(member, 'member')}
                                                                    className="text-xs text-slate-400 hover:text-white bg-slate-900/40 px-2 py-1 rounded border border-slate-700 flex items-center gap-1"
                                                                    title="Demote to Member"
                                                                >
                                                                    <Star className="w-3 h-3" /> Demote
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleSetRank(member, 'officer')}
                                                                    className="text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-950/30 px-2 py-1 rounded border border-cyan-900/50 flex items-center gap-1"
                                                                    title="Promote to Officer"
                                                                >
                                                                    <Star className="w-3 h-3" /> Officer
                                                                </button>
                                                            )
                                                        )}
                                                        {isLeader && member.role !== 'leader' && (
                                                            <button
                                                                onClick={() => handleTransferLeadership(member)}
                                                                className="text-xs text-yellow-400 hover:text-yellow-300 bg-yellow-950/30 px-2 py-1 rounded border border-yellow-900/50 flex items-center gap-1"
                                                                title="Transfer Leadership"
                                                            >
                                                                <Crown className="w-3 h-3" /> Lead
                                                            </button>
                                                        )}
                                                        {/* Leader can kick anyone (except self). Officers can kick non-officers / non-leaders. */}
                                                        {((isLeader && member.role !== 'leader') ||
                                                          (isOfficer && member.role === 'member')) && (
                                                            <button
                                                                onClick={() => handleKickMember(member)}
                                                                className="text-xs text-red-400 hover:text-red-300 bg-red-950/30 px-2 py-1 rounded border border-red-900/50 flex items-center gap-1"
                                                                title="Kick Member"
                                                            >
                                                                <UserX className="w-3 h-3" /> Kick
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {hasStats && (
                                                <div className="grid grid-cols-4 gap-1.5 mt-2.5 pt-2.5 border-t border-slate-700/50">
                                                    <div className="bg-slate-900/60 rounded px-1 py-1 text-center border border-slate-700/40">
                                                        <div className="text-xs font-black text-yellow-400 truncate">{(member.weekly_kills || 0).toLocaleString()}</div>
                                                        <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold">Weekly</div>
                                                    </div>
                                                    <div className="bg-slate-900/60 rounded px-1 py-1 text-center border border-slate-700/40">
                                                        <div className="text-xs font-black text-cyan-400 truncate">{(member.total_kills || 0).toLocaleString()}</div>
                                                        <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold">All-Time</div>
                                                    </div>
                                                    <div className="bg-slate-900/60 rounded px-1 py-1 text-center border border-slate-700/40">
                                                        <div className="text-xs font-black text-red-400 truncate">{(member.raid_damage_this_week || 0).toLocaleString()}</div>
                                                        <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold">Raid DMG</div>
                                                    </div>
                                                    <div className="bg-slate-900/60 rounded px-1 py-1 text-center border border-slate-700/40">
                                                        <div className="text-xs font-black text-amber-400 truncate">{(member.war_wins_claimed || 0).toLocaleString()}</div>
                                                        <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold">War Wins</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );})}
                                </div>
                            ) : activeTab === 'treasury' ? (
                                <div className="flex-1 overflow-y-auto min-h-0">
                                    <SquadTreasuryPanel
                                        squad={mySquad}
                                        myMemberRecord={myMemberRecord}
                                        onUpdate={async () => {
                                            try {
                                                const fresh = await base44.entities.Squad.get(mySquad.id);
                                                if (fresh) setMySquad(fresh);
                                            } catch {}
                                        }}
                                    />
                                </div>
                            ) : activeTab === 'browse' ? (
                                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 px-1">
                                        Scout other squads — tap to view their stats & roster
                                    </div>
                                    {allSquads.filter(s => s.id !== mySquad.id).length === 0 ? (
                                        <div className="text-center text-slate-500 py-8 text-sm">No other squads yet.</div>
                                    ) : (
                                        allSquads.filter(s => s.id !== mySquad.id).map(squad => {
                                            const lvl = getSquadLevel(squad.xp || 0);
                                            return (
                                                <button
                                                    key={squad.id}
                                                    type="button"
                                                    onClick={() => { SoundManager.playUIClick(); setProfileSquadId(squad.id); }}
                                                    className="w-full text-left bg-slate-800 hover:bg-slate-750 hover:border-cyan-500/60 p-3 rounded-lg flex justify-between items-center transition-colors cursor-pointer"
                                                    style={{ border: `1px solid ${lvl.borderColor}50` }}
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-lg w-6 h-6 inline-flex items-center justify-center overflow-hidden rounded-md shrink-0">
                                                                {(squad.icon || lvl.badge).startsWith('http') ? <img src={squad.icon} className="w-full h-full object-cover" alt="squad" /> : (squad.icon || lvl.badge)}
                                                            </span>
                                                            <span className="font-bold text-white truncate">{squad.name}</span>
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] border bg-slate-900 shrink-0"
                                                                style={{ color: lvl.borderColor, borderColor: lvl.borderColor + '60' }}>[{squad.tag}]</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                                style={{ color: lvl.borderColor, background: lvl.glowColor }}>Lv.{lvl.level} {lvl.name}</span>
                                                            <span className="text-[10px] text-slate-500"><Users className="w-3 h-3 inline mr-1" />{squad.member_count || 1}/{MAX_SQUAD_MEMBERS}</span>
                                                            {squad.privacy === 'request' && (
                                                                <span className="text-[10px] text-amber-300 font-bold flex items-center gap-1"><ShieldQuestion className="w-2.5 h-2.5" /> Invite-Only</span>
                                                            )}
                                                            {squad.privacy === 'closed' && (
                                                                <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Closed</span>
                                                            )}
                                                            {(squad.war_wins || 0) > 0 && <span className="text-[10px] text-amber-400 font-bold">🏆 {squad.war_wins}W</span>}
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest shrink-0 ml-2">View →</span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto p-4">
                                    <form onSubmit={handleSaveSettings} className="space-y-4">
                                        <div className="relative z-20">
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Squad Icon</label>
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowSquadIconPicker(v => !v)}
                                                    className="w-14 h-14 bg-slate-800 border border-slate-700 hover:border-orange-500 rounded-xl text-3xl flex items-center justify-center transition-colors overflow-hidden"
                                                >
                                                    {editIcon?.startsWith('http') ? <img src={editIcon} className="w-full h-full object-cover" alt="squad" /> : editIcon}
                                                </button>
                                                {showSquadIconPicker && (
                                                    <EmojiPicker
                                                        options={SQUAD_ICONS}
                                                        selected={editIcon}
                                                        onSelect={setEditIcon}
                                                        onClose={() => setShowSquadIconPicker(false)}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Squad Name</label>
                                            <input
                                                required maxLength={20}
                                                value={editName} onChange={e => setEditName(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-orange-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Tag (Max 4 chars)</label>
                                            <input
                                                required maxLength={4}
                                                value={editTag} onChange={e => setEditTag(e.target.value.toUpperCase())}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-orange-500 uppercase"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Description</label>
                                            <input
                                                maxLength={50}
                                                value={editDesc} onChange={e => setEditDesc(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-orange-500"
                                                placeholder="Squad description..."
                                            />
                                        </div>
                                        <PrivacySelector value={editPrivacy} onChange={setEditPrivacy} />
                                        <button
                                            type="submit"
                                            disabled={isSavingSettings}
                                            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-colors"
                                        >
                                            {isSavingSettings ? 'Saving...' : 'Save Changes'}
                                        </button>
                                        <div className="border-t border-slate-700 pt-4">
                                            <h4 className="text-xs font-bold text-red-400 mb-2 uppercase tracking-wider">Danger Zone</h4>
                                            <button
                                                type="button"
                                                onClick={() => { SoundManager.playUIClick(); setShowLeaveConfirm(true); }}
                                                className="w-full bg-red-950/30 hover:bg-red-950/60 text-red-400 font-bold py-2.5 rounded-lg border border-red-900/50 transition-colors"
                                            >
                                                Disband / Leave Squad
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
        {pendingTransferMember && (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                onClick={() => { if (!isTransferringLeadership) setPendingTransferMember(null); }}
            >
                <div
                    className="bg-[#0b0416] border-2 border-yellow-500/60 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_40px_rgba(245,158,11,0.3)]"
                    onClick={e => e.stopPropagation()}
                >
                    <h3 className="text-xl font-black text-yellow-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Crown className="w-5 h-5" /> Transfer Leadership?
                    </h3>
                    <p className="text-sm text-slate-300 mb-2">
                        Make <span className="font-bold text-white">{sanitizePilotName(pendingTransferMember.player_name, pendingTransferMember.wallet_address)}</span> the new squad leader?
                    </p>
                    <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/50 rounded-lg p-2 mb-5">
                        ⚠️ You will lose leader privileges. Only the new leader can transfer it back.
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPendingTransferMember(null)}
                            disabled={isTransferringLeadership}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg border border-slate-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmTransferLeadership}
                            disabled={isTransferringLeadership}
                            className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg transition-colors"
                        >
                            {isTransferringLeadership ? 'Transferring…' : 'Transfer'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        {showLeaveConfirm && (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                onClick={() => { if (!isLeaving) setShowLeaveConfirm(false); }}
            >
                <div
                    className="bg-[#0b0416] border-2 border-red-500/60 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_40px_rgba(239,68,68,0.3)]"
                    onClick={e => e.stopPropagation()}
                >
                    <h3 className="text-xl font-black text-red-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <UserX className="w-5 h-5" /> Leave Squad?
                    </h3>
                    <p className="text-sm text-slate-300 mb-2">
                        Are you sure you want to leave <span className="font-bold text-white">{mySquad?.name}</span>?
                    </p>
                    <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/50 rounded-lg p-2 mb-5">
                        ⚠️ You won't be able to join or create a new squad for <span className="font-bold">24 hours</span>.
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowLeaveConfirm(false)}
                            disabled={isLeaving}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg border border-slate-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleLeaveSquad}
                            disabled={isLeaving}
                            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg transition-colors"
                        >
                            {isLeaving ? 'Leaving…' : 'Leave Squad'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        {profileSquadId && (() => {
            // If viewing a squad in the browser (not own squad) and not already in one, allow joining from the modal.
            const browsing = !mySquad && allSquads.some(s => s.id === profileSquadId);
            const browsedSquad = browsing ? allSquads.find(s => s.id === profileSquadId) : null;
            const isFull = browsedSquad ? (browsedSquad.member_count || 0) >= MAX_SQUAD_MEMBERS : false;
            return (
                <SquadProfileModal
                    squadId={profileSquadId}
                    onClose={() => setProfileSquadId(null)}
                    canJoin={browsing}
                    isFull={isFull}
                    hideJoin={!browsing}
                    onJoin={(sid) => { setProfileSquadId(null); handleJoinSquad(sid); }}
                    onRequestJoin={(sid) => { setProfileSquadId(null); handleRequestJoin(sid); }}
                />
            );
        })()}
        </OmenXGate>
    );
}