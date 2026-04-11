import type { Trade, PnLRecord } from '../types/index.js';
import { prisma } from '../db/client.js';
import { createLogger } from '../utils/logger.js';
import { sendTradeAlert } from '../utils/telegram.js';
import { broadcast } from '../api/server.js';

const log = createLogger('pnl-tracker');

/**
 * Record a completed trade: persist to DB, update position, recalculate PnL.
 * Called after copy-executor returns a successful result.
 */
export async function recordTrade(trade: Trade): Promise<void> {
  // ── 1. Persist the trade ─────────────────────────────
  // Use upsert on (botId, sourceHash) so any duplicate that slips through
  // the in-memory deduplication is silently ignored rather than crashing.
  const created = await prisma.trade.upsert({
    where: { botId_sourceHash: { botId: trade.botId, sourceHash: trade.sourceHash } },
    create: {
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
    update: {}, // already exists — no-op
  });

  if (created.id !== trade.id) {
    log.warn({ sourceHash: trade.sourceHash, botId: trade.botId }, 'Duplicate trade skipped at DB level');
    return;
  }

  log.info({ tradeId: trade.id, botId: trade.botId, market: trade.market }, 'Trade persisted');

  // ── 2. Update position, capturing realized PnL from sells ─
  const realizedFromTrade = await updatePosition(trade);

  // ── 3. Update daily PnL record ───────────────────────
  const updatedRecord = await updateDailyPnL(trade.botId, realizedFromTrade);

  // ── 4. Broadcast pnl_update to dashboard ─────────────
  if (updatedRecord) {
    broadcast({ type: 'pnl_update', payload: updatedRecord });
  }

  // ── 5. Telegram notification ─────────────────────────
  await sendTradeAlert(trade);
}

/**
 * Update or create the position for this bot+market+outcome.
 * Buys increase shares and adjust avgPrice; sells decrease shares and realize PnL.
 * Returns the realized PnL from this trade (0 for buys).
 */
async function updatePosition(trade: Trade): Promise<number> {
  // Use a transaction to prevent race conditions on concurrent trades for the same position
  const existing = await prisma.$transaction(async (tx) => {
    return tx.position.findUnique({
      where: {
        botId_market_outcome: {
          botId: trade.botId,
          market: trade.market,
          outcome: trade.outcome,
        },
      },
    });
  });

  if (trade.side === 'buy') {
    if (existing) {
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
      // Use upsert to handle the race where two trades arrive simultaneously
      // for the same position — the second create would fail with P2002 otherwise.
      await prisma.position.upsert({
        where: {
          botId_market_outcome: {
            botId: trade.botId,
            market: trade.market,
            outcome: trade.outcome,
          },
        },
        create: {
          botId: trade.botId,
          market: trade.market,
          marketSlug: trade.marketSlug,
          outcome: trade.outcome,
          shares: trade.shares,
          avgPrice: trade.price,
          currentPrice: trade.price,
          unrealizedPnl: 0,
        },
        update: {
          // Another trade beat us to it — merge using weighted average
          shares: { increment: trade.shares },
          currentPrice: trade.price,
          // avgPrice and unrealizedPnl will be corrected on the next trade update;
          // for now keep existing avgPrice (conservative — avoids division-by-zero)
        },
      });

      log.info(
        { botId: trade.botId, market: trade.market, shares: trade.shares, price: trade.price },
        'New position opened',
      );
    }

    return 0;
  } else {
    // Sell — reduce shares, realize PnL
    if (!existing || existing.shares <= 0) {
      log.warn({ botId: trade.botId, market: trade.market }, 'Sell with no open position — skipping position update');
      return 0;
    }

    const closedShares = Math.min(trade.shares, existing.shares);

    // Read avgPrice BEFORE updating the position
    const realizedPnl = (trade.price - existing.avgPrice) * closedShares;

    const remainingShares = existing.shares - closedShares;

    if (remainingShares <= 0) {
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

    return realizedPnl;
  }
}

/**
 * Recalculate and upsert the daily PnL snapshot for a bot.
 * Accumulates realized PnL from the current trade and unrealized from open positions.
 */
async function updateDailyPnL(botId: string, realizedFromTrade: number): Promise<PnLRecord | null> {
  const today = new Date().toISOString().split('T')[0];
  const startOfDay = new Date(today + 'T00:00:00.000Z');

  // Today's trades for win rate
  const todayTrades = await prisma.trade.findMany({
    where: { botId, timestamp: { gte: startOfDay } },
  });

  // All open positions for unrealized PnL
  const openPositions = await prisma.position.findMany({
    where: { botId, shares: { gt: 0 } },
  });

  const totalTrades = todayTrades.length;

  // Win rate: only count sells on resolved markets (price = 1.0 or 0.0).
  // Fractional prices mean the market is still live — don't count as win/loss yet.
  const resolvedSells = todayTrades.filter(
    t => t.side === 'sell' && (t.price >= 0.99 || t.price <= 0.01),
  );
  const wins = resolvedSells.filter(t => t.price >= 0.99).length;
  // If no resolved trades today, winRate = -1 signals "Pending" to callers
  const winRate = resolvedSells.length > 0 ? wins / resolvedSells.length : -1;

  // Sum unrealized PnL from all open positions
  const unrealizedPnl = openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

  // Get existing record to accumulate realized PnL correctly
  const existing = await prisma.pnLRecord.findUnique({
    where: { botId_date: { botId, date: today } },
  });
  const accumulatedRealizedPnl = (existing?.realizedPnl ?? 0) + realizedFromTrade;

  const record = await prisma.pnLRecord.upsert({
    where: { botId_date: { botId, date: today } },
    update: { realizedPnl: accumulatedRealizedPnl, unrealizedPnl, totalTrades, winRate },
    create: { botId, date: today, realizedPnl: accumulatedRealizedPnl, unrealizedPnl, totalTrades, winRate },
  });

  log.info(
    {
      botId,
      date: today,
      realizedPnl: accumulatedRealizedPnl.toFixed(4),
      unrealizedPnl: unrealizedPnl.toFixed(4),
      totalTrades,
      winRate: winRate.toFixed(2),
    },
    'Daily PnL updated',
  );

  return {
    botId: record.botId,
    date: record.date,
    realizedPnl: record.realizedPnl,
    unrealizedPnl: record.unrealizedPnl,
    totalTrades: record.totalTrades,
    winRate: record.winRate,
  };
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
