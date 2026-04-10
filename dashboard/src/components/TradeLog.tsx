import type { Trade } from '@shared/types';
import { useTrades } from '../hooks/useTrades.js';
import clsx from 'clsx';

interface TradeLogProps {
  botId: string | null;
}

export function TradeLog({ botId }: TradeLogProps) {
  const { trades, loading, error } = useTrades(botId);

  if (!botId) {
    return <Empty message="Select a bot to see its trade log." />;
  }

  if (loading) return <Empty message="Loading trades..." />;
  if (error) return <Empty message={`Error: ${error}`} />;
  if (trades.length === 0) return <Empty message="No trades yet." />;

  return (
    <div className="flex flex-col gap-1 overflow-y-auto max-h-96">
      {trades.map(trade => (
        <TradeRow key={trade.id} trade={trade} />
      ))}
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const isBuy = trade.side === 'buy';
  const time = new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-mono transition-colors">
      {/* Side badge */}
      <span className={clsx(
        'w-8 text-center font-bold rounded px-1',
        isBuy ? 'text-emerald-400 bg-emerald-950' : 'text-red-400 bg-red-950',
      )}>
        {trade.side.toUpperCase()}
      </span>

      {/* Outcome */}
      <span className={clsx(
        'font-medium',
        trade.outcome === 'yes' ? 'text-emerald-300' : 'text-red-300',
      )}>
        {trade.outcome.toUpperCase()}
      </span>

      {/* Market slug */}
      <span className="flex-1 text-zinc-300 truncate">{trade.marketSlug}</span>

      {/* Price / shares */}
      <span className="text-zinc-400">{(trade.price * 100).toFixed(1)}¢</span>
      <span className="text-zinc-500">×{trade.shares.toFixed(2)}</span>

      {/* Value */}
      <span className="text-zinc-200 w-16 text-right">${trade.value.toFixed(2)}</span>

      {/* Paper badge */}
      {trade.isPaper && (
        <span className="text-yellow-500 text-[10px] font-bold">PAPER</span>
      )}

      {/* Time */}
      <span className="text-zinc-600 w-20 text-right">{time}</span>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="text-zinc-500 text-sm text-center py-6">{message}</div>
  );
}
