import { useState } from 'react';
import type { Bot } from '@shared/types';
import { useBots } from './hooks/useBots.js';
import { BotList } from './components/BotList.js';
import { TradeLog } from './components/TradeLog.js';
import { PnLChart } from './components/PnLChart.js';
import { RiskGauge } from './components/RiskGauge.js';
import { AddBotModal } from './components/AddBotModal.js';

export default function App() {
  const { bots, loading, error, addBot, toggleBot } = useBots();
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const selectedBot: Bot | null = bots.find(b => b.id === selectedBotId) ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Polymarket Copy-Trading</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {bots.filter(b => b.active).length} active bot{bots.filter(b => b.active).length !== 1 ? 's' : ''} watching
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded-full bg-yellow-900 text-yellow-400 font-medium">
            PAPER MODE
          </span>
        </div>
      </header>

      <main className="px-6 py-6 flex flex-col gap-6 max-w-7xl mx-auto">
        {/* Error banner */}
        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Bot list */}
        {loading ? (
          <div className="text-zinc-500 text-sm">Loading bots...</div>
        ) : (
          <BotList
            bots={bots}
            selectedBotId={selectedBotId}
            onSelect={setSelectedBotId}
            onToggle={toggleBot}
            onAddBot={() => setShowAddModal(true)}
          />
        )}

        {/* Detail panel — shown when a bot is selected */}
        {selectedBot && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* PnL Chart — 2/3 width */}
            <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-300 mb-4">
                PnL — {selectedBot.name}
              </h2>
              <PnLChart bot={selectedBot} />
            </div>

            {/* Risk Gauge — 1/3 width */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-300 mb-4">Niche Exposure</h2>
              <RiskGauge />
            </div>

            {/* Trade Log — full width */}
            <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">
                Live Trade Log — {selectedBot.name}
              </h2>
              <TradeLog botId={selectedBotId} />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !selectedBot && bots.length > 0 && (
          <div className="text-center text-zinc-600 text-sm py-4">
            Select a bot above to view its PnL chart and trade log.
          </div>
        )}
      </main>

      {/* Add Bot Modal */}
      {showAddModal && (
        <AddBotModal
          onAdd={async (payload) => { await addBot(payload); }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
