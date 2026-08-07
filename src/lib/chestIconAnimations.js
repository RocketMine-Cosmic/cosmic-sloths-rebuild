// Maps a chest pilot-icon cosmetic_id → CSS animation class so the static
// generated PNG reads as "alive" in the Wardrobe thumbnail, the preview
// modal, and the live in-game medallion.
//
// Keyframes live in index.css under @layer utilities and the classes are
// listed in tailwind.config.js safelist so they survive the Tailwind purge.

const CHEST_ICON_ANIM = {
    animated_pilot_orbiting_moon:    'chest-icon-orbit-drift',
    animated_pilot_glitch_skull:     'chest-icon-glitch',
    animated_pilot_rotating_blackhole: 'chest-icon-accretion-spin',
    animated_pilot_phoenix_wing:     'chest-icon-phoenix-flicker',
    animated_pilot_eye_of_void:      'chest-icon-eye-pulse',
    animated_pilot_plasma_core:      'chest-icon-plasma-crackle',
};

export function getChestIconAnimClass(cosmeticId) {
    return CHEST_ICON_ANIM[cosmeticId] || '';
}