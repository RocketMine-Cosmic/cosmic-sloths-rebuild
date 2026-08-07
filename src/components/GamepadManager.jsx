import { useEffect } from 'react';

export default function GamepadManager() {
    useEffect(() => {
        let animationFrameId;
        let lastActionTime = 0;
        let isGamepadActive = false;
        let cursorX = window.innerWidth / 2;
        let cursorY = window.innerHeight / 2;
        // When the app is embedded in an iframe without a `gamepad` permissions
        // policy (e.g. the Omen website), `navigator.getGamepads()` throws a
        // SecurityError. We disable polling permanently once we hit that — the
        // policy can't change at runtime, so retrying is pointless.
        let gamepadAccessBlocked = false;
        const safeGetGamepads = () => {
            if (gamepadAccessBlocked) return [];
            try {
                return navigator.getGamepads ? navigator.getGamepads() : [];
            } catch {
                gamepadAccessBlocked = true;
                return [];
            }
        };

        // Expose a global flag the GameEngine can check before calling
        // navigator.getGamepads() each frame — that call is surprisingly
        // expensive in some browsers (allocates a fresh array) and we don't
        // want to pay for it 60×/sec when no gamepad is plugged in.
        const onGamepadConnected = () => { window.__gamepadConnected = true; };
        const onGamepadDisconnected = () => {
            const pads = safeGetGamepads();
            const anyConnected = Array.from(pads).some(g => g && g.connected);
            window.__gamepadConnected = anyConnected;
        };
        // Pre-seed in case a gamepad was already connected before mount.
        if (typeof navigator !== 'undefined' && navigator.getGamepads) {
            const pads = safeGetGamepads();
            window.__gamepadConnected = Array.from(pads).some(g => g && g.connected);
        }
        window.addEventListener('gamepadconnected', onGamepadConnected);
        window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
        
        let cursorEl = document.getElementById('gamepad-virtual-cursor');
        if (!cursorEl) {
            cursorEl = document.createElement('div');
            cursorEl.id = 'gamepad-virtual-cursor';
            cursorEl.style.position = 'fixed';
            cursorEl.style.left = '0px';
            cursorEl.style.top = '0px';
            cursorEl.style.width = '36px';
            cursorEl.style.height = '36px';
            cursorEl.style.borderRadius = '50%';
            cursorEl.style.border = '2px solid rgba(12, 167, 184, 0.9)';
            cursorEl.style.backgroundColor = 'rgba(217, 70, 239, 0.15)';
            cursorEl.style.boxShadow = '0 0 20px rgba(12, 167, 184, 0.6), inset 0 0 15px rgba(217, 70, 239, 0.4)';
            cursorEl.style.transform = 'translate3d(-50%, -50%, 0)';
            cursorEl.style.pointerEvents = 'none';
            cursorEl.style.zIndex = '999999';
            cursorEl.style.display = 'none';
            cursorEl.style.transition = 'opacity 0.2s';
            cursorEl.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:6px;height:6px;background-color:#fff;border-radius:50%;box-shadow:0 0 12px #fff, 0 0 20px #D946EF;"></div>';
            document.body.appendChild(cursorEl);
        }

        const state = {
            confirm: false, cancel: false, pause: false, lb: false, rb: false,
            up: false, down: false, left: false, right: false
        };

        const handleUserInteraction = (e) => {
            if (e.type === 'mousemove') {
                if (e.movementX === undefined && e.movementY === undefined) return;
                if (Math.abs(e.movementX || 0) < 3 && Math.abs(e.movementY || 0) < 3) return;
            }
            if (isGamepadActive) {
                isGamepadActive = false;
                document.body.classList.remove('gamepad-active');
                if (cursorEl) cursorEl.style.display = 'none';
            }
        };
        
        window.addEventListener('mousemove', handleUserInteraction);
        window.addEventListener('mousedown', handleUserInteraction);
        window.addEventListener('keydown', handleUserInteraction);
        window.addEventListener('touchstart', handleUserInteraction);

        const getFocusableElements = () => {
            let container = document;
            const modal = document.querySelector('.z-50');
            if (modal) {
                container = modal;
            }

            return Array.from(container.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(el => {
                const tag = el.tagName.toLowerCase();
                if (tag === 'div' || tag === 'span') {
                    const role = el.getAttribute('role');
                    if (role !== 'button' && role !== 'link' && role !== 'menuitem' && role !== 'tab') {
                        return false;
                    }
                }

                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || el.offsetWidth === 0 || el.offsetHeight === 0) return false;
                
                const rect = el.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                return (
                    centerX > 0 &&
                    centerX < (window.innerWidth || document.documentElement.clientWidth)
                );
            });
        };

        const moveFocus = (dirX, dirY) => {
            const focusable = getFocusableElements();
            if (focusable.length === 0) return;

            const active = document.activeElement;
            if (!active || !focusable.includes(active)) {
                const first = focusable[0];
                first.focus({ preventScroll: true });
                return;
            }

            if (active.tagName.toLowerCase() === 'input' && active.type === 'text') return;

            const activeRect = active.getBoundingClientRect();
            let bestCandidate = null;
            let minScore = Infinity;

            focusable.forEach(el => {
                if (el === active) return;
                const rect = el.getBoundingClientRect();
                
                const dx = (rect.left + rect.width / 2) - (activeRect.left + activeRect.width / 2);
                const dy = (rect.top + rect.height / 2) - (activeRect.top + activeRect.height / 2);

                if (dirX > 0 && dx <= 0) return;
                if (dirX < 0 && dx >= 0) return;
                if (dirY > 0 && dy <= 0) return;
                if (dirY < 0 && dy >= 0) return;

                const distance = Math.hypot(dx, dy);
                const perpDist = dirX !== 0 ? Math.abs(dy) : Math.abs(dx);
                const primaryDist = dirX !== 0 ? Math.abs(dx) : Math.abs(dy);

                const score = primaryDist + perpDist * 5;

                if (score < minScore) {
                    minScore = score;
                    bestCandidate = el;
                }
            });

            const focusAndScroll = (el) => {
                el.focus({ preventScroll: true });
                const scrollContainer = el.closest('.overflow-y-auto, .overflow-auto, [style*="overflow-y: auto"]');
                if (scrollContainer) {
                    const containerRect = scrollContainer.getBoundingClientRect();
                    const elRect = el.getBoundingClientRect();
                    const targetTop = scrollContainer.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2);
                    scrollContainer.scrollTo({ top: targetTop, behavior: 'auto' });
                } else {
                    const elRect = el.getBoundingClientRect();
                    const targetTop = window.scrollY + elRect.top - (window.innerHeight / 2) + (elRect.height / 2);
                    window.scrollTo({ top: targetTop, behavior: 'auto' });
                }
            };

            if (bestCandidate) {
                focusAndScroll(bestCandidate);
            } else {
                // Fallback to 1D array wrapping if 2D spatial math fails or reaches an edge
                const activeIndex = focusable.indexOf(active);
                if (activeIndex !== -1) {
                    let nextIndex = activeIndex;
                    // Only wrap vertically to prevent accidental left/right inputs from acting like up/down
                    if (dirY > 0) {
                        nextIndex = (activeIndex + 1) % focusable.length;
                    } else if (dirY < 0) {
                        nextIndex = (activeIndex - 1 + focusable.length) % focusable.length;
                    }
                    if (nextIndex !== activeIndex && focusable[nextIndex]) {
                        focusAndScroll(focusable[nextIndex]);
                    }
                } else if (focusable.length > 0) {
                    focusAndScroll(focusable[0]);
                }
            }
        };

        const checkGamepad = () => {
            const inGame = window.location.pathname.includes('/game');
            const modalOpen = document.querySelector('.z-50') !== null;
            const uiActive = !inGame || modalOpen;

            if (typeof navigator !== 'undefined' && navigator.getGamepads && !gamepadAccessBlocked) {
                const gamepads = safeGetGamepads();
                const gp = gamepads.find(g => g && g.connected);
                
                if (gp) {
                    const now = Date.now();
                    const throttle = 200;

                    const axeX = gp.axes[0] || 0;
                    const axeY = gp.axes[1] || 0;
                    const axeRightY = gp.axes[3] || 0;
                    const dpadUp = gp.buttons[12]?.pressed || gp.axes[9] === -1 || gp.axes[9] === -1.2857142686843872;
                    const dpadDown = gp.buttons[13]?.pressed || gp.axes[9] === 0.14285719394683838 || gp.axes[9] === 1;
                    const dpadLeft = gp.buttons[14]?.pressed || gp.axes[9] === 0.7142857313156128 || gp.axes[9] === -1;
                    const dpadRight = gp.buttons[15]?.pressed || gp.axes[9] === -0.4285714030265808 || gp.axes[9] === 1;
                    
                    const altAxeX = gp.axes[4] || gp.axes[6] || 0;
                    const altAxeY = gp.axes[5] || gp.axes[7] || 0;
                    
                    const buttonA = gp.buttons[0]?.pressed;
                    const buttonB = gp.buttons[1]?.pressed;
                    const buttonStart = gp.buttons[9]?.pressed || gp.buttons[8]?.pressed;
                    const buttonLB = gp.buttons[4]?.pressed;
                    const buttonRB = gp.buttons[5]?.pressed;

                    let cursorDx = 0;
                    let cursorDy = 0;

                    if (Math.abs(axeX) > 0.15) cursorDx += axeX;
                    if (Math.abs(axeY) > 0.15) cursorDy += axeY;
                    if (Math.abs(altAxeX) > 0.15) cursorDx += altAxeX;
                    if (Math.abs(altAxeY) > 0.15) cursorDy += altAxeY;
                    
                    if (dpadLeft) cursorDx -= 1;
                    if (dpadRight) cursorDx += 1;
                    if (dpadUp) cursorDy -= 1;
                    if (dpadDown) cursorDy += 1;

                    // Normalize so diagonals aren't faster
                    const len = Math.hypot(cursorDx, cursorDy);
                    if (len > 1) {
                        cursorDx /= len;
                        cursorDy /= len;
                    }

                    if (Math.abs(cursorDx) > 0 || Math.abs(cursorDy) > 0 || buttonA || buttonB || buttonStart || buttonLB || buttonRB || Math.abs(axeRightY) > 0.15) {
                        if (!isGamepadActive) {
                            document.body.classList.add('gamepad-active');
                        }
                        isGamepadActive = true;
                    }

                    if (uiActive && isGamepadActive) {
                        if (!inGame) {
                            cursorEl.style.display = 'block';
                            
                            // Update cursor position
                            const speed = 30; // Increased speed for faster movement
                            cursorX += cursorDx * speed;
                            cursorY += cursorDy * speed;
                            
                            cursorX = Math.max(0, Math.min(window.innerWidth, cursorX));
                            cursorY = Math.max(0, Math.min(window.innerHeight, cursorY));
                            
                            // Use hardware-accelerated transforms for perfectly smooth 60fps movement
                            cursorEl.style.transform = `translate3d(calc(${cursorX}px - 50%), calc(${cursorY}px - 50%), 0)`;

                            // Right Stick Scroll
                            if (Math.abs(axeRightY) > 0.15) {
                                const scrollAmount = axeRightY * 25;
                                cursorEl.style.display = 'none';
                                const elUnderCursor = document.elementFromPoint(cursorX, cursorY);
                                cursorEl.style.display = 'block';
                                
                                let scrolled = false;
                                if (elUnderCursor) {
                                    const scrollContainer = elUnderCursor.closest('.overflow-y-auto, .overflow-auto, [style*="overflow-y: auto"]');
                                    if (scrollContainer) {
                                        scrollContainer.scrollTop += scrollAmount;
                                        scrolled = true;
                                    }
                                }
                                if (!scrolled) {
                                    window.scrollBy(0, scrollAmount);
                                }
                            }

                            // Hover & Click logic
                            cursorEl.style.display = 'none';
                            const elUnderCursor = document.elementFromPoint(cursorX, cursorY);
                            cursorEl.style.display = 'block';

                            if (elUnderCursor) {
                                const focusable = elUnderCursor.closest('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
                                if (focusable && focusable !== document.activeElement) {
                                    focusable.focus({ preventScroll: true });
                                } else if (!focusable && document.activeElement) {
                                    document.activeElement.blur();
                                }
                            }

                            let actionTaken = false;

                            if (buttonA && !state.confirm) {
                                if (document.activeElement && typeof document.activeElement.click === 'function') {
                                    document.activeElement.click();
                                }
                                actionTaken = true;
                            }

                            if (buttonB && !state.cancel) {
                                const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => 
                                    b.textContent.match(/cancel|close|back|return|resume/i) && !b.disabled
                                );
                                if (cancelBtn) {
                                    cancelBtn.click();
                                }
                                actionTaken = true;
                            }

                            if (buttonLB && (!state.lb || now - lastActionTime > throttle)) {
                                const leftBtn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('.lucide-chevron-left'));
                                if (leftBtn) { leftBtn.click(); actionTaken = true; }
                            }
                            
                            if (buttonRB && (!state.rb || now - lastActionTime > throttle)) {
                                const rightBtn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('.lucide-chevron-right'));
                                if (rightBtn) { rightBtn.click(); actionTaken = true; }
                            }

                            if (actionTaken) {
                                lastActionTime = now;
                            }
                        } else {
                            cursorEl.style.display = 'none';
                            
                            let active = document.activeElement;
                            const focusable = getFocusableElements();
                            
                            let isActiveVisible = false;
                            if (active && focusable.includes(active)) {
                                const rect = active.getBoundingClientRect();
                                if (rect.bottom >= -50 && rect.top <= (window.innerHeight || document.documentElement.clientHeight) + 50) {
                                    isActiveVisible = true;
                                }
                            }

                            if (!isActiveVisible && focusable.length > 0) {
                                let bestCenterEl = null;
                                let minCenterDist = Infinity;
                                const centerY = (window.innerHeight || document.documentElement.clientHeight) / 2;
                                
                                focusable.forEach(el => {
                                    const rect = el.getBoundingClientRect();
                                    const dist = Math.abs((rect.top + rect.height / 2) - centerY);
                                    if (dist < minCenterDist) {
                                        minCenterDist = dist;
                                        bestCenterEl = el;
                                    }
                                });
                                
                                if (bestCenterEl) {
                                    bestCenterEl.focus({ preventScroll: true });
                                    active = bestCenterEl;
                                }
                            }

                            const isUp = cursorDy < -0.5;
                            const isDown = cursorDy > 0.5;
                            const isLeft = cursorDx < -0.5;
                            const isRight = cursorDx > 0.5;

                            let actionTaken = false;

                            if (isUp && (!state.up || now - lastActionTime > throttle)) { moveFocus(0, -1); actionTaken = true; }
                            else if (isDown && (!state.down || now - lastActionTime > throttle)) { moveFocus(0, 1); actionTaken = true; }
                            else if (isLeft && (!state.left || now - lastActionTime > throttle)) { moveFocus(-1, 0); actionTaken = true; }
                            else if (isRight && (!state.right || now - lastActionTime > throttle)) { moveFocus(1, 0); actionTaken = true; }

                            if (buttonA && !state.confirm) {
                                if (document.activeElement && typeof document.activeElement.click === 'function') {
                                    document.activeElement.click();
                                }
                                actionTaken = true;
                            }

                            if (buttonB && !state.cancel) {
                                const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => 
                                    b.textContent.match(/cancel|close|back|return|resume/i) && !b.disabled
                                );
                                if (cancelBtn) {
                                    cancelBtn.click();
                                }
                                actionTaken = true;
                            }

                            if (actionTaken) {
                                lastActionTime = now;
                            }

                            state.up = isUp;
                            state.down = isDown;
                            state.left = isLeft;
                            state.right = isRight;
                        }
                    } else {
                        cursorEl.style.display = 'none';
                    }

                    if (buttonStart && !state.pause && now - lastActionTime > throttle) {
                        if (inGame && !modalOpen) {
                            const pauseBtn = document.getElementById('pause-game-btn');
                            if (pauseBtn) pauseBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                            lastActionTime = now;
                        } else if (modalOpen) {
                            const resumeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Resume'));
                            if (resumeBtn) resumeBtn.click();
                            lastActionTime = now;
                        }
                    }

                    state.confirm = buttonA;
                    state.cancel = buttonB;
                    state.pause = buttonStart;
                    state.lb = buttonLB;
                    state.rb = buttonRB;
                }
            }
            animationFrameId = requestAnimationFrame(checkGamepad);
        };

        animationFrameId = requestAnimationFrame(checkGamepad);
        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('mousemove', handleUserInteraction);
            window.removeEventListener('mousedown', handleUserInteraction);
            window.removeEventListener('keydown', handleUserInteraction);
            window.removeEventListener('touchstart', handleUserInteraction);
            window.removeEventListener('gamepadconnected', onGamepadConnected);
            window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
            if (cursorEl) cursorEl.remove();
        };
    }, []);

    return null;
}