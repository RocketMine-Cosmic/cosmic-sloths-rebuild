export class SFXManagerClass {
    constructor() {
        this.audioContext = null;
        let savedSettings = {};
        try {
            savedSettings = JSON.parse(localStorage.getItem('cosmic_sloth_settings') || '{}');
        } catch (e) {}

        this.sfxVolume = savedSettings.sfxVolume !== undefined ? savedSettings.sfxVolume : 0.15;
        this.enabled = savedSettings.enabled !== undefined ? savedSettings.enabled : true;
        // Per-category SFX toggles. All on by default.
        const defaultCats = { weapons: true, pickups: true, enemies: true, player: true, ui: true, events: true };
        this.categories = { ...defaultCats, ...(savedSettings.sfxCategories || {}) };
        this.initialized = false;
        this.lastPlayed = {};
    }

    setCategoryEnabled(cat, enabled) {
        if (!(cat in this.categories)) return;
        this.categories[cat] = !!enabled;
        this.saveSettings();
    }

    isCategoryEnabled(cat) {
        return this.categories[cat] !== false;
    }

    init() {
        if (this.initialized) return;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
        } catch (e) {
            console.error("Web Audio API not supported");
        }
    }

    saveSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('cosmic_sloth_settings') || '{}');
            saved.sfxVolume = this.sfxVolume;
            saved.enabled = this.enabled;
            saved.sfxCategories = this.categories;
            localStorage.setItem('cosmic_sloth_settings', JSON.stringify(saved));
        } catch (e) {}
        // Also mirror SFX category toggles into the cloud save so they sync across devices.
        // Loaded asynchronously to avoid circular imports.
        try {
            import('./SaveManager').then(({ SaveManager }) => {
                const s = SaveManager.load();
                s.sfxCategories = { ...this.categories };
                SaveManager.save(s);
            }).catch(() => {});
        } catch {}
    }

    // Called by SaveManager after the cloud save loads — mirrors cloud-stored
    // SFX category toggles back into localStorage + the live instance.
    applyCloudCategories(cats) {
        if (!cats || typeof cats !== 'object') return;
        this.categories = { ...this.categories, ...cats };
        try {
            const saved = JSON.parse(localStorage.getItem('cosmic_sloth_settings') || '{}');
            saved.sfxCategories = this.categories;
            localStorage.setItem('cosmic_sloth_settings', JSON.stringify(saved));
        } catch {}
    }

    setSfxVolume(vol) {
        this.sfxVolume = vol;
        this.saveSettings();
    }

    toggleMute(enabled) {
        this.enabled = enabled;
        this.saveSettings();
    }

    throttle(key, delayMs) {
        const now = Date.now();
        if (this.lastPlayed[key] && now - this.lastPlayed[key] < delayMs) {
            return true;
        }
        this.lastPlayed[key] = now;
        return false;
    }

    playTone(freq, type, duration, vol = 1) {
        if (!this.enabled || !this.audioContext) return;
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);
        
        gainNode.gain.setValueAtTime(vol * this.sfxVolume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        osc.start();
        osc.stop(this.audioContext.currentTime + duration);
    }

    // XP pickup — sound matches the 4 visual tiers (shard / crystal / cluster / core).
    playPickup(value = 1) {
        if (!this.isCategoryEnabled('pickups')) return;
        if (this.throttle('pickup', 50)) return;
        if (value >= 100) {
            // Shard core — ethereal pad chord with sub-bass
            this.playTone(180, 'triangle', 0.2, 0.35);
            this.playTone(550, 'sine', 0.15, 0.4);
            setTimeout(() => this.playTone(820, 'sine', 0.18, 0.45), 40);
            setTimeout(() => this.playTone(1240, 'sine', 0.22, 0.5), 90);
            setTimeout(() => this.playTone(1660, 'sine', 0.18, 0.35), 150);
        } else if (value >= 20) {
            // Cluster — three-note ascending
            this.playTone(700, 'sine', 0.1, 0.4);
            setTimeout(() => this.playTone(1050, 'sine', 0.12, 0.4), 35);
            setTimeout(() => this.playTone(1500, 'sine', 0.16, 0.45), 80);
        } else if (value >= 5) {
            // Crystal — two-note
            this.playTone(800, 'sine', 0.1, 0.4);
            setTimeout(() => this.playTone(1200, 'sine', 0.15, 0.4), 30);
        } else {
            // Shard — quick high blip
            this.playTone(1100, 'sine', 0.06, 0.3);
        }
    }

    // Gold pickup — sound matches the 5 visual tiers (coin / stack / bag / chest / pile).
    playGoldPickup(value = 1) {
        if (!this.isCategoryEnabled('pickups')) return;
        if (this.throttle('gold', 100)) return;
        if (value >= 1000) {
            // Pile — huge cascading shimmer + bass thump
            this.playTone(220, 'triangle', 0.2, 0.4);
            this.playTone(800, 'square', 0.08, 0.35);
            setTimeout(() => this.playTone(1200, 'square', 0.1, 0.35), 40);
            setTimeout(() => this.playTone(1700, 'square', 0.12, 0.4), 90);
            setTimeout(() => this.playTone(2200, 'square', 0.15, 0.4), 140);
            setTimeout(() => this.playTone(2800, 'sine', 0.18, 0.35), 200);
            setTimeout(() => this.playTone(3400, 'sine', 0.12, 0.25), 280);
        } else if (value >= 200) {
            // Chest — solid thunk + cascading coins
            this.playTone(280, 'triangle', 0.15, 0.35);
            this.playTone(950, 'square', 0.08, 0.35);
            setTimeout(() => this.playTone(1400, 'square', 0.1, 0.35), 50);
            setTimeout(() => this.playTone(1900, 'square', 0.14, 0.35), 110);
            setTimeout(() => this.playTone(2500, 'sine', 0.14, 0.3), 170);
        } else if (value >= 50) {
            // Bag — muffled jingle, 3 notes
            this.playTone(900, 'square', 0.08, 0.35);
            setTimeout(() => this.playTone(1300, 'square', 0.1, 0.35), 40);
            setTimeout(() => this.playTone(1800, 'square', 0.18, 0.4), 90);
        } else if (value >= 10) {
            // Coin stack — two-note clink
            this.playTone(1200, 'square', 0.1, 0.3);
            setTimeout(() => this.playTone(1600, 'square', 0.2, 0.3), 50);
        } else {
            // Single coin — short clink
            this.playTone(1500, 'square', 0.07, 0.25);
        }
    }

    playEnemySpawn() {
        if (!this.isCategoryEnabled('enemies')) return;
        if (this.throttle('spawn', 500)) return;
        this.playTone(150, 'sawtooth', 0.3, 0.2);
    }
    
    playBossSpawn() {
        if (!this.isCategoryEnabled('enemies')) return;
        this.playTone(100, 'sawtooth', 1.0, 0.8);
        setTimeout(() => this.playTone(80, 'sawtooth', 1.0, 0.8), 200);
        setTimeout(() => this.playTone(60, 'sawtooth', 1.5, 0.8), 400);
    }

    playEnemyHit() {
        if (!this.isCategoryEnabled('enemies')) return;
        if (this.throttle('hit', 30)) return;
        this.playTone(200, 'square', 0.05, 0.1);
    }

    playEnemyDeath() {
        if (!this.isCategoryEnabled('enemies')) return;
        if (this.throttle('death', 50)) return;
        this.playTone(100, 'sawtooth', 0.1, 0.15);
    }

    playPlayerHit() {
        if (!this.isCategoryEnabled('player')) return;
        if (this.throttle('playerHit', 200)) return;
        this.playTone(150, 'sawtooth', 0.3, 0.8);
        setTimeout(() => this.playTone(100, 'square', 0.4, 0.8), 100);
    }

    playLevelUp() {
        if (!this.isCategoryEnabled('events')) return;
        [440, 554, 659, 880].forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'square', 0.4, 0.5), i * 120);
        });
    }

    // Magnet power-up — fast whoosh sweep that suggests pulling things in.
    playMagnetPickup() {
        if (!this.isCategoryEnabled('pickups')) return;
        if (this.throttle('magnet', 200)) return;
        this.playTone(300, 'sine', 0.15, 0.35);
        setTimeout(() => this.playTone(600, 'sine', 0.12, 0.4), 40);
        setTimeout(() => this.playTone(1100, 'sine', 0.1, 0.4), 80);
        setTimeout(() => this.playTone(1700, 'triangle', 0.15, 0.3), 120);
    }

    playUIClick() {
        if (!this.isCategoryEnabled('ui')) return;
        this.playTone(600, 'sine', 0.1, 0.5);
    }

    playWeaponFire(weaponId) {
        if (!this.isCategoryEnabled('weapons')) return;
        if (this.throttle(`weapon_${weaponId}`, 100)) return;
        
        if (weaponId === 'napBeam' || weaponId === 'laserNova') {
            this.playTone(400, 'square', 0.1, 0.2);
        } else if (weaponId === 'vineWhip' || weaponId === 'thornySwarm') {
            this.playTone(300, 'sawtooth', 0.15, 0.2);
        } else if (weaponId === 'novaPulse') {
            this.playTone(200, 'sine', 0.3, 0.3);
        } else if (weaponId === 'napalm') {
            this.playTone(150, 'triangle', 0.2, 0.2);
        } else {
            this.playTone(500, 'sine', 0.1, 0.1);
        }
    }
    
    playGameOver() {
        if (!this.isCategoryEnabled('events')) return;
        [300, 250, 200, 150].forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'sawtooth', 0.5, 0.6), i * 300);
        });
    }
    
    playVictory() {
        if (!this.isCategoryEnabled('events')) return;
        [440, 554, 659, 880, 1108].forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'square', 0.3, 0.6), i * 150);
        });
    }
}

export const SFXManager = new SFXManagerClass();