import React from 'react';

// Renders a human-readable, inline summary of an AdminChangesLog `details` object.
// Falls back to nothing if there are no recognisable fields (the raw JSON
// expandable still appears in the parent component).

const formatVal = (v) => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    if (typeof v === 'number') return v.toLocaleString();
    if (Array.isArray(v)) return v.length === 0 ? '(none)' : v.join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
};

const formatKey = (k) =>
    k.replace(/_/g, ' ')
     .replace(/\b\w/g, c => c.toUpperCase());

const HIDDEN_KEYS = new Set(['period_id', 'period_type', 'wallet_address', 'admin_wallet']);

function buildChips(actionType, details) {
    const chips = [];
    if (!details || typeof details !== 'object') return chips;

    if (Array.isArray(details.permissions)) {
        chips.push({ label: 'Perms', value: details.permissions.length === 0 ? '(none)' : details.permissions.join(', ') });
    }
    if (details.target_wallet) {
        chips.push({ label: 'Target', value: `${details.target_wallet.slice(0, 6)}…${details.target_wallet.slice(-4)}` });
    }
    if (details.target_player_name) {
        chips.push({ label: 'Player', value: details.target_player_name });
    }
    if (details.admin_name) {
        chips.push({ label: 'Name', value: details.admin_name });
    }

    if (details.patched_fields && Array.isArray(details.patched_fields)) {
        chips.push({ label: 'Fields', value: details.patched_fields.join(', ') });
    }
    if (details.changes && typeof details.changes === 'object') {
        Object.entries(details.changes).forEach(([k, v]) => {
            if (v && typeof v === 'object' && 'from' in v && 'to' in v) {
                chips.push({ label: formatKey(k), value: `${formatVal(v.from)} → ${formatVal(v.to)}` });
            } else {
                chips.push({ label: formatKey(k), value: formatVal(v) });
            }
        });
    }

    if (typeof details.gold_delta === 'number') {
        chips.push({ label: 'Gold', value: (details.gold_delta >= 0 ? '+' : '') + details.gold_delta.toLocaleString() });
    }
    if (typeof details.amount === 'number') {
        chips.push({ label: 'Amount', value: details.amount.toLocaleString() });
    }
    if (details.reason) {
        chips.push({ label: 'Reason', value: details.reason });
    }

    if (details.sku_id) chips.push({ label: 'SKU', value: details.sku_id });
    if (details.action) chips.push({ label: 'Action', value: details.action });

    if (chips.length === 0) {
        Object.entries(details).forEach(([k, v]) => {
            if (HIDDEN_KEYS.has(k)) return;
            if (v === null || v === undefined) return;
            if (typeof v === 'object' && !Array.isArray(v)) return;
            chips.push({ label: formatKey(k), value: formatVal(v) });
        });
    }

    return chips.slice(0, 6);
}

export default function AdminLogDetailsSummary({ actionType, details }) {
    const chips = buildChips(actionType, details);
    if (chips.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
            {chips.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-slate-900/60 border border-slate-700/60 rounded px-1.5 py-0.5">
                    <span className="text-slate-500 font-bold uppercase tracking-wider">{c.label}:</span>
                    <span className="text-slate-200 font-mono">{c.value}</span>
                </span>
            ))}
        </div>
    );
}