import { usePnL } from '../hooks/usePnL.js';
import { NICHE_COLORS } from './constants.js';
import type { Bot } from '@shared/types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface PnLChartProps {
  bot: Bot | null;
}

export function PnLChart({ bot }: PnLChartProps) {
  const { data, loading, error } = usePnL(bot?.id ?? null);

  if (!bot) return <Empty message="Select a bot to view its PnL chart." />;
  if (loading) return <Empty message="Loading chart..." />;
  if (error) return <Empty message={`Error: ${error}`} />;
  if (!data || data.history.length === 0) return <Empty message="No PnL history yet." />;

  const color = NICHE_COLORS[bot.niche] ?? '#3B82F6';

  const chartData = data.history.map(r => ({
    date: r.date.slice(5), // MM-DD
    realized: parseFloat(r.realizedPnl.toFixed(2)),
    unrealized: parseFloat(r.unrealizedPnl.toFixed(2)),
    total: parseFloat((r.realizedPnl + r.unrealizedPnl).toFixed(2)),
  }));

  const summary = data.summary;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary row */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryTile label="Total PnL" value={summary.totalPnl} dollar />
        <SummaryTile label="Realized" value={summary.totalRealized} dollar />
        <SummaryTile label="Unrealized" value={summary.unrealizedPnl} dollar />
        <SummaryTile label="Win Rate" value={summary.avgWinRate * 100} pct />
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
          <YAxis tick={{ fill: '#71717a', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
            labelStyle={{ color: '#a1a1aa' }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
          />
          <ReferenceLine y={0} stroke="#52525b" />
          <Line type="monotone" dataKey="total" stroke={color} strokeWidth={2} dot={false} name="Total" />
          <Line type="monotone" dataKey="realized" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Realized" />
          <Line type="monotone" dataKey="unrealized" stroke="#6366f1" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Unrealized" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SummaryTile({ label, value, dollar, pct }: { label: string; value: number; dollar?: boolean; pct?: boolean }) {
  const positive = value >= 0;
  const display = dollar
    ? `${positive ? '+' : ''}$${Math.abs(value).toFixed(2)}`
    : `${value.toFixed(1)}%`;

  return (
    <div className="bg-zinc-900 rounded-lg p-3">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={`text-sm font-mono font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
        {display}
      </div>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <div className="text-zinc-500 text-sm text-center py-10">{message}</div>;
}
