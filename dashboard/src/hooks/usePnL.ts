import { useState, useEffect, useCallback } from 'react';
import type { PnLRecord, WsEvent } from '@shared/types';
import { fetchPnL, fetchPnLSummary, type PnLResponse, type PnLSummaryResponse } from '../lib/api.js';
import { useWebSocket } from './useWebSocket.js';

interface UsePnLState {
  data: PnLResponse | null;
  loading: boolean;
  error: string | null;
}

interface UsePnLSummaryState {
  data: PnLSummaryResponse | null;
  loading: boolean;
  error: string | null;
}

/** Per-bot PnL history + live updates */
export function usePnL(botId: string | null) {
  const [state, setState] = useState<UsePnLState>({ data: null, loading: false, error: null });

  useEffect(() => {
    if (!botId) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState(s => ({ ...s, loading: true, error: null }));
    fetchPnL(botId)
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err => setState(s => ({ ...s, loading: false, error: (err as Error).message })));
  }, [botId]);

  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type !== 'pnl_update') return;
    if (botId && event.payload.botId !== botId) return;

    const updated: PnLRecord = event.payload;

    setState(s => {
      if (!s.data) return s;

      // Replace today's record or append
      const today = updated.date;
      const exists = s.data.history.some(r => r.date === today);
      const history = exists
        ? s.data.history.map(r => r.date === today ? updated : r)
        : [...s.data.history, updated];

      const totalRealized = history.reduce((sum, r) => sum + r.realizedPnl, 0);
      const totalTrades = history.reduce((sum, r) => sum + r.totalTrades, 0);
      const avgWinRate = history.length > 0
        ? history.reduce((sum, r) => sum + r.winRate, 0) / history.length
        : 0;

      return {
        ...s,
        data: {
          ...s.data,
          history,
          summary: {
            ...s.data.summary,
            totalRealized,
            unrealizedPnl: updated.unrealizedPnl,
            totalPnl: totalRealized + updated.unrealizedPnl,
            totalTrades,
            avgWinRate,
          },
        },
      };
    });
  }, [botId]);

  useWebSocket(handleWsEvent);

  return state;
}

/** All-bots PnL summary for the dashboard overview */
export function usePnLSummary() {
  const [state, setState] = useState<UsePnLSummaryState>({ data: null, loading: true, error: null });

  const load = useCallback(() => {
    setState(s => ({ ...s, loading: true, error: null }));
    fetchPnLSummary()
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err => setState(s => ({ ...s, loading: false, error: (err as Error).message })));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type !== 'pnl_update') return;
    const updated = event.payload;

    setState(s => {
      if (!s.data) return s;
      const summaries = s.data.summaries.map(item => {
        if (item.botId !== updated.botId) return item;
        return {
          ...item,
          todayRealized: updated.realizedPnl,
          unrealizedPnl: updated.unrealizedPnl,
          totalPnl: updated.realizedPnl + updated.unrealizedPnl,
          totalTrades: updated.totalTrades,
          winRate: updated.winRate,
        };
      });
      return { ...s, data: { ...s.data, summaries } };
    });
  }, []);

  useWebSocket(handleWsEvent);

  return { ...state, reload: load };
}
