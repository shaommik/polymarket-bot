import { useState, useEffect, useCallback } from 'react';
import type { Bot, WsEvent } from '@shared/types';
import { fetchHeatmap, type HeatmapCell } from '../lib/api.js';
import { useWebSocket } from '../hooks/useWebSocket.js';

interface ActivityHeatmapProps {
  bots: Bot[];
  selectedBotId: string | null;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function cellColor(count: number, max: number): string {
  if (count === 0 || max === 0) return '#18181b'; // zinc-950
  const intensity = count / max;
  if (intensity < 0.2) return '#1e3a5f';
  if (intensity < 0.4) return '#1d4ed8';
  if (intensity < 0.6) return '#2563eb';
  if (intensity < 0.8) return '#3b82f6';
  return '#60a5fa';
}

export function ActivityHeatmap({ bots, selectedBotId }: ActivityHeatmapProps) {
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [maxCount, setMaxCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null); // null = all bots

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchHeatmap(filter ?? undefined);
      setCells(res.cells);
      setMaxCount(res.maxCount);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Refresh on new trades
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type === 'new_trade') load();
  }, [load]);
  useWebSocket(handleWsEvent);

  // Build day×hour lookup
  const lookup = new Map<string, number>();
  for (const cell of cells) {
    lookup.set(`${cell.dayIndex}-${cell.hour}`, cell.count);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-300">Wallet Activity Heatmap</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {total > 0 ? `${total} trades — UTC time` : 'No trades yet'}
          </p>
        </div>

        {/* Bot filter */}
        <div className="flex gap-1.5 flex-wrap">
          <FilterBtn label="All" active={filter === null} onClick={() => setFilter(null)} />
          {bots.map(b => (
            <FilterBtn key={b.id} label={b.name.split(' ')[0]} active={filter === b.id} onClick={() => setFilter(b.id)} />
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm py-4">Loading heatmap...</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Hour labels */}
            <div className="flex mb-1 ml-10">
              {HOURS.map(h => (
                <div key={h} className="flex-1 text-center text-[9px] text-zinc-600">
                  {h % 3 === 0 ? `${h}h` : ''}
                </div>
              ))}
            </div>

            {/* Grid rows */}
            {DAYS.map((day, dayIndex) => (
              <div key={day} className="flex items-center mb-0.5">
                <div className="w-10 text-xs text-zinc-500 shrink-0">{day}</div>
                {HOURS.map(hour => {
                  const count = lookup.get(`${dayIndex}-${hour}`) ?? 0;
                  return (
                    <div
                      key={hour}
                      className="flex-1 aspect-square rounded-sm mx-px transition-colors"
                      style={{ backgroundColor: cellColor(count, maxCount) }}
                      title={`${day} ${hour}:00 UTC — ${count} trade${count !== 1 ? 's' : ''}`}
                    />
                  );
                })}
              </div>
            ))}

            {/* Legend */}
            <div className="flex items-center gap-1.5 mt-3 justify-end">
              <span className="text-xs text-zinc-600">Less</span>
              {[0, 0.2, 0.4, 0.6, 0.8, 1].map(v => (
                <div
                  key={v}
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: cellColor(v * maxCount, maxCount) }}
                />
              ))}
              <span className="text-xs text-zinc-600">More</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
        active
          ? 'border-blue-500 bg-blue-950 text-blue-300'
          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
      }`}
    >
      {label}
    </button>
  );
}
