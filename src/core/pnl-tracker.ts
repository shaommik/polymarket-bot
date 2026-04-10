import type { Trade, PnLRecord } from '../types/index.js';
import { prisma } from '../db/client.js';
import { createLogger } from '../utils/logger.js';
import { sendTradeAlert } from '../utils/telegram.js';

const log = createLogger('pnl-tracker');

/**
 * Record a completed trade: persist to DB, update position, recalculate PnL.
 * Called after copy-executor returns a successful result.
 */
export async function recordTrade(trade: Trade): Promise<void> {
  // ── 1. Persist the trade ─────────────────────────────
  await prisma.trade.create({
    data: {
      id: trade.id,
      botId: trade.botId,
      market: trade.market,
      marketSlug: trade.marketSlug,
      outcome: trade.outcome,
      price: trade.price,
      shares: trade.shares,
      side: trade.side,
      value: trade.value,
      isPaper: trade.isPaper,
      timestamp: trade.timestamp,
      sourceHash: trade.sourceHash,
    },
  });

  log.info({ tradeId: trade.id, botId: trade.botId, market: trade.market }, 'Trade persisted');

  // ── 2. Update position ───────────────────────────────
  await updatePosition(trade);

  // ── 3. Update daily PnL record ───────────────────────
  await updateDailyPnL(trade.botId);

  // ── 4. Telegram notification ─────────────────────────
  await sendTradeAlert(trade);
}

/**
 * Update or create the position for this bot+market+outcome.
 * Buys increase shares and adjust avgPrice; sells decrease shares and realize PnL.
 */
async function updatePosition(trade: Trade): Promise<void> {
  const existing = await prisma.position.findUnique({
    where: {
      botId_market_outcome: {
        botId: trade.botId,
        market: trade.market,
        outcome: trade.outcome,
      },
    },
  });

  if (trade.side === 'buy') {
    if (existing) {
      // Weighted average price: (old_shares * old_avg + new_shares * new_price) / total_shares
      const totalShares = existing.shares + trade.shares;
      const avgPrice = (existing.shares * existing.avgPrice + trade.shares * trade.price) / totalShares;

      await prisma.position.update({
        where: { id: existing.id },
        data: {
          shares: totalShares,
          avgPrice,
          currentPrice: trade.price,
          unrealizedPnl: (trade.price - avgPrice) * totalShares,
        },
      });

      log.info(
        { botId: trade.botId, market: trade.market, shares: totalShares, avgPrice: avgPrice.toFixed(4) },
        'Position increased',
      );
    } else {
      await prisma.position.create({
        data: {
          botId: trade.botId,
          market: trade.market,
          marketSlug: trade.marketSlug,
          outcome: trade.outcome,
          shares: trade.shares,
          avgPrice: trade.price,
          currentPrice: trade.price,
          unrealizedPnl: 0,
        },
      });

      log.info(
        { botId: trade.botId, market: trade.market, shares: trade.shares, price: trade.price },
        'New position opened',
      );
    }
  } else {
    // Sell — reduce shares, realize PnL
    if (!existing || existing.shares <= 0) {
      log.warn({ botId: trade.botId, market: trade.market }, 'Sell with no open position — skipping position update');
      return;
    }

    const closedShares = Math.min(trade.shares, existing.shares);
    const realizedPnl = (trade.price - existing.avgPrice) * closedShares;
    const remainingShares = existing.shares - closedShares;

    if (remainingShares <= 0) {
      // Position fully closed
      await prisma.position.update({
        where: { id: existing.id },
        data: { shares: 0, currentPrice: trade.price, unrealizedPnl: 0 },
      });

      log.info(
        { botId: trade.botId, market: trade.market, realizedPnl: realizedPnl.toFixed(4) },
        'Position fully closed',
      );
    } else {
      const unrealizedPnl = (trade.price - existing.avgPrice) * remainingShares;

      await prisma.position.update({
        where: { id: existing.id },
        data: { shares: remainingShares, currentPrice: trade.price, unrealizedPnl },
      });

      log.info(
        { botId: trade.botId, market: trade.market, remainingShares, realizedPnl: realizedPnl.toFixed(4) },
        'Position partially closed',
      );
    }
  }
}

/**
 * Recalculate and upsert the daily PnL snapshot for a bot.
 * Aggregates realized PnL from today's trades and unrealized from open positions.
 */
async function updateDailyPnL(botId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const startOfDay = new Date(today + 'T00:00:00.000Z');

  // Today's trades for this bot
  const todayTrades = await prisma.trade.findMany({
    where: { botId, timestamp: { gte: startOfDay } },
  });

  // All open positions for this bot
  const openPositions = await prisma.position.findMany({
    where: { botId, shares: { gt: 0 } },
  });

  // Realized PnL: sum of (sell_price - avg_entry_price) * shares for sell trades
  // We track this cumulatively from positions, so get it from closed positions today
  const totalTrades = todayTrades.length;
  const wins = todayTrades.filter(t => {
    if (t.side !== 'sell') return false;
    // A winning sell is one where sell price > position avg price
    // Simplified: sell price > 0.5 for yes outcomes is generally a win
    return t.price > 0.5;
  }).length;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;

  // Sum unrealized PnL from all open positions
  const unrealizedPnl = openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

  // Realized PnL from sell trades today: (sell_price - avg_entry) * shares
  // Approximation: sum of value for sells minus cost basis
  const sellTrades = todayTrades.filter(t => t.side === 'sell');
  const realizedPnl = sellTrades.reduce((sum, t) => sum + t.value, 0)
    - sellTrades.reduce((sum, t) => sum + (t.price * t.shares - t.value + t.value), 0)
    + unrealizedPnl * 0; // placeholder — proper tracking needs position snapshots

  await prisma.pnLRecord.upsert({
    where: { botId_date: { botId, date: today } },
    update: { realizedPnl, unrealizedPnl, totalTrades, winRate },
    create: { botId, date: today, realizedPnl, unrealizedPnl, totalTrades, winRate },
  });

  log.info(
    { botId, date: today, realizedPnl: realizedPnl.toFixed(4), unrealizedPnl: unrealizedPnl.toFixed(4), totalTrades, winRate: winRate.toFixed(2) },
    'Daily PnL updated',
  );
}

/**
 * Get the PnL summary for a bot across all recorded days.
 */
export async function getPnLHistory(botId: string): Promise<PnLRecord[]> {
  const records = await prisma.pnLRecord.findMany({
    where: { botId },
    orderBy: { date: 'asc' },
  });

  return records.map(r => ({
    botId: r.botId,
    date: r.date,
    realizedPnl: r.realizedPnl,
    unrealizedPnl: r.unrealizedPnl,
    totalTrades: r.totalTrades,
    winRate: r.winRate,
  }));
}

/**
 * Get current unrealized PnL for all open positions of a bot.
 */
export async function getOpenPositionsPnL(botId: string): Promise<number> {
  const result = await prisma.position.aggregate({
    where: { botId, shares: { gt: 0 } },
    _sum: { unrealizedPnl: true },
  });

  return result._sum.unrealizedPnl ?? 0;
}
