import type { Trade, Niche, RiskLimits } from '../types/index.js';
import { config } from '../config.js';
import { prisma } from '../db/client.js';
import { getBotById } from '../bots/bot-manager.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('risk-engine');

export type RiskDecision = 'approved' | 'scaled' | 'rejected';

export interface RiskResult {
  decision: RiskDecision;
  trade: Trade;
  reason?: string;
}

/**
 * Evaluate a trade against all risk limits.
 * Returns an approved (possibly scaled) trade or a rejection.
 *
 * Checks in order:
 * 1. maxPositionSize — scale down or reject
 * 2. nicheExposureCap — reject if niche is over-exposed
 * 3. maxOpenPositions — reject if bot has too many open positions
 */
export async function evaluateTrade(trade: Trade): Promise<RiskResult> {
  const limits = config.riskLimits;
  const bot = getBotById(trade.botId);

  if (!bot) {
    return logAndReturn({ decision: 'rejected', trade, reason: 'Bot not found' });
  }

  // ── 1. Max position size ─────────────────────────────
  // Per-bot cap takes precedence over global limit
  const botCap = config.botPositionSizeCaps[bot.name];
  const effectiveCap = botCap !== undefined ? botCap : limits.maxPositionSize;
  const positionCheck = checkPositionSize(trade, { ...limits, maxPositionSize: effectiveCap });
  if (positionCheck.decision === 'rejected') {
    return logAndReturn(positionCheck);
  }

  // Use the (possibly scaled) trade going forward
  const checkedTrade = positionCheck.trade;

  // ── 2. Niche exposure cap ────────────────────────────
  const nicheCheck = await checkNicheExposure(checkedTrade, bot.niche, limits);
  if (nicheCheck.decision === 'rejected') {
    return logAndReturn(nicheCheck);
  }

  // ── 3. Max open positions ────────────────────────────
  const openCheck = await checkOpenPositions(checkedTrade, limits);
  if (openCheck.decision === 'rejected') {
    return logAndReturn(openCheck);
  }

  // If trade was scaled in step 1, carry that decision forward
  const finalDecision: RiskDecision = positionCheck.decision === 'scaled' ? 'scaled' : 'approved';

  return logAndReturn({
    decision: finalDecision,
    trade: checkedTrade,
    reason: finalDecision === 'scaled' ? positionCheck.reason : undefined,
  });
}

/**
 * Check 1: Does the trade value exceed maxPositionSize?
 * If so, scale it down to fit. If the scaled value is negligible, reject.
 */
function checkPositionSize(trade: Trade, limits: RiskLimits): RiskResult {
  if (trade.value <= limits.maxPositionSize) {
    return { decision: 'approved', trade };
  }

  const scaleFactor = limits.maxPositionSize / trade.value;
  const scaledShares = trade.shares * scaleFactor;

  // Reject if scaled to less than 1% of original — not worth executing
  if (scaleFactor < 0.01) {
    return {
      decision: 'rejected',
      trade,
      reason: `Trade value $${trade.value.toFixed(2)} exceeds maxPositionSize $${limits.maxPositionSize} by >100x`,
    };
  }

  const scaledTrade: Trade = {
    ...trade,
    shares: scaledShares,
    value: trade.price * scaledShares,
  };

  return {
    decision: 'scaled',
    trade: scaledTrade,
    reason: `Scaled from $${trade.value.toFixed(2)} to $${scaledTrade.value.toFixed(2)} (maxPositionSize: $${limits.maxPositionSize})`,
  };
}

/**
 * Check 2: Would this trade push total niche exposure over nicheExposureCap?
 * Sums unrealizedPnl abs value + position value for all bots in the same niche.
 */
async function checkNicheExposure(trade: Trade, niche: Niche, limits: RiskLimits): Promise<RiskResult> {
  const nicheExposure = await prisma.position.aggregate({
    where: {
      bot: { niche },
    },
    _sum: {
      shares: true,
    },
  });

  // Rough exposure = existing shares value + this trade's value
  const currentExposure = nicheExposure._sum.shares ?? 0;
  const projectedExposure = currentExposure + trade.value;

  if (projectedExposure > limits.nicheExposureCap) {
    return {
      decision: 'rejected',
      trade,
      reason: `Niche "${niche}" exposure $${projectedExposure.toFixed(2)} would exceed cap $${limits.nicheExposureCap}`,
    };
  }

  return { decision: 'approved', trade };
}

/**
 * Check 3: Does this bot already have maxOpenPositions?
 */
async function checkOpenPositions(trade: Trade, limits: RiskLimits): Promise<RiskResult> {
  const openCount = await prisma.position.count({
    where: {
      botId: trade.botId,
      shares: { gt: 0 },
    },
  });

  if (openCount >= limits.maxOpenPositions) {
    return {
      decision: 'rejected',
      trade,
      reason: `Bot has ${openCount} open positions (max: ${limits.maxOpenPositions})`,
    };
  }

  return { decision: 'approved', trade };
}

function logAndReturn(result: RiskResult): RiskResult {
  const logData = {
    botId: result.trade.botId,
    market: result.trade.market,
    side: result.trade.side,
    requestedValue: result.trade.value,
    approvedValue: result.decision === 'rejected' ? 0 : result.trade.value,
    decision: result.decision,
    reason: result.reason,
  };

  if (result.decision === 'rejected') {
    log.warn(logData, 'Trade REJECTED by risk engine');
  } else if (result.decision === 'scaled') {
    log.info(logData, 'Trade SCALED by risk engine');
  } else {
    log.info(logData, 'Trade APPROVED by risk engine');
  }

  return result;
}
