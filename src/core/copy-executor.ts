import type { Trade } from '../types/index.js';
import { config } from '../config.js';
import { evaluateTrade, type RiskResult } from '../risk/risk-engine.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('copy-executor');

export interface ExecutionResult {
  success: boolean;
  trade: Trade;
  paper: boolean;
  riskDecision: RiskResult;
  error?: string;
}

/**
 * Execute a copy trade.
 *
 * Pipeline: risk check → paper/live gate → execute → return result.
 * paperMode is checked at execution time from config (never hardcoded false).
 */
export async function executeTrade(trade: Trade): Promise<ExecutionResult> {
  // ── Risk gate (sacred — never bypass) ────────────────
  const riskResult = await evaluateTrade(trade);

  if (riskResult.decision === 'rejected') {
    log.warn(
      { botId: trade.botId, market: trade.market, reason: riskResult.reason },
      'Trade rejected by risk engine — not executing',
    );
    return { success: false, trade, paper: config.paperMode, riskDecision: riskResult, error: riskResult.reason };
  }

  // Use the risk-approved trade (may have been scaled)
  const approvedTrade = riskResult.trade;

  // ── Paper / live gate ────────────────────────────────
  if (config.paperMode) {
    return executePaper(approvedTrade, riskResult);
  }

  return executeLive(approvedTrade, riskResult);
}

/**
 * Paper mode: log the trade as if it were executed. No network calls.
 */
function executePaper(trade: Trade, riskResult: RiskResult): ExecutionResult {
  const paperTrade: Trade = { ...trade, isPaper: true };

  log.info(
    {
      botId: trade.botId,
      market: trade.market,
      side: trade.side,
      outcome: trade.outcome,
      price: trade.price,
      shares: trade.shares,
      value: trade.value,
      sourceHash: trade.sourceHash,
      mode: 'paper',
    },
    'PAPER TRADE executed',
  );

  return { success: true, trade: paperTrade, paper: true, riskDecision: riskResult };
}

/**
 * Live mode: sign and submit order to Polymarket CLOB REST API.
 *
 * IMPORTANT: This path is only reachable when PAPER_MODE=false in .env.
 * Switching requires explicit user approval per CLAUDE.md.
 */
async function executeLive(trade: Trade, riskResult: RiskResult): Promise<ExecutionResult> {
  const liveTrade: Trade = { ...trade, isPaper: false };

  log.warn(
    {
      botId: trade.botId,
      market: trade.market,
      side: trade.side,
      outcome: trade.outcome,
      price: trade.price,
      shares: trade.shares,
      value: trade.value,
      sourceHash: trade.sourceHash,
      mode: 'live',
    },
    'LIVE TRADE submitting to Polymarket',
  );

  try {
    // TODO: Implement actual order submission
    // 1. Build order payload: { market, side, outcome, price, size }
    // 2. Sign with ethers.js L1/L2 auth (EIP-712)
    // 3. POST to https://clob.polymarket.com/orders with auth headers:
    //    POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_NONCE
    // 4. Parse response for order confirmation
    //
    // Rate limit: 10 orders/second per API key
    // Auth details in .claude/skills/polymarket-api/SKILL.md

    throw new Error('Live trading not yet implemented — enable paper_mode');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error(
      { botId: trade.botId, market: trade.market, err: message },
      'LIVE TRADE failed',
    );
    return { success: false, trade: liveTrade, paper: false, riskDecision: riskResult, error: message };
  }
}
