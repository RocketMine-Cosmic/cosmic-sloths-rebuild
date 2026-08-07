/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  safelist: [
    // Chest Title Flair classes — applied dynamically as `title-flair-${id}`
    // (see TitleFlairDemo + PlayerTitle), so they aren't found as literal
    // substrings and would otherwise be purged. The keyframe + class rules
    // themselves live in index.css under @layer utilities.
    'title-flair-rainbow_shimmer',
    'title-flair-blue_flame',
    'title-flair-liquid_chrome',
    // Standard ("Support the Devs") title flair classes — also applied dynamically.
    'title-flair-cyan_glow',
    'title-flair-gold_outline',
    'title-flair-pink_pop',
    'title-flair-emerald_mint',
    'title-flair-violet_haze',
    // Chest LB Frame glow animations — applied dynamically via lbFrameStyles.js.
    'lb-frame-glow-gold',
    'lb-frame-arc-flicker',
    'lb-frame-nebula-drift',
    'lb-frame-glitch-pulse',
    'lb-frame-eclipse-glow',
    // Standard LB Frame pulse / gradient-shift animations.
    'std-lb-pulse-cyan',
    'std-lb-pulse-gold',
    'std-lb-pulse-purple',
    'std-lb-grad-shift',
    // Standard animated pilot icon motions.
    'std-icon-spin',
    'std-icon-pulse',
    'std-icon-bounce',
    'std-icon-glow',
    'std-icon-wobble',
    // Chest Mythic — Meteor FX shimmer (applied dynamically in preview + feed).
    'meteor-fx-gold-lightning',
    // Chest Epic — Animated pilot icon wrapper classes (applied dynamically
    // via chestIconAnimations.js + ChestIconImage — keyframes live in index.css).
    'chest-icon-wrap',
    'chest-icon-halo',
    'chest-icon-rgb-r',
    'chest-icon-rgb-b',
    'chest-icon-orbit-drift',
    'chest-icon-glitch',
    'chest-icon-accretion-spin',
    'chest-icon-phoenix-flicker',
    'chest-icon-eye-pulse',
    'chest-icon-plasma-crackle',
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}