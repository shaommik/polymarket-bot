import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';
import type { RawTradeEvent } from './websocket-listener.js';

const log = createLogger('trade-monitor');

const DATA_API = 'https://data-api.polymarket.com';
const POLL_INTERVAL_MS = 10_000;   // 10s per wallet
const STAGGER_MS = 2_000;          // 2s between wallet starts
const FETCH_LIMIT = 20;
const MAX_SEEN_PER_WALLET = 200;   // cap dedupe set size

/**
 * Maps any outcome string from the data API to 'Yes' | 'No'.
 * Polymarket binary markets use Yes/No, but some slugs use Up/Down,
 * Higher/Lower, etc. We normalise to Yes (index 0) / No (index 1).
 */
function normaliseOutcome(outcome: string, outcomeIndex: number): 'Yes' | 'No' {
  const lower = outcome.toLowerCase();
  if (lower === 'yes') return 'Yes';
  if (lower === 'no') return 'No';
  // For non-Yes/No markets, index 0 is always the "Yes" token
  return outcomeIndex === 0 ? 'Yes' : 'No';
}

interface ActivityRecord {
  proxyWallet: string;
  timestamp: number;        // unix seconds
  conditionId: string;      // market condition ID
  type: string;             // "TRADE" | "REDEEM" | etc.
  size: number;             // shares
  usdcSize: number;
  transactionHash: string;
  price: number;
  asset: string;            // token ID
  side: 'BUY' | 'SELL';
  outcomeIndex: number;     // 0 = Yes token, 1 = No token
  slug: string;             // human-readable market slug
  title: string;            // human-readable market question
  outcome: string;          // "Yes" | "No" | "Up" | "Down" | etc.
}

export class TradeMonitor extends EventEmitter {
  private wallets: string[] = [];
  private seenHashes = new Map<string, Set<string>>(); // wallet → Set<txHash>
  private timers: ReturnType<typeof setTimeout>[] = [];
  private stopped = false;

  /** Start polling for all wallets. Staggered by STAGGER_MS each. */
  start(wallets: string[]): void {
    this.stopped = false;
    this.wallets = wallets;

    log.info({ count: wallets.length }, 'TradeMonitor starting');

    wallets.forEach((wallet, i) => {
      this.seenHashes.set(wallet, new Set());

      // Seed seen hashes on first poll so we don't replay historical trades
      const timer = setTimeout(() => this.pollWallet(wallet, true), i * STAGGER_MS);
      this.timers.push(timer);
    });
  }

  /** Stop all polling */
  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    log.info('TradeMonitor stopped');
  }

  /** Update wallet list without full restart (add/remove bots at runtime) */
  setWallets(wallets: string[]): void {
    this.wallets = wallets;
    // Ensure dedupe sets exist for any new wallets
    for (const w of wallets) {
      if (!this.seenHashes.has(w)) {
        this.seenHashes.set(w, new Set());
      }
    }
  }

  private scheduleNext(wallet: string): void {
    if (this.stopped) return;
    const timer = setTimeout(() => this.pollWallet(wallet, false), POLL_INTERVAL_MS);
    this.timers.push(timer);
  }

  private async pollWallet(wallet: string, seedOnly: boolean): Promise<void> {
    try {
      const url = `${DATA_API}/activity?user=${wallet}&limit=${FETCH_LIMIT}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });

      if (!res.ok) {
        log.warn({ wallet, status: res.status }, 'Activity API non-OK response');
        this.scheduleNext(wallet);
        return;
      }

      const records: ActivityRecord[] = await res.json() as ActivityRecord[];
      const seen = this.seenHashes.get(wallet)!;

      if (seedOnly) {
        // On first poll, record existing hashes so we don't replay historical trades
        for (const r of records) {
          if (r.type === 'TRADE') seen.add(r.transactionHash);
        }
        log.info({ wallet, seeded: seen.size }, 'Seeded seen hashes — ready to watch');
        this.scheduleNext(wallet);
        return;
      }

      // Find new trades (not seen before), oldest first.
      // Also deduplicate within the batch itself — the Polymarket API can return
      // the same transactionHash multiple times in one response (multiple fills
      // within one transaction). Keep only the first occurrence per hash.
      const batchSeen = new Set<string>();
      const newTrades = records
        .filter(r => {
          if (r.type !== 'TRADE') return false;
          if (seen.has(r.transactionHash)) return false;
          if (batchSeen.has(r.transactionHash)) return false;
          batchSeen.add(r.transactionHash);
          return true;
        })
        .reverse();

      for (const record of newTrades) {
        seen.add(record.transactionHash);

        // Cap set size to avoid unbounded memory growth
        if (seen.size > MAX_SEEN_PER_WALLET) {
          const oldest = seen.values().next().value;
          if (oldest) seen.delete(oldest);
        }

        const raw = this.toRawTradeEvent(record, wallet);
        log.debug({ wallet, txHash: record.transactionHash, side: record.side }, 'New trade detected');
        this.emit('trade', raw);
      }

      if (newTrades.length > 0) {
        log.info({ wallet, newTrades: newTrades.length }, 'Emitted new trades');
      }

    } catch (err) {
      log.warn({ wallet, err: (err as Error).message }, 'Poll failed — will retry next interval');
    }

    this.scheduleNext(wallet);
  }

  /**
   * Map an ActivityRecord to the RawTradeEvent shape expected by trade-parser.
   * We synthesise the fields trade-parser's Zod schema needs.
   */
  private toRawTradeEvent(r: ActivityRecord, wallet: string): RawTradeEvent {
    return {
      event_type: 'trade',
      asset_id: r.asset,
      market: r.conditionId,
      side: r.side,                                   // already "BUY" | "SELL"
      price: String(r.price),
      size: String(r.size),
      outcome: normaliseOutcome(r.outcome, r.outcomeIndex),
      timestamp: new Date(r.timestamp * 1000).toISOString(),
      transaction_hash: r.transactionHash,
      maker_address: wallet,
      taker_address: wallet,                          // we track by proxyWallet
      marketTitle: r.title,
    };
  }
}
