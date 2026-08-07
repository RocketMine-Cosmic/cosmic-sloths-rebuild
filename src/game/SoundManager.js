import { SFXManager } from './SFXManager';
import { MUSIC_TRACKS } from './MusicTracks';

const SETTINGS_KEY = 'cosmic_sloth_settings';
const JUKEBOX_KEY = 'cosmic_sloth_jukebox';

// Default: all tracks enabled in both contexts.
const defaultEnabledIds = MUSIC_TRACKS.map(t => t.id);

function loadJukebox() {
    try {
        const raw = JSON.parse(localStorage.getItem(JUKEBOX_KEY) || '{}');
        return {
            menu: Array.isArray(raw.menu) ? raw.menu : [...defaultEnabledIds],
            game: Array.isArray(raw.game) ? raw.game : [...defaultEnabledIds],
        };
    } catch {
        return { menu: [...defaultEnabledIds], game: [...defaultEnabledIds] };
    }
}

function saveJukebox(state) {
    try { localStorage.setItem(JUKEBOX_KEY, JSON.stringify(state)); } catch {}
    // Also mirror into the cloud save so preferences sync across devices.
    // Loaded asynchronously to avoid a circular import at module init.
    try {
        import('./SaveManager').then(({ SaveManager }) => {
            const s = SaveManager.load();
            s.jukeboxPrefs = state;
            SaveManager.save(s);
        }).catch(() => {});
    } catch {}
}

// Called by SaveManager after the cloud save loads — mirrors cloud-stored
// jukebox preferences back into localStorage + the live SoundManager instance.
export function applyCloudJukeboxPrefs(prefs) {
    if (!prefs || typeof prefs !== 'object') return;
    const next = {
        menu: Array.isArray(prefs.menu) ? prefs.menu : [...defaultEnabledIds],
        game: Array.isArray(prefs.game) ? prefs.game : [...defaultEnabledIds],
    };
    try { localStorage.setItem(JUKEBOX_KEY, JSON.stringify(next)); } catch {}
    if (SoundManager) {
        SoundManager.jukebox = next;
        SoundManager._notify();
    }
}

class SoundManagerClass {
    constructor() {
        this.bgm = new Audio();
        this.context = 'menu'; // 'menu' or 'game' — determines which playlist is active
        this.jukebox = loadJukebox();
        this.currentTrackId = null;
        this.listeners = new Set();

        this.bgm.loop = false;
        this.bgm.addEventListener('ended', () => this.playNext());

        let savedSettings = {};
        try {
            savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        } catch {}

        this.bgm.volume = savedSettings.bgmVolume !== undefined ? savedSettings.bgmVolume : 0.25;
        this.enabled = savedSettings.enabled !== undefined ? savedSettings.enabled : true;

        // Pick a starting track from the menu playlist
        this._loadRandomFromActivePlaylist();

        // Pause BGM when tab is hidden, resume when visible again (if not muted).
        if (typeof document !== 'undefined') {
            this._wasPlayingBeforeHidden = false;
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this._wasPlayingBeforeHidden = !this.bgm.paused;
                    if (this._wasPlayingBeforeHidden) this.bgm.pause();
                } else if (this._wasPlayingBeforeHidden && this.enabled) {
                    this.bgm.play().catch(() => {});
                }
            });
        }
    }

    init() {
        SFXManager.init();
    }

    // --- Playlist helpers ---

    getActivePlaylistIds() {
        const ids = this.jukebox[this.context] || [];
        // If user disabled everything, fall back to the full catalog so music still plays.
        return ids.length > 0 ? ids : MUSIC_TRACKS.map(t => t.id);
    }

    getActivePlaylistTracks() {
        const ids = this.getActivePlaylistIds();
        return MUSIC_TRACKS.filter(t => ids.includes(t.id));
    }

    _trackById(id) {
        return MUSIC_TRACKS.find(t => t.id === id);
    }

    _loadRandomFromActivePlaylist() {
        const tracks = this.getActivePlaylistTracks();
        if (tracks.length === 0) return;
        const next = tracks[Math.floor(Math.random() * tracks.length)];
        this._loadTrack(next.id);
    }

    _loadTrack(id) {
        const track = this._trackById(id);
        if (!track) return;
        this.currentTrackId = id;
        this.bgm.src = track.url;
        this._notify();
    }

    playNext() {
        const tracks = this.getActivePlaylistTracks();
        if (tracks.length === 0) return;
        const currentIdx = tracks.findIndex(t => t.id === this.currentTrackId);
        const nextIdx = (currentIdx + 1) % tracks.length;
        this._loadTrack(tracks[nextIdx].id);
        if (this.enabled) {
            this.bgm.play().catch(e => console.log('Audio play failed:', e));
        }
    }

    playPrev() {
        const tracks = this.getActivePlaylistTracks();
        if (tracks.length === 0) return;
        const currentIdx = tracks.findIndex(t => t.id === this.currentTrackId);
        const prevIdx = (currentIdx - 1 + tracks.length) % tracks.length;
        this._loadTrack(tracks[prevIdx].id);
        if (this.enabled) {
            this.bgm.play().catch(e => console.log('Audio play failed:', e));
        }
    }

    playTrack(id) {
        if (!this._trackById(id)) return;
        this._loadTrack(id);
        if (this.enabled) {
            this.bgm.play().catch(e => console.log('Audio play failed:', e));
        }
    }

    // --- Context (menu vs in-game) ---

    setContext(ctx) {
        if (ctx !== 'menu' && ctx !== 'game') return;
        if (this.context === ctx) return;
        this.context = ctx;
        // If the currently-playing track is not in the new context's playlist, swap it out.
        const activeIds = this.getActivePlaylistIds();
        if (!activeIds.includes(this.currentTrackId)) {
            this._loadRandomFromActivePlaylist();
            if (this.enabled) {
                this.bgm.play().catch(e => console.log('Audio play failed:', e));
            }
        }
        this._notify();
    }

    // --- Jukebox preferences ---

    isTrackEnabled(id, context = this.context) {
        return (this.jukebox[context] || []).includes(id);
    }

    setTrackEnabled(id, context, enabled) {
        const list = new Set(this.jukebox[context] || []);
        if (enabled) list.add(id); else list.delete(id);
        this.jukebox[context] = Array.from(list);
        saveJukebox(this.jukebox);
        this._notify();
    }

    enableAll(context) {
        this.jukebox[context] = MUSIC_TRACKS.map(t => t.id);
        saveJukebox(this.jukebox);
        this._notify();
    }

    disableAll(context) {
        this.jukebox[context] = [];
        saveJukebox(this.jukebox);
        this._notify();
    }

    // --- Subscriptions for the Jukebox UI ---

    subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    _notify() {
        this.listeners.forEach(fn => { try { fn(); } catch {} });
    }

    getCurrentTrack() {
        return this._trackById(this.currentTrackId);
    }

    // --- Original API (unchanged behavior) ---

    playBGM() {
        if (!this.enabled) return;
        this.bgm.play().catch(e => console.log('Audio play failed (interaction required):', e));
    }

    stopBGM() {
        this.bgm.pause();
        this.bgm.currentTime = 0;
    }

    saveSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            saved.bgmVolume = this.bgm.volume;
            saved.enabled = this.enabled;
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
        } catch {}
    }

    setBgmVolume(vol) {
        this.bgm.volume = vol;
        this.saveSettings();
    }

    toggleMute() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.bgm.pause();
        } else {
            this.bgm.play().catch(e => console.log('Audio play failed:', e));
        }
        this.saveSettings();
        SFXManager.toggleMute(this.enabled);
        return this.enabled;
    }

    isMuted() {
        return !this.enabled;
    }

    // Facade for SFXManager to avoid breaking all UI components
    setSfxVolume(vol) { SFXManager.setSfxVolume(vol); }
    get sfxVolume() { return SFXManager.sfxVolume; }

    playPickup() { SFXManager.playPickup(); }
    playGoldPickup() { SFXManager.playGoldPickup(); }
    playEnemySpawn() { SFXManager.playEnemySpawn(); }
    playBossSpawn() { SFXManager.playBossSpawn(); }
    playEnemyHit() { SFXManager.playEnemyHit(); }
    playEnemyDeath() { SFXManager.playEnemyDeath(); }
    playPlayerHit() { SFXManager.playPlayerHit(); }
    playLevelUp() { SFXManager.playLevelUp(); }
    playUIClick() { SFXManager.playUIClick(); }
    playWeaponFire(id) { SFXManager.playWeaponFire(id); }
    playGameOver() { SFXManager.playGameOver(); }
    playVictory() { SFXManager.playVictory(); }
}

export const SoundManager = new SoundManagerClass();