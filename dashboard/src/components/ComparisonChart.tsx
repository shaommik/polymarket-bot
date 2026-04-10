import { useState, useEffect, useCallback } from 'react';
import type { Bot, WsEvent } from '@shared/types';
import { fetchPnL } from '../lib/api.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { NICHE_COLORS } from './constants.js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface ComparisonChartProps {
  bots: Bot[];
}

// One row per date, keyed by bot name
type ChartRow = Record<string, number | string>;

function mergeHistories(
  histories: { bot: Bot; records: { date: string; totalPnl: number }[] }[],
): ChartRow[] {
  // Collect all unique dates
  const dateSet = new Set<string>();
  for (const { records } of histories) {
    for (const r of records) dateSet.add(r.date);
  }
  const dates = Array.from(dateSet).sort();

  return dates.map(date => {
    const row: ChartRow = { date: date.slice(5) }; // MM-DD
    for (const { bot, records } of histories) {
      const match = records.find(r => r.date === date);
      row[bot.name] = match ? parseFloat((match.totalPnl).toFixed(4)) : 0;
    }
    return row;
  });
}

export function ComparisonChart({ bots }: ComparisonChartProps) {
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (bots.length === 0) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        bots.map(async bot => {
          const res = await fetchPnL(bot.id);
          return {
            bot,
            records: res.history.map(r => ({
              date: r.date,
              totalPnl: r.realizedPnl + r.unrealizedPnl,
            })),
          };
        }),
      );
      setChartData(mergeHistories(results));
    } finally {
      setLoading(false);
    }
  }, [bots]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Refresh chart data on any pnl_update
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type !== 'pnl_update') return;
    loadAll();
  }, [loadAll]);

  useWebSocket(handleWsEvent);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-zinc-500 text-sm">Loading comparison chart...</div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-2">Bot Comparison</h2>
        <div className="text-zinc-500 text-sm">No PnL history yet — trades will appear here.</div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-zinc-300 mb-4">Bot Comparison — Cumulative PnL</h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
          <YAxis tick={{ fill: '#71717a', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
            labelStyle={{ color: '#a1a1aa' }}
            formatter={(value: number, name: string) => [`$${value.toFixed(4)}`, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value: string) => <span style={{ color: '#a1a1aa' }}>{value}</span>}
          />
          <ReferenceLine y={0} stroke="#52525b" />
          {bots.map(bot => (
            <Line
              key={bot.id}
              type="monotone"
              dataKey={bot.name}
              stroke={NICHE_COLORS[bot.niche] ?? '#6B7280'}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
