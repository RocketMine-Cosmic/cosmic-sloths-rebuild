import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Copy, Check } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// ─── EDIT YOUR SKU IDs HERE ───────────────────────────────────────────────────
// Copy the exact SKU IDs from your OmenX Developer Portal and paste them below.

const SKU_CONFIG = {
  // In-game consumables
  consumables: [
    { key: 'banish',        label: 'Banish',          sku: 'ingame-banish' },
    { key: 'reroll',        label: 'Reroll',           sku: 'ingame-reroll' },
    { key: 'squadUltimate', label: 'Squad Ultimate',   sku: 'ingame-squad-buff' },
    { key: 'revive',        label: 'Revive',           sku: 'ingame-revive' },
    { key: 'xpSession',     label: 'XP Buff (60 min)', sku: 'ingame-xp-buff' },
  ],

  // Stat upgrades (5 levels each)
  statUpgrades: {
    permanent: [
      'stat-upgrade-permanent-lvl1',
      'stat-upgrade-permanent-lvl2',
      'stat-upgrade-permanent-lvl3',
      'stat-upgrade-permanent-lvl4',
      'stat-upgrade-permanent-lvl5',
    ],
    weekly: [
      'stat-upgrade-weekly-lvl1',
      'stat-upgrade-weekly-lvl2',
      'stat-upgrade-weekly-lvl3',
      'stat-upgrade-weekly-lvl4',
      'stat-upgrade-weekly-lvl5',
    ],
    seasonal: [
      'stat-upgrade-seasonal-lvl1',
      'stat-upgrade-seasonal-lvl2',
      'stat-upgrade-seasonal-lvl3',
      'stat-upgrade-seasonal-lvl4',
      'stat-upgrade-seasonal-lvl5',
    ],
  },

  // Weapon upgrades (5 levels each)
  weaponUpgrades: {
    permanent: [
      'weapon-upgrades-permanent-lvl1',
      'weapon-upgrades-permanent-lvl2',
      'weapon-upgrades-permanent-lvl3',
      'weapon-upgrades-permanent-lvl4',
      'weapon-upgrades-permanent-lvl5',
    ],
    weekly: [
      'weapon-upgrades-weekly-lvl1',
      'weapon-upgrades-weekly-lvl2',
      'weapon-upgrades-weekly-lvl3',
      'weapon-upgrades-weekly-lvl4',
      'weapon-upgrades-weekly-lvl5',
    ],
    seasonal: [
      'weapon-upgrades-seasonal-lvl1',
      'weapon-upgrades-seasonal-lvl2',
      'weapon-upgrades-seasonal-lvl3',
      'weapon-upgrades-seasonal-lvl4',
      'weapon-upgrades-seasonal-lvl5',
    ],
  },

  // Character talents (3 levels each)
  talents: {
    permanent: [
      'character-talents-permanent-lvl1',
      'character-talents-permanent-lvl2',
      'character-talents-permanent-lvl3',
    ],
    weekly: [
      'character-talents-weekly-lvl1',
      'character-talents-weekly-lvl2',
      'character-talents-weekly-lvl3',
    ],
    seasonal: [
      'character-talents-seasonal-lvl1',
      'character-talents-seasonal-lvl2',
      'character-talents-seasonal-lvl3',
    ],
  },

  // Cosmetics (keyed by gold cost tier)
  trails: {
    3000:  'character-trails-basic',
    10000: 'character-trails-advanced',
    20000: 'character-trails-epic',
    30000: 'character-trails-leg',
  },
  killEffects: {
    3000:  'character-kill-effects-basic',
    12000: 'character-kill-effects-advanced',
    25000: 'character-kill-effects-epic',
  },
  skins: {
    5000:  'character-skins-basic',
    20000: 'character-skins-advance',
  },
};
// ─────────────────────────────────────────────────────────────────────────────

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 text-slate-500 hover:text-cyan-400 transition-colors"
      title="Copy SKU"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function SkuRow({ label, sku }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-800/60 last:border-0">
      <span className="text-slate-400 text-sm w-48 shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1">
        <code className="text-cyan-300 text-sm font-mono bg-slate-900/60 px-2 py-0.5 rounded flex-1">{sku}</code>
        <CopyBtn text={sku} />
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 mb-4">
      <h3 className="text-white font-bold text-sm uppercase tracking-widest mb-3 text-cyan-400">{title}</h3>
      {children}
    </div>
  );
}

function TieredSkus({ data, levels }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {['permanent', 'weekly', 'seasonal'].map(tier => (
        <div key={tier}>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{tier}</div>
          {data[tier].map((sku, i) => (
            <SkuRow key={i} label={`Level ${i + 1}`} sku={sku} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function SkuEditor() {
  const navigate = useNavigate();

  const generateSkuMapCode = () => {
    const lines = [
      `export const IN_GAME_SKUS = {`,
      ...SKU_CONFIG.consumables.map(c => `    ${c.key}: '${c.sku}',`),
      `};`,
    ];
    return lines.join('\n');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => navigate('/admin')}
          className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Admin
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-black uppercase tracking-widest text-white mb-2">SKU Editor</h1>
          <p className="text-slate-400 text-sm">
            Reference for all OmenX SKU IDs used in the game. To change a SKU, edit <code className="text-cyan-400">lib/skuMap.js</code> directly.
          </p>
        </div>

        <div className="bg-amber-900/20 border border-amber-500/40 rounded-xl p-4 mb-6 text-amber-300 text-sm">
          ⚠️ To update SKU IDs: open <code className="font-mono">lib/skuMap.js</code> and edit the values there. This page is a read-only reference.
        </div>

        <Section title="Consumables">
          {SKU_CONFIG.consumables.map(c => (
            <SkuRow key={c.key} label={c.label} sku={c.sku} />
          ))}
        </Section>

        <Section title="Stat Upgrades">
          <TieredSkus data={SKU_CONFIG.statUpgrades} />
        </Section>

        <Section title="Weapon Upgrades">
          <TieredSkus data={SKU_CONFIG.weaponUpgrades} />
        </Section>

        <Section title="Character Talents">
          <TieredSkus data={SKU_CONFIG.talents} />
        </Section>

        <Section title="Trails (by gold cost)">
          {Object.entries(SKU_CONFIG.trails).map(([cost, sku]) => (
            <SkuRow key={cost} label={`${Number(cost).toLocaleString()} gold`} sku={sku} />
          ))}
        </Section>

        <Section title="Kill Effects (by gold cost)">
          {Object.entries(SKU_CONFIG.killEffects).map(([cost, sku]) => (
            <SkuRow key={cost} label={`${Number(cost).toLocaleString()} gold`} sku={sku} />
          ))}
        </Section>

        <Section title="Skins (by gold cost)">
          {Object.entries(SKU_CONFIG.skins).map(([cost, sku]) => (
            <SkuRow key={cost} label={`${Number(cost).toLocaleString()} gold`} sku={sku} />
          ))}
        </Section>
      </div>
    </div>
  );
}