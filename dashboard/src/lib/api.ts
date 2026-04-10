import type { Bot, Trade, PnLRecord } from '@shared/types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error ?? `POST ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error ?? `PATCH ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Bots ──────────────────────────────────────────────

export function fetchBots(): Promise<Bot[]> {
  return get<Bot[]>('/bots');
}

export function fetchBot(id: string): Promise<Bot> {
  return get<Bot>(`/bots/${id}`);
}

export interface CreateBotPayload {
  name: string;
  walletId: string;
  niche: Bot['niche'];
  sizeScale?: number;
  speed?: Bot['speed'];
  active?: boolean;
}

export function createBot(payload: CreateBotPayload): Promise<Bot> {
  return post<Bot>('/bots', payload);
}

export function updateBot(id: string, payload: Partial<CreateBotPayload>): Promise<Bot> {
  return patch<Bot>(`/bots/${id}`, payload);
}

// ── Trades ────────────────────────────────────────────

export interface TradesResponse {
  trades: Trade[];
  limit: number;
  offset: number;
  count: number;
}

export interface TradesQuery {
  limit?: number;
  offset?: number;
  side?: 'buy' | 'sell';
  market?: string;
}

export function fetchTrades(botId: string, query: TradesQuery = {}): Promise<TradesResponse> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  if (query.side) params.set('side', query.side);
  if (query.market) params.set('market', query.market);
  const qs = params.size > 0 ? `?${params}` : '';
  return get<TradesResponse>(`/trades/${botId}${qs}`);
}

// ── PnL ───────────────────────────────────────────────

export interface PnLResponse {
  botId: string;
  botName: string;
  niche: string;
  history: PnLRecord[];
  summary: {
    totalRealized: number;
    unrealizedPnl: number;
    totalPnl: number;
    totalTrades: number;
    avgWinRate: number;
  };
}

export interface PnLSummaryItem {
  botId: string;
  botName: string;
  niche: string;
  todayRealized: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalTrades: number;
  winRate: number;
}

export interface PnLSummaryResponse {
  summaries: PnLSummaryItem[];
  date: string;
}

export function fetchPnL(botId: string, from?: string, to?: string): Promise<PnLResponse> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.size > 0 ? `?${params}` : '';
  return get<PnLResponse>(`/pnl/${botId}${qs}`);
}

export function fetchPnLSummary(): Promise<PnLSummaryResponse> {
  return get<PnLSummaryResponse>('/pnl/summary');
}
