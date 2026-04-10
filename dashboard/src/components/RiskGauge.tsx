import type { WsEvent, Niche } from '@shared/types';
import { useState, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { NICHE_COLORS } from './constants.js';
import clsx from 'clsx';

interface NicheExposure {
  niche: Niche;
  current: number;
  limit: number;
  message?: string;
}

export function RiskGauge() {
  const [exposures, setExposures] = useState<Map<Niche, NicheExposure>>(new Map());

  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type !== 'risk_alert') return;
    const { niche, currentExposure, limit, message } = event.payload;

    setExposures(prev => {
      const next = new Map(prev);
      next.set(niche, { niche, current: currentExposure, limit, message });
      return next;
    });
  }, []);

  useWebSocket(handleWsEvent);

  if (exposures.size === 0) {
    return (
      <div className="text-zinc-500 text-sm text-center py-4">
        No risk alerts — all niches within limits.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {Array.from(exposures.values()).map(exp => (
        <GaugeBar key={exp.niche} exposure={exp} />
      ))}
    </div>
  );
}

function GaugeBar({ exposure }: { exposure: NicheExposure }) {
  const pct = Math.min((exposure.current / exposure.limit) * 100, 100);
  const color = NICHE_COLORS[exposure.niche] ?? '#6B7280';
  const danger = pct >= 90;
  const warning = pct >= 70 && pct < 90;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium capitalize" style={{ color }}>{exposure.niche}</span>
        <span className={clsx(
          'text-xs font-mono',
          danger ? 'text-red-400' : warning ? 'text-yellow-400' : 'text-zinc-400',
        )}>
          ${exposure.current.toFixed(0)} / ${exposure.limit.toFixed(0)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-500',
            danger ? 'bg-red-500' : warning ? 'bg-yellow-500' : '',
          )}
          style={{
            width: `${pct}%`,
            backgroundColor: danger ? undefined : warning ? undefined : color,
          }}
        />
      </div>
      {exposure.message && (
        <div className="text-xs text-zinc-500 mt-0.5">{exposure.message}</div>
      )}
    </div>
  );
}
