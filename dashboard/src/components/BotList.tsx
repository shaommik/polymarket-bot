import type { Bot, Niche } from '@shared/types';
import { useState } from 'react';
import { BotCard } from './BotCard.js';
import { NICHE_COLORS } from './constants.js';

interface BotListProps {
  bots: Bot[];
  selectedBotId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onAddBot: () => void;
}

const ALL = 'all';

export function BotList({ bots, selectedBotId, onSelect, onToggle, onAddBot }: BotListProps) {
  const [filter, setFilter] = useState<Niche | typeof ALL>(ALL);

  const niches = Array.from(new Set(bots.map(b => b.niche))) as Niche[];
  const visible = filter === ALL ? bots : bots.filter(b => b.niche === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip label="All" active={filter === ALL} onClick={() => setFilter(ALL)} />
        {niches.map(n => (
          <FilterChip
            key={n}
            label={n}
            active={filter === n}
            color={NICHE_COLORS[n]}
            onClick={() => setFilter(n)}
          />
        ))}
        <button
          onClick={onAddBot}
          className="ml-auto text-sm px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          + Add Bot
        </button>
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <div className="text-zinc-500 text-sm text-center py-8">
          {bots.length === 0 ? 'No bots yet — add one to get started.' : 'No bots in this niche.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map(bot => (
            <BotCard
              key={bot.id}
              bot={bot}
              selected={selectedBotId === bot.id}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, color, onClick }: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-full font-medium capitalize transition-colors border ${
        active ? 'border-transparent text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
      }`}
      style={active ? { backgroundColor: color ?? '#3B82F6' } : {}}
    >
      {label}
    </button>
  );
}
