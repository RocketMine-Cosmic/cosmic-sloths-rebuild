import React, { useState } from 'react';
import SquadList from './squads/SquadList';
import SquadDetailPanel from './squads/SquadDetailPanel';

// Squad admin hub — list on top, detail panel below. The detail panel
// orchestrates all squad-related editors (core, treasury, members, wars,
// danger zone) backed by the `adminSquadOps` function.
export default function AdminSquadManager({ walletAddress }) {
    const [selectedId, setSelectedId] = useState(null);

    return (
        <div className="space-y-4">
            <SquadList
                walletAddress={walletAddress}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
            />
            {selectedId && (
                <SquadDetailPanel
                    squadId={selectedId}
                    walletAddress={walletAddress}
                    onClose={() => setSelectedId(null)}
                />
            )}
        </div>
    );
}