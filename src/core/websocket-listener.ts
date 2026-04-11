import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ws-listener');

export interface RawTradeEvent {
  event_type: string;
  asset_id: string;
  market: string;
  side: string;
  price: string;
  size: string;
  outcome: string;
  timestamp: string;
  transaction_hash: string;
  maker_address: string;
  taker_address: string;
  /** Human-readable market title, populated by TradeMonitor */
  marketTitle?: string;
  /** True for synthetic backfill events — skip Telegram notification */
  isBackfill?: boolean;
}

export class WebSocketListener extends EventEmitter {
  private ws: WebSocket | null = null;
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private alive = false;
  private stopped = false;

  private readonly url: string;
  private readonly maxRetries: number;
  private readonly baseInterval: number;
  private readonly heartbeatTimeout = 30_000; // 30s per Polymarket spec

  constructor() {
    super();
    this.url = config.polymarketWsUrl;
    this.maxRetries = config.wsMaxRetries;
    this.baseInterval = config.wsReconnectIntervalMs;
  }

  /** Start the WebSocket connection */
  connect(): void {
    this.stopped = false;
    this.createConnection();
  }

  /** Gracefully shut down — no reconnect */
  disconnect(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close(1000, 'Shutting down');
      this.ws = null;
    }
    log.info('WebSocket disconnected by request');
  }

  /** Subscribe to trade events for specific asset IDs */
  subscribe(assetIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn('Cannot subscribe — WebSocket not open');
      return;
    }
    for (const assetId of assetIds) {
      const msg = JSON.stringify({ type: 'subscribe', channel: 'trades', assets_id: assetId });
      this.ws.send(msg);
      log.debug({ assetId }, 'Subscribed to asset');
    }
  }

  private createConnection(): void {
    log.info({ url: this.url, attempt: this.retries + 1 }, 'Connecting to Polymarket WebSocket');

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      log.info('WebSocket connected');
      this.retries = 0;
      this.alive = true;
      this.startHeartbeat();
      this.emit('connected');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.alive = true;

      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        log.warn({ raw: data.toString().slice(0, 200) }, 'Failed to parse WS message');
        return;
      }

      const event = parsed as Record<string, unknown>;
      if (event.event_type === 'trade') {
        this.emit('trade', event as unknown as RawTradeEvent);
      }
    });

    this.ws.on('pong', () => {
      this.alive = true;
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      log.warn({ code, reason: reason.toString() }, 'WebSocket closed');
      this.clearTimers();
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err: Error) => {
      log.error({ err: err.message }, 'WebSocket error');
      // 'close' event will fire after this, triggering reconnect
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (!this.alive) {
        log.warn('Heartbeat timeout — no message in 30s, reconnecting');
        this.ws?.terminate();
        return;
      }
      this.alive = false;
      this.ws?.ping();
    }, this.heartbeatTimeout);
  }

  private scheduleReconnect(): void {
    if (this.retries >= this.maxRetries) {
      log.error({ maxRetries: this.maxRetries }, 'Max reconnect attempts reached — giving up');
      this.emit('max_retries');
      return;
    }

    // Exponential backoff: baseInterval * 2^retries, capped at 60s
    const delay = Math.min(this.baseInterval * Math.pow(2, this.retries), 60_000);
    this.retries++;

    log.info({ retryIn: delay, attempt: this.retries }, 'Scheduling reconnect');
    this.reconnectTimer = setTimeout(() => this.createConnection(), delay);
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
