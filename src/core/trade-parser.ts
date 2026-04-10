import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import type { Trade } from '../types/index.js';
import { getBotByWallet } from '../bots/bot-manager.js';
import { createLogger } from '../utils/logger.js';
import type { RawTradeEvent } from './websocket-listener.js';

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
export function parseTrade(raw: RawTradeEvent): ParseResult | null {
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

  const side = data.side.toLowerCase() as 'buy' | 'sell';
  const outcome = data.outcome.toLowerCase() as 'yes' | 'no';
  const price = data.price;
  const shares = data.size * bot.sizeScale;
  const value = price * shares;

  const trade: Trade = {
    id: uuid(),
    botId: bot.id,
    market: data.market,
    marketSlug: data.asset_id, // Will be enriched with human-readable name later
    outcome,
    price,
    shares,
    side,
    value,
    isPaper: true, // Always true here — copy-executor decides final mode
    timestamp: new Date(data.timestamp),
    sourceHash: data.transaction_hash,
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
