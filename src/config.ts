import 'dotenv/config';
import type { AppConfig } from './types/index.js';

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envNum(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = Number(val);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val.toLowerCase() === 'true';
}

export const config: AppConfig = {
  paperMode: envBool('PAPER_MODE', true),
  riskLimits: {
    maxPositionSize: envNum('MAX_POSITION_SIZE', 1000),
    nicheExposureCap: envNum('NICHE_EXPOSURE_CAP', 5000),
    maxOpenPositions: envNum('MAX_OPEN_POSITIONS', 10),
  },
  botPositionSizeCaps: {
    'CryptoWhale Copier': 30,
    'Sports Sharp':       20,
    'Politics Tracker':   20,
    'Underdog Hunter':    20,
  },
  wsReconnectIntervalMs: envNum('WS_RECONNECT_INTERVAL_MS', 5000),
  wsMaxRetries: envNum('WS_MAX_RETRIES', 10),
  polymarketApiUrl: envStr('POLYMARKET_API_URL', 'https://clob.polymarket.com'),
  polymarketWsUrl: envStr('POLYMARKET_WS_URL', 'wss://ws-subscriptions-clob.polymarket.com/ws/market'),
};

export const port = envNum('PORT', 3001);
