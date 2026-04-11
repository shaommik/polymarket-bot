import { useMemo } from 'react';
import type { WsEvent } from '@shared/types';
import { usePnLSummary } from '../hooks/usePnL.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { useCallback } from 'react';

function fmt(n: number, dollar = true): string {
  const prefix = dollar ? '$' : '';
  const sign = n >= 0 ? '+' : '-';
  return `${sign}${prefix}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SummaryBar() {
  const { data, loading } = usePnLSummary();

  // Keep volume incrementing live as new_trade events arrive
  const handleWsEvent = useCallback((_event: WsEvent) => {
    // volume is re-fetched via usePnLSummary on pnl_update already
  }, []);
  useWebSocket(handleWsEvent);

  const stats = useMemo(() => {
    if (!data) return null;
    const s = data.summaries;

    const totalPnl     = s.reduce((sum, b) => sum + b.totalPnl, 0);
    const totalTrades  = s.reduce((sum, b) => sum + b.totalTrades, 0);
    const totalVolume  = s.reduce((sum, b) => sum + (b.volume ?? 0), 0);

    // Overall return: total PnL across all bots / (100 * numBots) * 100
    const overallReturn = s.length > 0 ? totalPnl / (100 * s.length) * 100 : 0;

    const best = s.reduce<{ name: string; pnl: number } | null>((top, b) => {
      if (!top || b.totalPnl > top.pnl) return { name: b.botName, pnl: b.totalPnl };
      return top;
    }, null);

    return { totalPnl, totalTrades, totalVolume, overallReturn, best };
  }, [data]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatCard
        label="Total Account PnL"
        value={loading || !stats ? '—' : fmt(stats.totalPnl)}
        positive={stats ? stats.totalPnl >= 0 : undefined}
        highlight
      />
      <StatCard
        label="Overall Return"
        value={loading || !stats ? '—' : `${stats.overallReturn >= 0 ? '+' : ''}${stats.overallReturn.toFixed(1)}%`}
        positive={stats ? stats.overallReturn >= 0 : undefined}
      />
      <StatCard
        label="Total Trades"
        value={loading || !stats ? '—' : stats.totalTrades.toLocaleString()}
      />
      <StatCard
        label="Total Volume"
        value={loading || !stats ? '—' : `$${stats.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      />
      <StatCard
        label="Best Bot"
        value={loading || !stats || !stats.best ? '—' : stats.best.name}
        sub={stats?.best ? fmt(stats.best.pnl) : undefined}
        positive={stats?.best ? stats.best.pnl >= 0 : undefined}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  positive,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  highlight?: boolean;
}) {
  const valueColor = positive === true
    ? 'text-emerald-400'
    : positive === false
    ? 'text-red-400'
    : 'text-zinc-100';

  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? 'border-zinc-600 bg-zinc-800' : 'border-zinc-800 bg-zinc-900'}`}>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={`text-base font-mono font-semibold truncate ${valueColor}`}>{value}</div>
      {sub && (
        <div className={`text-xs font-mono mt-0.5 ${positive === true ? 'text-emerald-500' : positive === false ? 'text-red-500' : 'text-zinc-500'}`}>
          {sub}
        </div>
      )}
    </div>
  );
}
