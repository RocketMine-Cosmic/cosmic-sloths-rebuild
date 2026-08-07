import React, { useState, useEffect, useRef } from 'react';

export default function VirtualJoystick({ onChange }) {
    const [active, setActive] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [origin, setOrigin] = useState({ x: 0, y: 0 });
    const maxRadius = 50;
    const touchIdRef = useRef(null);

    const handleTouchStart = (e) => {
        if (active) return;
        // Ignore touches that originate on interactive elements (buttons, etc.)
        if (e.target.closest('button')) return;
        const touch = e.changedTouches[0];
        touchIdRef.current = touch.identifier;
        setOrigin({ x: touch.clientX, y: touch.clientY });
        setPosition({ x: touch.clientX, y: touch.clientY });
        setActive(true);
    };

    const handleTouchMove = (e) => {
        if (!active) return;
        
        let touch = null;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchIdRef.current) {
                touch = e.changedTouches[i];
                break;
            }
        }
        if (!touch) return;
        
        let dx = touch.clientX - origin.x;
        let dy = touch.clientY - origin.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > maxRadius) {
            dx = (dx / distance) * maxRadius;
            dy = (dy / distance) * maxRadius;
        }
        
        setPosition({ x: origin.x + dx, y: origin.y + dy });
        
        onChange({ 
            x: dx / maxRadius, 
            y: dy / maxRadius 
        });
    };

    const handleTouchEnd = (e) => {
        if (!active) return;
        
        let touchEnded = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchIdRef.current) {
                touchEnded = true;
                break;
            }
        }
        
        if (touchEnded) {
            setActive(false);
            touchIdRef.current = null;
            onChange({ x: 0, y: 0 });
        }
    };

    const [isTouch, setIsTouch] = useState(false);
    useEffect(() => {
        setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    }, []);

    if (!isTouch) return null;

    return (
        <div 
            className="absolute inset-0 z-30 touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
        >
            {active && (
                <div 
                    className="absolute rounded-full border-2 border-white/30 bg-white/10 pointer-events-none"
                    style={{
                        left: origin.x - maxRadius,
                        top: origin.y - maxRadius,
                        width: maxRadius * 2,
                        height: maxRadius * 2
                    }}
                >
                    <div 
                        className="absolute rounded-full bg-white/50 w-10 h-10"
                        style={{
                            left: position.x - origin.x + maxRadius - 20,
                            top: position.y - origin.y + maxRadius - 20
                        }}
                    />
                </div>
            )}
        </div>
    );
}