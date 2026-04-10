import { useState, useEffect, useCallback } from 'react';
import type { Bot } from '@shared/types';
import { fetchBots, createBot, updateBot, type CreateBotPayload } from '../lib/api.js';

interface UseBotsState {
  bots: Bot[];
  loading: boolean;
  error: string | null;
}

export function useBots() {
  const [state, setState] = useState<UseBotsState>({ bots: [], loading: true, error: null });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const bots = await fetchBots();
      setState({ bots, loading: false, error: null });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addBot = useCallback(async (payload: CreateBotPayload): Promise<Bot> => {
    const bot = await createBot(payload);
    setState(s => ({ ...s, bots: [...s.bots, bot] }));
    return bot;
  }, []);

  const toggleBot = useCallback(async (id: string, active: boolean): Promise<void> => {
    const bot = await updateBot(id, { active });
    setState(s => ({ ...s, bots: s.bots.map(b => b.id === id ? bot : b) }));
  }, []);

  return { ...state, reload: load, addBot, toggleBot };
}
