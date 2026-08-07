import React, { useState } from 'react';
import { Download, Copy, Check } from 'lucide-react';

const SKU_CONFIG = {
  consumables: [
    { key: 'banish', label: 'Banish', sku: 'ingame-banish' },
    { key: 'reroll', label: 'Reroll', sku: 'ingame-reroll' },
    { key: 'squadUltimate', label: 'Squad Ultimate', sku: 'ingame-squad-buff' },
    { key: 'revive', label: 'Revive', sku: 'ingame-revive' },
    { key: 'xpSession', label: 'XP Buff (60 min)', sku: 'ingame-xp-buff' },
  ],
  statUpgrades: {
    permanent: ['stat-upgrade-permanent-lvl1', 'stat-upgrade-permanent-lvl2', 'stat-upgrade-permanent-lvl3', 'stat-upgrade-permanent-lvl4', 'stat-upgrade-permanent-lvl5'],
    weekly: ['stat-upgrade-weekly-lvl1', 'stat-upgrade-weekly-lvl2', 'stat-upgrade-weekly-lvl3', 'stat-upgrade-weekly-lvl4', 'stat-upgrade-weekly-lvl5'],
    seasonal: ['stat-upgrade-seasonal-lvl1', 'stat-upgrade-seasonal-lvl2', 'stat-upgrade-seasonal-lvl3', 'stat-upgrade-seasonal-lvl4', 'stat-upgrade-seasonal-lvl5'],
  },
  weaponUpgrades: {
    permanent: ['weapon-upgrades-permanent-lvl1', 'weapon-upgrades-permanent-lvl2', 'weapon-upgrades-permanent-lvl3', 'weapon-upgrades-permanent-lvl4', 'weapon-upgrades-permanent-lvl5'],
    weekly: ['weapon-upgrades-weekly-lvl1', 'weapon-upgrades-weekly-lvl2', 'weapon-upgrades-weekly-lvl3', 'weapon-upgrades-weekly-lvl4', 'weapon-upgrades-weekly-lvl5'],
    seasonal: ['weapon-upgrades-seasonal-lvl1', 'weapon-upgrades-seasonal-lvl2', 'weapon-upgrades-seasonal-lvl3', 'weapon-upgrades-seasonal-lvl4', 'weapon-upgrades-seasonal-lvl5'],
  },
  talents: {
    permanent: ['character-talents-permanent-lvl1', 'character-talents-permanent-lvl2', 'character-talents-permanent-lvl3'],
    weekly: ['character-talents-weekly-lvl1', 'character-talents-weekly-lvl2', 'character-talents-weekly-lvl3'],
    seasonal: ['character-talents-seasonal-lvl1', 'character-talents-seasonal-lvl2', 'character-talents-seasonal-lvl3'],
  },
  trails: { 3000: 'character-trails-basic', 10000: 'character-trails-advanced', 20000: 'character-trails-epic', 30000: 'character-trails-leg' },
  killEffects: { 3000: 'character-kill-effects-basic', 12000: 'character-kill-effects-advanced', 25000: 'character-kill-effects-epic' },
  skins: { 5000: 'character-skins-basic', 20000: 'character-skins-advance' },
};

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
    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-800/60 last:border-0 text-xs">
      <span className="text-slate-400 w-40 shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1">
        <code className="text-cyan-300 font-mono bg-slate-900/60 px-2 py-0.5 rounded flex-1 text-[10px]">{sku}</code>
        <CopyBtn text={sku} />
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 mb-4">
      <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-3 text-cyan-400">{title}</h3>
      {children}
    </div>
  );
}

function TieredSkus({ data }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {['permanent', 'weekly', 'seasonal'].map(tier => (
        <div key={tier}>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{tier}</div>
          {data[tier].map((sku, i) => (
            <SkuRow key={i} label={`Level ${i + 1}`} sku={sku} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function AdminSkus({ adminKey }) {
  const handleDownloadCsv = () => {
    let csv = "SKU,Category,Item Name\n";
    
    SKU_CONFIG.consumables.forEach(c => {
      csv += `${c.sku},Consumables,${c.label}\n`;
    });

    ['permanent', 'weekly', 'seasonal'].forEach(tier => {
      SKU_CONFIG.statUpgrades[tier].forEach((sku, i) => {
        csv += `${sku},Stat Upgrades,${tier.charAt(0).toUpperCase() + tier.slice(1)} Level ${i + 1}\n`;
      });
    });

    ['permanent', 'weekly', 'seasonal'].forEach(tier => {
      SKU_CONFIG.weaponUpgrades[tier].forEach((sku, i) => {
        csv += `${sku},Weapon Upgrades,${tier.charAt(0).toUpperCase() + tier.slice(1)} Level ${i + 1}\n`;
      });
    });

    ['permanent', 'weekly', 'seasonal'].forEach(tier => {
      SKU_CONFIG.talents[tier].forEach((sku, i) => {
        csv += `${sku},Character Talents,${tier.charAt(0).toUpperCase() + tier.slice(1)} Level ${i + 1}\n`;
      });
    });

    Object.entries(SKU_CONFIG.trails).forEach(([cost, sku]) => {
      csv += `${sku},Trails,${Number(cost).toLocaleString()} gold\n`;
    });

    Object.entries(SKU_CONFIG.killEffects).forEach(([cost, sku]) => {
      csv += `${sku},Kill Effects,${Number(cost).toLocaleString()} gold\n`;
    });

    Object.entries(SKU_CONFIG.skins).forEach(([cost, sku]) => {
      csv += `${sku},Skins,${Number(cost).toLocaleString()} gold\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'cosmic_tokens_skus.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-blue-400 uppercase tracking-widest">📦 SKU Reference</h2>
        <button
          onClick={handleDownloadCsv}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
        >
          <Download size={13} /> Export CSV
        </button>
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
  );
}