import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import type { Trade } from '../types/index.js';
import { getBotByWallet } from '../bots/bot-manager.js';
import { createLogger } from '../utils/logger.js';
import type { RawTradeEvent } from './websocket-listener.js';

const SLIPPAGE_THRESHOLD = 0.15; // 15%
const POLYMARKET_API = process.env.POLYMARKET_API_URL ?? 'https://clob.polymarket.com';

/**
 * Fetch the current mid-price for a token (asset_id) from Polymarket CLOB.
 * Returns null if the request fails so the caller can decide whether to proceed.
 */
async function fetchCurrentPrice(assetId: string): Promise<number | null> {
  try {
    const res = await fetch(`${POLYMARKET_API}/midpoint?token_id=${encodeURIComponent(assetId)}`);
    if (!res.ok) return null;
    const json = await res.json() as { mid: string };
    const price = Number(json.mid);
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

const log = createLogger('trade-parser');

/**
 * Zod schema to validate raw WS trade events.
 * Polymarket sends price/size as strings, side/outcome uppercase.
 */
const rawTradeSchema = z.object({
  event_type: z.literal('trade'),
  asset_id: z.string().min(1),
  market: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  price: z.string().transform(Number).pipe(z.number().min(0).max(1)),
  size: z.string().transform(Number).pipe(z.number().positive()),
  outcome: z.enum(['Yes', 'No']),
  timestamp: z.string().min(1),
  transaction_hash: z.string().min(1),
  maker_address: z.string().min(1),
  taker_address: z.string().min(1),
});

export type ValidatedRawTrade = z.infer<typeof rawTradeSchema>;

export interface ParseResult {
  trade: Trade;
  botName: string;
}

/**
 * Parse and validate a raw WS event into a typed Trade.
 * Returns null if:
 * - The message fails zod validation
 * - The taker_address doesn't match any watched bot
 */
export async function parseTrade(raw: RawTradeEvent): Promise<ParseResult | null> {
  const result = rawTradeSchema.safeParse(raw);

  if (!result.success) {
    log.warn({ errors: result.error.flatten().fieldErrors }, 'Raw trade failed validation');
    return null;
  }

  const data = result.data;

  // Match taker address to a bot we're watching
  const bot = getBotByWallet(data.taker_address);
  if (!bot) {
    // Not a wallet we care about — this is normal, skip silently
    return null;
  }

  if (!bot.active) {
    log.debug({ botId: bot.id, wallet: data.taker_address }, 'Matched bot is inactive, skipping');
    return null;
  }

  // ── Slippage filter — CryptoWhale Copier only ────────
  if (bot.name === 'CryptoWhale Copier') {
    const whalePrice = Number(data.price);
    const currentPrice = await fetchCurrentPrice(data.asset_id);

    if (currentPrice !== null) {
      const slippage = Math.abs(currentPrice - whalePrice) / whalePrice;
      if (slippage > SLIPPAGE_THRESHOLD) {
        log.warn(
          {
            botId: bot.id,
            market: data.market,
            assetId: data.asset_id,
            whalePrice: whalePrice.toFixed(4),
            currentPrice: currentPrice.toFixed(4),
            slippagePct: (slippage * 100).toFixed(1),
          },
          'slippage_exceeded — trade skipped',
        );
        return null;
      }
    } else {
      log.warn({ botId: bot.id, market: data.market }, 'Could not fetch current price for slippage check — proceeding');
    }
  }

  const side = data.side.toLowerCase() as 'buy' | 'sell';
  const outcome = data.outcome.toLowerCase() as 'yes' | 'no';
  const price = data.price;
  const shares = Math.floor(data.size * bot.sizeScale);
  const value = price * shares;

  if (shares === 0) {
    log.warn(
      { botId: bot.id, botName: bot.name, rawSize: data.size, sizeScale: bot.sizeScale },
      'zero_shares_after_rounding — trade skipped',
    );
    return null;
  }

  const trade: Trade = {
    id: uuid(),
    botId: bot.id,
    market: data.market,
    marketSlug: raw.marketTitle ?? data.asset_id,
    outcome,
    price,
    shares,
    side,
    value,
    isPaper: true, // Always true here — copy-executor decides final mode
    timestamp: new Date(data.timestamp),
    sourceHash: data.transaction_hash,
    isBackfill: raw.isBackfill,
  };

  log.info(
    {
      botId: bot.id,
      botName: bot.name,
      market: trade.market,
      side: trade.side,
      outcome: trade.outcome,
      price: trade.price,
      shares: trade.shares,
      value: trade.value,
      sourceHash: trade.sourceHash,
    },
    'Trade parsed from watched wallet',
  );

  return { trade, botName: bot.name };
}
