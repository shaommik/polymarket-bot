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

  const load = useCallback(() => {
    if (!botId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    fetchPnL(botId)
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err => setState(s => ({ ...s, loading: false, error: (err as Error).message })));
  }, [botId]);

  useEffect(() => {
    if (!botId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    load();
  }, [botId, load]);

  // On pnl_update, re-fetch from the API so unrealizedPnl is always live
  // (the WS record snapshot can be stale if positions moved since last trade)
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type !== 'pnl_update') return;
    if (botId && event.payload.botId !== botId) return;
    load();
  }, [botId, load]);

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

  // Re-fetch on pnl_update so unrealizedPnl is always live from the API
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type !== 'pnl_update') return;
    load();
  }, [load]);

  useWebSocket(handleWsEvent);

  return { ...state, reload: load };
}
