const loadTexture = (url, name) => {
    if (typeof window !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        canvas.texName = name;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 128, 128);
            
            try {
                const imgData = ctx.getImageData(0, 0, 128, 128);
                const data = imgData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i+1];
                    const b = data[i+2];
                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    
                    data[i] = 255;
                    data[i+1] = 255;
                    data[i+2] = 255;
                    data[i+3] = lum; // Convert black background to transparent
                }
                ctx.putImageData(imgData, 0, 0);
            } catch (e) {
                console.error("Failed to process texture alpha:", e);
            }
            
            canvas.isReady = true;
        };
        img.src = url;
        return canvas;
    }
    return { isReady: false };
};

let proceduralSpriteSheetsCache = null;

// 2026-08-07 — textures and the derived tint/glow/outline caches are now shared
// across GameEngine instances. Previously every `new ParticleManager()` (i.e.
// every run, including every Try Again) rebuilt five texture canvases — each one
// running a 128×128 = 16,384-pixel getImageData → JS loop → putImageData on the
// main thread — and threw away every tinted/glow variant, so all of them were
// regenerated and re-uploaded to the GPU during the first seconds of the next
// run. The procedural sprite sheets were already cached this way; the textures
// should always have been too. They're immutable once loaded, so sharing is safe.
let sharedTexturesCache = null;
const sharedTintCache = {};
const sharedGlowCache = {};
const sharedOutlineCache = {};

// Low-FX mode (set via Settings → Low FX Mode toggle). Slashes particle counts
// and skips the procedural sprite-sheet animations — the two biggest thermal
// drivers on mobile per Texxy's 2026-05-29 report. Cached for 1s so we don't
// hit localStorage on every single particle spawn.
let _lowFxCache = false;
let _lowFxCacheAt = 0;
function isLowFx() {
    if (typeof window === 'undefined') return false;
    const now = performance.now();
    if (now - _lowFxCacheAt < 1000) return _lowFxCache;
    try { _lowFxCache = localStorage.getItem('cosmic_low_fx_mode') === '1'; } catch { _lowFxCache = false; }
    _lowFxCacheAt = now;
    return _lowFxCache;
}

export class ParticleManager {
    constructor() {
        // 2026-08-07 — particles are split into three lists, one per render layer.
        // GameEngineDraw calls draw() THREE times per frame (combat, trail, killfx),
        // and each call used to iterate the ENTIRE array (cap 800) just to skip the
        // particles tagged for the other two layers — up to ~2,400 iterations/frame
        // of pure filtering. Particle volume scales with mob count, so this was a
        // second "more mobs = lower FPS" term introduced by the 2026-08-03 cosmetic
        // layering. Each pass now touches only its own particles.
        this.particles = [];        // combat VFX (impacts, explosions, AoE)
        this.trailParticles = [];   // cosmetic trail layer
        this.killfxParticles = [];  // cosmetic kill-effect layer
        // Where addParticle/addAnim currently write. createTrail / createKillEffect
        // point this at their own list for the duration of the call — replaces the
        // old "spawn, then loop back over the array tagging _cosmeticLayer" pattern.
        this._activeList = this.particles;
        this.pool = [];
        if (!sharedTexturesCache) {
            sharedTexturesCache = {
                star: loadTexture('/assets/69c5d61e39690bf20f763b4c/0ea8232ec_generated_image.png', 'star'),
                explosion: loadTexture('/assets/69c5d61e39690bf20f763b4c/d54e51f9e_generated_image.png', 'explosion'),
                smoke: loadTexture('/assets/69c5d61e39690bf20f763b4c/882cab418_generated_image.png', 'smoke'),
                slash: loadTexture('/assets/69c5d61e39690bf20f763b4c/55426dc86_generated_image.png', 'slash'),
                shockwave: loadTexture('/assets/69c5d61e39690bf20f763b4c/371ac242b_generated_image.png', 'shockwave'),
            };
        }
        this.textures = sharedTexturesCache;

        const loadSprite = (url) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = url;
            return img;
        };

        const createProceduralSpriteSheet = (type) => {
            if (typeof window === 'undefined') return { complete: false };
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');
            canvas.complete = true;
            canvas.naturalWidth = 512;
            canvas.naturalHeight = 512;
            
            const cols = 4;
            const fw = 128;
            const fh = 128;
            
            for (let i = 0; i < 16; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const cx = col * fw + fw/2;
                const cy = row * fh + fh/2;
                
                const progress = i / 15;
                
                ctx.save();
                ctx.translate(cx, cy);
                
                if (type === 'explosion') {
                    const radius = 20 + progress * 40;
                    const alpha = 1 - Math.pow(progress, 1.5);
                    ctx.globalAlpha = alpha;
                    
                    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
                    grad.addColorStop(0, '#ffffff');
                    grad.addColorStop(0.2, '#ffdd00');
                    grad.addColorStop(0.6, '#ff4400');
                    grad.addColorStop(1, 'transparent');
                    ctx.fillStyle = grad;
                    
                    ctx.beginPath();
                    const spikes = 12;
                    for (let j = 0; j < spikes * 2; j++) {
                        const angle = (Math.PI * 2 / (spikes * 2)) * j;
                        const r = j % 2 === 0 ? radius : radius * 0.4 * (1 + Math.sin(j * 123) * 0.3);
                        if (j === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
                    }
                    ctx.fill();
                    
                } else if (type === 'magic') {
                    const radius = 10 + progress * 45;
                    const alpha = 1 - Math.pow(progress, 2);
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 4 * (1 - progress);
                    
                    ctx.rotate(progress * Math.PI);
                    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
                    
                    ctx.rotate(-progress * Math.PI * 0.5);
                    ctx.beginPath();
                    for(let j=0; j<6; j++) {
                        const a = (Math.PI * 2 / 6) * j;
                        ctx.lineTo(Math.cos(a) * radius * 1.2, Math.sin(a) * radius * 1.2);
                    }
                    ctx.closePath();
                    ctx.stroke();
                    
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = alpha * 0.5;
                    ctx.beginPath(); ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2); ctx.fill();
                }
                
                ctx.restore();
            }
            
            return canvas;
        };

        if (!proceduralSpriteSheetsCache) {
            proceduralSpriteSheetsCache = {
                explosion_anim: {
                    img: createProceduralSpriteSheet('explosion'),
                    frames: 16, cols: 4, rows: 4, duration: 0.4
                },
                magic_impact: {
                    img: createProceduralSpriteSheet('magic'),
                    frames: 16, cols: 4, rows: 4, duration: 0.3
                }
            };
        }

        this.spriteSheets = proceduralSpriteSheetsCache;

        this.tintCache = sharedTintCache;
        this.glowCache = sharedGlowCache;
        this.outlineCache = sharedOutlineCache;
    }

    getGlowTexture(color, radius) {
        if (radius <= 0) return null;
        const key = `${color}_${Math.round(radius)}`;
        if (this.glowCache[key]) return this.glowCache[key];
        
        // P2 2026-08-03 — this copy of getGlowTexture had NO size cap and NO
        // null-context guard, unlike the one in ProjectileRenderer.js. A large
        // radius could ask for a multi-thousand-pixel canvas; on mobile that
        // silently fails, getContext returns null, and the next line threw and
        // killed the frame. Cap and guard, matching the other implementation.
        // The key is left unquantised on purpose: every caller here (player and
        // squad-clone glow) passes a stable radius, so there is nothing to
        // collapse, and quantising would visibly change the player's glow size.
        let size = Math.ceil(radius * 2.5); // Enough padding
        if (size <= 0) return null;
        if (size > 512) size = 512;

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        
        const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        grad.addColorStop(0, color);
        grad.addColorStop(0.2, color);
        grad.addColorStop(1, 'transparent');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
        ctx.fill();
        
        this.glowCache[key] = canvas;
        return canvas;
    }

    getTintedTexture(tex, color) {
        if (!tex || (!tex.isReady && !tex.complete)) return tex;
        if (!this.tintCache) this.tintCache = {};
        if (!this.tintCache[color]) this.tintCache[color] = {};
        
        const texKey = tex.texName || tex.src || 'unknown';
        if (!texKey || texKey === 'unknown') {
            if (!tex._tempId) tex._tempId = Math.random().toString();
            tex.texName = tex._tempId;
        }

        if (this.tintCache[color][tex.texName]) return this.tintCache[color][tex.texName];
        
        const canvas = document.createElement('canvas');
        canvas.width = tex.width || tex.naturalWidth || 128;
        canvas.height = tex.height || tex.naturalHeight || 128;
        if(canvas.width === 0 || canvas.height === 0) return tex;
        canvas.texName = tex.texName;
        canvas.isReady = true;
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(tex, 0, 0, canvas.width, canvas.height);
        
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(tex, 0, 0, canvas.width, canvas.height);
        
        this.tintCache[color][tex.texName] = canvas;
        return canvas;
    }

    getOutlineTexture(tex, color) {
        if (!tex || (!tex.isReady && !tex.complete)) return tex;
        if (!this.outlineCache) this.outlineCache = {};
        if (!this.outlineCache[color]) this.outlineCache[color] = {};
        
        const texKey = tex.texName || tex.src || 'unknown';
        if (!texKey || texKey === 'unknown') {
            if (!tex._tempId) tex._tempId = Math.random().toString();
            tex.texName = tex._tempId;
        }

        if (this.outlineCache[color][tex.texName]) return this.outlineCache[color][tex.texName];
        
        const canvas = document.createElement('canvas');
        canvas.width = tex.width || tex.naturalWidth || 128;
        canvas.height = tex.height || tex.naturalHeight || 128;
        if(canvas.width === 0 || canvas.height === 0) return tex;
        canvas.texName = tex.texName;
        canvas.isReady = true;
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(tex, 0, 0, canvas.width, canvas.height);
        
        const outlineCanvas = document.createElement('canvas');
        outlineCanvas.width = canvas.width;
        outlineCanvas.height = canvas.height;
        const oCtx = outlineCanvas.getContext('2d');
        
        const d = 1;
        
        oCtx.drawImage(tex, -d, 0, canvas.width, canvas.height);
        oCtx.drawImage(tex, d, 0, canvas.width, canvas.height);
        oCtx.drawImage(tex, 0, -d, canvas.width, canvas.height);
        oCtx.drawImage(tex, 0, d, canvas.width, canvas.height);
        oCtx.drawImage(tex, -d, -d, canvas.width, canvas.height);
        oCtx.drawImage(tex, d, -d, canvas.width, canvas.height);
        oCtx.drawImage(tex, -d, d, canvas.width, canvas.height);
        oCtx.drawImage(tex, d, d, canvas.width, canvas.height);
        
        oCtx.globalCompositeOperation = 'source-in';
        oCtx.fillStyle = color;
        oCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        oCtx.globalCompositeOperation = 'destination-out';
        oCtx.drawImage(tex, 0, 0, canvas.width, canvas.height);
        
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(outlineCanvas, 0, 0);
        
        ctx.shadowColor = color;
        ctx.shadowBlur = 3;
        ctx.drawImage(outlineCanvas, 0, 0);
        
        this.outlineCache[color][tex.texName] = canvas;
        return canvas;
    }

    update(dt) {
        this._updateList(this.particles, dt, 800);
        this._updateList(this.trailParticles, dt, 250);
        this._updateList(this.killfxParticles, dt, 250);
    }

    _updateList(list, dt, cap) {
        if (list.length > cap) {
            const removed = list.splice(0, list.length - cap);
            for (let i = 0; i < removed.length; i++) {
                this.pool.push(removed[i]);
            }
        }
        for (let i = list.length - 1; i >= 0; i--) {
            let p = list[i];
            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (p.rotation !== undefined) p.rotation += (p.rotSpeed || 0) * dt;

            if (p.type === 'smoke' || p.type === 'dark_smoke') {
                p.size += dt * 20;
                p.vx *= 0.90;
                p.vy *= 0.90;
            } else if (p.type === 'star' || p.type === 'spark') {
                p.vx *= 0.88;
                p.vy *= 0.88;
                if (p.gravity) p.vy += 500 * dt;
            } else if (p.type === 'fragment' || p.type === 'shatter') {
                p.vx *= 0.93;
                p.vy *= 0.93;
                p.size *= 0.98;
                if (p.gravity) p.vy += 400 * dt;
            } else if (p.type === 'implode' || p.type === 'imploding_star' || p.type === 'dark_implode') {
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 5) {
                    p.vx += (dx / dist) * 1200 * dt;
                    p.vy += (dy / dist) * 1200 * dt;
                }
                p.vx *= 0.88;
                p.vy *= 0.88;
            } else if (p.type === 'shockwave' || p.type === 'dark_shockwave') {
                p.size += (p.growthRate || 400) * dt;
                p.lineWidth = Math.max(0.1, (p.lineWidth || 4) - dt * 8);
            } else if (p.type === 'flame') {
                p.vx *= 0.92;
                p.vy *= 0.92;
                p.vy -= 60 * dt; // flames rise
                p.size += dt * 10;
            }

            if (p.life <= 0) {
                this.pool.push(p);
                list[i] = list[list.length - 1];
                list.pop();
            }
        }
    }

    // layerFilter:
    //   null (default)  → combat VFX only — skips any particle tagged as cosmetic
    //                     (trail / kill effect). Called at the early particle pass so
    //                     weapon impacts, explosions, AoE pools still feel immediate.
    //   'trail'         → only trail cosmetic particles. Drawn AFTER enemies but
    //                     BEFORE the player sprite so the trail reads as coming
    //                     from the player without obscuring the skin.
    //   'killfx'        → only kill-effect cosmetic particles. Drawn AFTER the
    //                     player sprite so paid kill effects (golden, explosion,
    //                     etc.) pop on top of everything except the HUD.
    draw(ctx, camX, camY, vWidth, vHeight, layerFilter = null) {
        ctx.save();

        // P1 2026-08-03 — same defect as ProjectileRenderer: these four camera
        // parameters were accepted and never read, and GameEngineDraw calls this
        // method THREE times per frame (main pass, trail layer, killfx layer).
        // Margin scales with particle size because several types draw at a
        // multiple of it (shockwaves are the worst).
        const cullOn = Number.isFinite(camX) && vWidth > 0 && vHeight > 0;

        // Layer routing is now a list selection instead of a per-particle tag check
        // across the whole array — see the constructor comment.
        const list = layerFilter === 'trail' ? this.trailParticles
                   : layerFilter === 'killfx' ? this.killfxParticles
                   : this.particles;

        list.forEach(p => {
            const alpha = Math.max(0, p.life / (p.maxLife || 1));
            if (alpha <= 0) return;

            if (cullOn) {
                const m = (p.size || 8) * 4 + 64;
                if (p.x < camX - m || p.x > camX + vWidth + m ||
                    p.y < camY - m || p.y > camY + vHeight + m) return;
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation || 0);

            const color = p.color || p.tint || '#ffffff';
            const sBase = p.size || 8;

            // Determine blend mode per particle type
            const isOpaque = p.type === 'blood' || p.type === 'dark_smoke' || p.type === 'dark_shockwave' || p.type === 'dark_implode';
            const blendMode = isOpaque ? 'source-over' : 'screen';
            ctx.globalCompositeOperation = blendMode;
            ctx.globalAlpha = alpha;

            if (p.type.startsWith('anim_')) {
                const sheet = this.spriteSheets[p.animName];
                if (sheet && sheet.img.complete && sheet.img.naturalWidth > 0) {
                    const progress = 1 - (p.life / p.maxLife);
                    let frame = Math.floor(progress * sheet.frames);
                    if (frame >= sheet.frames) frame = sheet.frames - 1;
                    
                    const col = frame % sheet.cols;
                    const row = Math.floor(frame / sheet.cols);
                    const fw = sheet.img.width / sheet.cols;
                    const fh = sheet.img.height / sheet.rows;
                    
                    // PERF 2026-08-07 — this used to set shadowBlur = 15 on every
                    // coloured anim particle. Canvas shadowBlur is a real Gaussian
                    // blur recomputed per draw call, and explosions spawn these in
                    // bursts, so it was one of the most expensive things in the
                    // frame. Same soft halo is faked with one extra scaled-up,
                    // low-alpha copy underneath — a plain drawImage, no blur.
                    if (p.color && p.color !== '#ffffff') {
                        const gs = p.size * 1.35;
                        ctx.globalAlpha = alpha * 0.4;
                        ctx.drawImage(sheet.img, col * fw, row * fh, fw, fh, -gs/2, -gs/2, gs, gs);
                        ctx.globalAlpha = alpha;
                    }

                    ctx.drawImage(sheet.img, col * fw, row * fh, fw, fh, -p.size/2, -p.size/2, p.size, p.size);
                }
                ctx.restore();
                return; // Skip rest of the drawing for animated sprites
            }

            // DRAW HD TEXTURE
            let tex = null;
            let scaleMult = 1.5;

            if (p.type === 'star' || p.type === 'spark' || p.type === 'imploding_star') { tex = this.textures.star; scaleMult = 2.0; }
            else if (p.type === 'explosion' || p.type === 'flash' || p.type === 'blood') { tex = this.textures.explosion; scaleMult = 2.2; }
            else if (p.type === 'smoke' || p.type === 'dark_smoke' || p.type === 'flame') { tex = this.textures.smoke; scaleMult = 2.2; }
            else if (p.type === 'slash' || p.type === 'shatter') { tex = this.textures.slash; scaleMult = 2.5; }
            else if (p.type === 'shockwave' || p.type === 'dark_shockwave' || p.type === 'implode' || p.type === 'dark_implode' || p.type === 'circle' || p.type === 'ring') { tex = this.textures.shockwave; scaleMult = 1.8; }
            else { tex = this.textures.star; scaleMult = 1.5; } // Catch-all fallback to prevent flat shapes
            
            if (tex && tex.isReady && color !== '#ffffff') {
                tex = this.getTintedTexture(tex, color);
            }

            // For simple geometry fallback
            if (!tex || !tex.isReady) {
                switch (p.type) {
                    case 'circle':
                    case 'ring':
                    case 'shockwave':
                    case 'dark_shockwave':
                        ctx.strokeStyle = color;
                        ctx.lineWidth = p.lineWidth || 2;
                        ctx.beginPath();
                        ctx.arc(0, 0, Math.max(0.1, sBase * 0.5), 0, Math.PI * 2);
                        ctx.stroke();
                        break;
                    case 'slash':
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(-sBase * 0.5, -sBase * 0.2);
                        ctx.lineTo(sBase * 0.5, sBase * 0.2);
                        ctx.stroke();
                        break;
                    case 'blood':
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(0, 0, Math.max(0.1, sBase * 0.6), 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    case 'flame':
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(0, 0, Math.max(0.1, sBase * 0.7), 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    default:
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(0, 0, Math.max(0.1, sBase * 0.5), 0, Math.PI * 2);
                        ctx.fill();
                }
            } else {
                const ts = sBase * scaleMult; 
                ctx.drawImage(tex, -ts/2, -ts/2, ts, ts);
                
                // Add a small solid core for impact
                if (p.type === 'star' || p.type === 'explosion' || p.type === 'flash') {
                    ctx.globalAlpha = alpha * 0.8;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(0, 0, Math.max(0.1, sBase * 0.2), 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.restore();
        });

        ctx.restore();
    }

    addAnim(x, y, animName, scale = 1, rotation = 0, color = null) {
        // Low FX mode: skip procedural sprite-sheet animations entirely. These
        // are the heaviest single per-frame draws (16-frame 128px sprite plays).
        if (isLowFx()) return;
        const sheet = this.spriteSheets[animName];
        if (!sheet) return;
        
        let p = this.pool.length > 0 ? this.pool.pop() : {};
        
        p.x = x;
        p.y = y;
        p.vx = 0;
        p.vy = 0;
        p.life = sheet.duration;
        p.maxLife = sheet.duration;
        p.color = color || '#ffffff';
        p.tint = color || '#ffffff';
        p.type = 'anim_' + animName;
        p.size = 100 * scale;
        p.rotation = rotation;
        p.rotSpeed = 0;
        p.animName = animName;
        p.gravity = false;
        
        this._activeList.push(p);
    }

    addParticle(x, y, color, count, type = 'star', sizeMult = 1, options = {}) {
        // Low FX mode: spawn ~30% of the requested particles. Player still gets
        // visual feedback on hits/explosions, just much less GPU/CPU load.
        if (isLowFx()) count = Math.max(1, Math.ceil(count * 0.3));
        for (let i = 0; i < count; i++) {
            const angle = options.angle !== undefined ? options.angle + (Math.random() - 0.5) * 0.8 : Math.random() * Math.PI * 2;
            const speed = options.speed !== undefined ? options.speed * (0.7 + Math.random() * 0.6) : Math.random() * 150 * sizeMult + 50;

            const lifeBase = Math.random() * 0.5 + 0.3 + (options.lifeBonus || 0);
            
            let p = this.pool.length > 0 ? this.pool.pop() : {};
            
            p.x = x;
            p.y = y;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.life = lifeBase;
            p.maxLife = lifeBase;
            p.color = color;
            p.tint = color;
            p.type = type;
            p.size = (Math.random() * 24 + 12) * sizeMult;
            p.rotation = Math.random() * Math.PI * 2;
            p.rotSpeed = (Math.random() - 0.5) * 12;
            p.gravity = options.gravity || false;
            p.lineWidth = options.lineWidth;
            p.growthRate = options.growthRate;
            p.targetX = options.targetX;
            p.targetY = options.targetY;

            this._activeList.push(p);
        }
    }

    createExplosion(x, y, color, scale = 1, sourceId = '') {
        const s = Math.min(scale, 2);
        this.addAnim(x, y, 'explosion_anim', 2.0 * s, Math.random() * Math.PI * 2, color);
        this.addParticle(x, y, color, 12 * s, 'spark', 2 * s, { speed: 300 * s });
        this.addParticle(x, y, '#ffffff', 8 * s, 'star', 1.5 * s, { speed: 400 * s });
    }

    createHitEffect(x, y, color, angle, scale = 1) {
        this.addAnim(x, y, 'magic_impact', 1.5 * scale, angle, color);
        this.addParticle(x, y, color, 4, 'spark', 1.2 * scale, { angle, speed: 260 * scale });
        this.addParticle(x, y, '#ffffff', 2, 'spark', 0.8 * scale, { angle, speed: 360 * scale });
    }

    createLevelUp(x, y) {
        // Clean and vibrant sparks only
        this.addAnim(x, y, 'magic_impact', 3.0, 0, '#00e5ff');
        this.addParticle(x, y, '#00e5ff', 20, 'spark', 2.5, { speed: 450 });
        this.addParticle(x, y, '#ff00e5', 20, 'spark', 2.0, { speed: 350 });
        this.addParticle(x, y, '#ffff00', 20, 'spark', 2.5, { speed: 300 });
    }

    createPickup(x, y, color) {
        this.addParticle(x, y, color, 6, 'spark', 1.5, { speed: 120 });
    }

    createKillEffect(x, y, effectId) {
        // Everything spawned in this call lands in the dedicated 'killfx' list so
        // it renders in the late pass on top of the player sprite — paid kill
        // effects were getting buried under enemy spawns / projectiles.
        this._activeList = this.killfxParticles;
        switch (effectId) {
            case 'explosion':
                this.addAnim(x, y, 'explosion_anim', 3.0, Math.random() * Math.PI * 2, '#ff4500');
                this.addParticle(x, y, '#ffaa00', 1, 'flash', 3.0, { speed: 0, lifeBonus: -0.2 });
                this.addParticle(x, y, '#ff4500', 12, 'flame', 2.0, { speed: 250 });
                this.addParticle(x, y, '#555555', 8, 'smoke', 1.5, { speed: 150 });
                break;
            case 'pixel_burst':
                this.addParticle(x, y, '#00ffff', 10, 'spark', 1.8, { speed: 350 });
                this.addParticle(x, y, '#ff00ff', 10, 'slash', 1.5, { speed: 250 });
                this.addParticle(x, y, '#ffffff', 1, 'flash', 2.0, { speed: 0 });
                break;
            case 'blood_splatter':
                this.addParticle(x, y, '#8a0303', 15, 'blood', 2.5, { speed: 300, gravity: true });
                this.addParticle(x, y, '#ff0000', 10, 'spark', 1.5, { speed: 200, gravity: true });
                break;
            case 'black_hole':
                this.addParticle(x, y, '#000000', 1, 'dark_shockwave', 1.0, { speed: 0, lineWidth: 10, growthRate: -200 });
                this.addParticle(x, y, '#1a0033', 20, 'dark_implode', 2.0, { speed: 200, targetX: x, targetY: y });
                break;
            case 'freeze':
                this.addParticle(x, y, '#ffffff', 1, 'flash', 2.0, { speed: 0 });
                this.addParticle(x, y, '#00cfff', 15, 'shatter', 1.5, { speed: 250, gravity: true });
                this.addParticle(x, y, '#aaf0ff', 10, 'spark', 1.0, { speed: 150 });
                break;
            case 'vaporize':
                this.addParticle(x, y, '#39ff14', 15, 'smoke', 2.0, { speed: 150 });
                this.addParticle(x, y, '#00ff88', 10, 'spark', 1.5, { speed: 200 });
                this.addParticle(x, y, '#aaff00', 1, 'flash', 1.5, { speed: 0 });
                break;
            case 'implode':
                this.addParticle(x, y, '#8a2be2', 15, 'implode', 1.5, { speed: 250, targetX: x, targetY: y });
                this.addParticle(x, y, '#cc00ff', 1, 'shockwave', 1.0, { speed: 0, lineWidth: 5, growthRate: -150 });
                break;
            case 'golden':
                this.addParticle(x, y, '#ffd700', 15, 'star', 2.0, { speed: 300, gravity: true });
                this.addParticle(x, y, '#ffec6e', 10, 'spark', 1.5, { speed: 200, gravity: true });
                this.addParticle(x, y, '#ffffff', 1, 'flash', 2.0, { speed: 0 });
                break;

            // MYTHIC CHEST KILL FX -----------------------------------------
            // Coin Burst: golden shockwave ring + dense gold coin spray + bright core.
            case 'kill_fx_coin_burst':
                this.addParticle(x, y, '#ffd700', 1, 'shockwave', 1.5, { speed: 0, lineWidth: 6, growthRate: 350 });
                this.addParticle(x, y, '#ffd700', 20, 'star', 2.4, { speed: 380, gravity: true });
                this.addParticle(x, y, '#ffec6e', 12, 'spark', 1.8, { speed: 260, gravity: true });
                this.addParticle(x, y, '#ffffff', 1, 'flash', 3.0, { speed: 0 });
                this.addAnim(x, y, 'magic_impact', 2.0, 0, '#ffd700');
                break;
            // Supernova: white ring, golden shards, full explosion anim.
            case 'kill_fx_supernova':
                this.addAnim(x, y, 'explosion_anim', 3.5, Math.random() * Math.PI * 2, '#ffffff');
                this.addParticle(x, y, '#ffffff', 1, 'shockwave', 2.0, { speed: 0, lineWidth: 8, growthRate: 450 });
                this.addParticle(x, y, '#ffd700', 1, 'shockwave', 1.5, { speed: 0, lineWidth: 5, growthRate: 300 });
                this.addParticle(x, y, '#ffffff', 16, 'spark', 2.0, { speed: 420 });
                this.addParticle(x, y, '#ffd700', 12, 'shatter', 2.0, { speed: 300, gravity: true });
                this.addParticle(x, y, '#ffffff', 1, 'flash', 3.5, { speed: 0 });
                break;
        }
        this._activeList = this.particles;
    }

    createTrail(x, y, trailId, frameCount) {
        // Trail design philosophy: ONE small distinctive particle per spawn,
        // additive blend (handled by particle draw), tight life so the ribbon
        // stays close to the player. Polish comes from sharp color choices and
        // the dedicated 'trail' render pass (drawn between enemies and player
        // sprite) — NOT from particle bulk. Mythics get one accent spark to
        // signal premium, not a full second cloud.
        const trailConfigs = {
            // STANDARD TIER -- count=1, modest size, short life ------------
            'fire':    { colors: ['#ff7700', '#ffaa00'],            type: 'flame',      size: 1.4, options: { speed: 30,  lifeBonus: -0.1 } },
            'ice':     { colors: ['#aaf0ff', '#ffffff'],            type: 'spark',      size: 1.3, options: { speed: 25,  lifeBonus: 0.0 } },
            'toxic':   { colors: ['#aaff00', '#39ff14'],            type: 'smoke',      size: 1.5, options: { speed: 15,  lifeBonus: 0.1 } },
            'void':    { colors: ['#cc00ff', '#6600cc'],            type: 'dark_smoke', size: 1.4, options: { speed: 15,  lifeBonus: 0.2 } },
            'plasma':  { colors: ['#00e5ff', '#ff00e5'],            type: 'spark',      size: 1.3, options: { speed: 35,  lifeBonus: 0.0 } },
            'shadow':  { colors: ['#1a1a2e', '#000000'],            type: 'dark_smoke', size: 1.6, options: { speed: 10,  lifeBonus: 0.3 } },
            'blood':   { colors: ['#ff0000', '#8a0303'],            type: 'blood',      size: 1.4, options: { speed: 20,  gravity: true, lifeBonus: 0.0 } },
            'pixel':   { colors: ['#00ffcc', '#ff00ff', '#ffff00'], type: 'slash',      size: 1.4, options: { speed: 30,  lifeBonus: 0.0 } },
            'gold':    { colors: ['#ffd700', '#fff4a0'],            type: 'star',       size: 1.4, options: { speed: 25,  gravity: true, lifeBonus: 0.0 } },
            'nebula':  { colors: ['#ff99cc', '#99ccff'],            type: 'smoke',      size: 1.5, options: { speed: 12,  lifeBonus: 0.2 } },
            'rainbow': { colors: ['#ff0000', '#ffaa00', '#ffff00', '#00ff88', '#0088ff', '#cc00ff'], type: 'star', size: 1.4, options: { speed: 30, lifeBonus: 0.0 } },

            // MYTHIC CHEST TIER -- ONE accent spark, no second cloud -------
            'weapon_trail_void':    { colors: ['#3a0066', '#5500aa'], type: 'dark_smoke', size: 1.5, options: { speed: 15, lifeBonus: 0.2 }, accent: { type: 'star',  color: '#ffd700', size: 0.9, options: { speed: 50, gravity: true, lifeBonus: -0.1 }, every: 4 } },
            'weapon_trail_solar':   { colors: ['#ff2200', '#ffaa00'], type: 'flame',      size: 1.5, options: { speed: 35, lifeBonus: -0.1 }, accent: { type: 'spark', color: '#ffffff', size: 0.9, options: { speed: 60, lifeBonus: -0.1 }, every: 3 } },
            // 'weapon_trail_eclipse' was originally specced but cut on 2026-06-26
            // (black-on-black read poorly against the cosmic backdrop). Replaced
            // by Phoenix Fire — orange→white→cyan gradient with feather sparks.
            'weapon_trail_phoenix_fire': { colors: ['#ff4400', '#ffaa00', '#ffffff', '#00e5ff'], type: 'flame', size: 1.5, options: { speed: 35, lifeBonus: -0.1 }, accent: { type: 'spark', color: '#ffec6e', size: 1.0, options: { speed: 70, lifeBonus: -0.05 }, every: 3 } },
        };
        const config = trailConfigs[trailId];
        if (!config) return;

        this._activeList = this.trailParticles;
        const color = config.colors[frameCount % config.colors.length];
        this.addParticle(x, y, color, 1, config.type, config.size, config.options);

        // Mythic accent: one tiny bright spark every Nth spawn. Signals premium
        // without doubling the visual weight of the trail.
        if (config.accent && frameCount % config.accent.every === 0) {
            const a = config.accent;
            this.addParticle(x, y, a.color, 1, a.type, a.size, a.options);
        }
        this._activeList = this.particles;
    }
}