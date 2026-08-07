import React from 'react';

/**
 * Two-tier admin nav:
 *   Row 1 — group selector (Insights, Player Ops, Live Ops, …)
 *   Row 2 — tabs inside the active group only
 * Reduces button-wall fatigue and makes the current location obvious.
 */
export default function AdminTabNav({ groups, activeTab, onSelectTab }) {
    const visibleGroups = groups.filter(g => g.tabs.length > 0);
    const activeGroup =
        visibleGroups.find(g => g.tabs.some(t => t.id === activeTab)) || visibleGroups[0];

    if (!activeGroup) return null;

    return (
        <div className="sticky top-0 z-20 -mx-3 md:-mx-6 px-3 md:px-6 pt-2 pb-3 mb-5 bg-[#04020a]/85 backdrop-blur-md border-b border-slate-800/60">
            {/* Group row */}
            <div className="flex gap-1.5 flex-wrap mb-2">
                {visibleGroups.map(group => {
                    const isActive = group.id === activeGroup.id;
                    const isDanger = group.id === 'danger';
                    return (
                        <button
                            key={group.id}
                            onClick={() => onSelectTab(group.tabs[0].id)}
                            className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all border ${
                                isActive
                                    ? isDanger
                                        ? 'bg-red-700/90 text-white border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.35)]'
                                        : 'bg-cyan-700/90 text-white border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.35)]'
                                    : isDanger
                                        ? 'bg-red-950/40 text-red-300 hover:bg-red-900/50 border-red-900/50'
                                        : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-white border-slate-700'
                            }`}
                        >
                            {group.label}
                        </button>
                    );
                })}
            </div>

            {/* Active group's tabs */}
            <div className="flex gap-1.5 flex-wrap items-center">
                <span className={`text-[10px] font-black uppercase tracking-widest mr-1 ${activeGroup.id === 'danger' ? 'text-red-400' : 'text-slate-500'}`}>
                    {activeGroup.label.replace(/^[^\s]+\s/, '')} →
                </span>
                {activeGroup.tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    const isDanger = activeGroup.id === 'danger';
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onSelectTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
                                isActive
                                    ? isDanger
                                        ? 'bg-red-600 text-white'
                                        : 'bg-cyan-600 text-white'
                                    : isDanger
                                        ? 'bg-red-950/40 text-red-300 hover:bg-red-900/60 border border-red-900/40'
                                        : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white'
                            }`}
                        >
                            <Icon size={12} /> {tab.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}