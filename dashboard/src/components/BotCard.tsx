import type { Bot } from '@shared/types';
import { usePnL } from '../hooks/usePnL.js';
import { NICHE_COLORS } from './constants.js';
import clsx from 'clsx';

interface BotCardProps {
  bot: Bot;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}

function fmt(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2);
}

export function BotCard({ bot, selected, onSelect, onToggle }: BotCardProps) {
  const { data, loading } = usePnL(bot.id);
  const summary = data?.summary;
  const color = NICHE_COLORS[bot.niche] ?? '#6B7280';

  return (
    <div
      onClick={() => onSelect(bot.id)}
      className={clsx(
        'rounded-xl border p-4 cursor-pointer transition-all',
        selected ? 'border-blue-500 bg-blue-950' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500',
        !bot.active && 'opacity-50',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-semibold text-white text-sm truncate max-w-[140px]">{bot.name}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(bot.id, !bot.active); }}
          title={bot.active ? 'Click to pause' : 'Click to resume'}
          className={clsx(
            'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
            bot.active
              ? 'bg-emerald-900 text-emerald-400 hover:bg-red-950 hover:text-red-400'
              : 'bg-zinc-800 text-zinc-400 hover:bg-emerald-950 hover:text-emerald-400',
          )}
        >
          {bot.active ? '⏸ Running' : '▶ Paused'}
        </button>
      </div>

      {/* Niche + speed */}
      <div className="flex gap-2 mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 capitalize">{bot.niche}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{bot.speed}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{bot.sizeScale}x</span>
      </div>

      {/* PnL stats */}
      {loading ? (
        <div className="text-xs text-zinc-500">Loading...</div>
      ) : summary ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Total PnL" value={fmt(summary.totalPnl)} positive={summary.totalPnl >= 0} />
          <Stat label="Unrealized" value={fmt(summary.unrealizedPnl)} positive={summary.unrealizedPnl >= 0} />
          <Stat label="Trades" value={String(summary.totalTrades)} />
          <Stat label="Win Rate" value={`${(summary.avgWinRate * 100).toFixed(0)}%`} positive={summary.avgWinRate >= 0.5} />
        </div>
      ) : (
        <div className="text-xs text-zinc-500">No data yet</div>
      )}
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={clsx(
        'text-sm font-mono font-medium',
        positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : 'text-zinc-200',
      )}>
        {value}
      </div>
    </div>
  );
}
