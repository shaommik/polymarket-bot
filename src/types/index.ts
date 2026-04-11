// ── Enums ──────────────────────────────────────────────

export type Niche = 'crypto' | 'sports' | 'politics' | 'entertainment' | 'science' | 'other';

export type Side = 'buy' | 'sell';

export type Outcome = 'yes' | 'no';

export type BotSpeed = 'instant' | 'delayed_5s' | 'delayed_30s';

// ── Bot ────────────────────────────────────────────────

export interface Bot {
  id: string;
  name: string;
  walletId: string;
  niche: Niche;
  sizeScale: number;
  active: boolean;
  isPaper: boolean;
  speed: BotSpeed;
  createdAt: Date;
  updatedAt: Date;
}

// ── Trade ──────────────────────────────────────────────

export interface Trade {
  id: string;
  botId: string;
  market: string;
  marketSlug: string;
  outcome: Outcome;
  price: number;
  shares: number;
  side: Side;
  value: number;
  isPaper: boolean;
  timestamp: Date;
  sourceHash: string;
  /** In-memory only — true for startup backfill trades, suppresses Telegram notification */
  isBackfill?: boolean;
}

// ── Position ───────────────────────────────────────────

export interface Position {
  id: string;
  botId: string;
  market: string;
  marketSlug: string;
  outcome: Outcome;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  updatedAt: Date;
}

// ── PnL Record ─────────────────────────────────────────

export interface PnLRecord {
  botId: string;
  date: string;
  realizedPnl: number;
  unrealizedPnl: number;
  totalTrades: number;
  winRate: number;
}

// ── Risk Config ────────────────────────────────────────

export interface RiskLimits {
  maxPositionSize: number;
  nicheExposureCap: number;
  maxOpenPositions: number;
}

// ── WebSocket Events (server → dashboard) ──────────────

export interface WsNewTrade {
  type: 'new_trade';
  payload: Trade;
}

export interface WsPnlUpdate {
  type: 'pnl_update';
  payload: PnLRecord;
}

export interface WsRiskAlert {
  type: 'risk_alert';
  payload: {
    botId: string;
    niche: Niche;
    currentExposure: number;
    limit: number;
    message: string;
  };
}

export type WsEvent = WsNewTrade | WsPnlUpdate | WsRiskAlert;

// ── App Config ─────────────────────────────────────────

export interface AppConfig {
  paperMode: boolean;
  riskLimits: RiskLimits;
  /** Per-bot max position size overrides, keyed by bot name. Takes precedence over riskLimits.maxPositionSize. */
  botPositionSizeCaps: Record<string, number>;
  wsReconnectIntervalMs: number;
  wsMaxRetries: number;
  polymarketApiUrl: string;
  polymarketWsUrl: string;
}
