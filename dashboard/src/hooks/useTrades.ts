import { useState, useEffect, useCallback } from 'react';
import type { Trade, WsEvent } from '@shared/types';
import { fetchTrades } from '../lib/api.js';
import { useWebSocket } from './useWebSocket.js';

const MAX_LIVE_TRADES = 100;

interface UseTradesState {
  trades: Trade[];
  loading: boolean;
  error: string | null;
}

export function useTrades(botId: string | null) {
  const [state, setState] = useState<UseTradesState>({ trades: [], loading: false, error: null });

  // Initial fetch when botId changes
  useEffect(() => {
    if (!botId) {
      setState({ trades: [], loading: false, error: null });
      return;
    }

    setState(s => ({ ...s, loading: true, error: null }));
    fetchTrades(botId, { limit: 50 })
      .then(res => setState({ trades: res.trades, loading: false, error: null }))
      .catch(err => setState(s => ({ ...s, loading: false, error: (err as Error).message })));
  }, [botId]);

  // Live updates via WebSocket
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type !== 'new_trade') return;
    if (botId && event.payload.botId !== botId) return;

    setState(s => ({
      ...s,
      trades: [event.payload, ...s.trades].slice(0, MAX_LIVE_TRADES),
    }));
  }, [botId]);

  useWebSocket(handleWsEvent);

  return state;
}
