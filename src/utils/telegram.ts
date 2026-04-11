import TelegramBot from 'node-telegram-bot-api';
import { prisma } from '../db/client.js';
import { getBotById } from '../bots/bot-manager.js';
import { createLogger } from './logger.js';
import type { Trade } from '../types/index.js';

const log = createLogger('telegram');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Only initialise the bot if credentials are present
const bot = token ? new TelegramBot(token) : null;

function isConfigured(): boolean {
  return Boolean(bot && chatId);
}

/**
 * Send a trade alert to the configured Telegram chat.
 * Silently skips if TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID are not set.
 */
export async function sendTradeAlert(trade: Trade): Promise<void> {
  if (!isConfigured()) return;
  if (trade.isBackfill) return; // suppress notifications for startup backfill trades

  try {
    const botRecord = getBotById(trade.botId);
    const botName = botRecord?.name ?? 'Unknown Bot';
    const mode = trade.isPaper ? '📄 PAPER' : '💸 LIVE';
    const sideEmoji = trade.side === 'buy' ? '🟢 BUY' : '🔴 SELL';
    const outcomeLabel = trade.outcome.toUpperCase();
    const time = new Date(trade.timestamp).toUTCString();
    // Use human-readable market title if available, fall back to raw slug
    const marketDisplay = trade.marketSlug.length < 80 ? trade.marketSlug : trade.market.slice(0, 12) + '…';

    // ── Fetch all-bots PnL summary ──────────────────────
    const bots = await prisma.bot.findMany({ where: { active: true } });
    const today = new Date().toISOString().split('T')[0];

    const botLines: string[] = [];
    let grandTotalPnl = 0;
    let totalTrades = 0;
    let weightedWinRateSum = 0;
    let totalTradesForWinRate = 0;

    for (const b of bots) {
      const record = await prisma.pnLRecord.findUnique({
        where: { botId_date: { botId: b.id, date: today } },
      });
      const pnl = (record?.realizedPnl ?? 0) + (record?.unrealizedPnl ?? 0);
      const trades = record?.totalTrades ?? 0;
      const winRate = record?.winRate ?? 0;
      const pnlSign = pnl >= 0 ? '+' : '';
      const modeTag = b.isPaper ? '📄' : '💸';

      botLines.push(`  ${modeTag} <b>${b.name}</b>: ${pnlSign}$${pnl.toFixed(2)} (${trades} trades, ${(winRate * 100).toFixed(0)}% WR)`);

      grandTotalPnl += pnl;
      totalTrades += trades;
      weightedWinRateSum += winRate * trades;
      totalTradesForWinRate += trades;
    }

    const overallWinRate = totalTradesForWinRate > 0
      ? (weightedWinRateSum / totalTradesForWinRate) * 100
      : 0;
    const totalSign = grandTotalPnl >= 0 ? '+' : '';

    const message = [
      `<b>🤖 ${botName}</b> ${mode}`,
      ``,
      `<b>Trade</b>`,
      `  ${sideEmoji} <b>${outcomeLabel}</b> on <code>${marketDisplay}</code>`,
      `  Price: <b>${(trade.price * 100).toFixed(1)}¢</b>  ×  ${trade.shares.toFixed(4)} shares`,
      `  Bet value: <b>$${trade.value.toFixed(2)}</b>`,
      `  Time: ${time}`,
      ``,
      `<b>Today's PnL by bot</b>`,
      ...botLines,
      ``,
      `<b>Overall</b>`,
      `  Total PnL: <b>${totalSign}$${grandTotalPnl.toFixed(2)}</b>`,
      `  Total trades: <b>${totalTrades}</b>`,
      `  Win rate: <b>${overallWinRate.toFixed(1)}%</b>`,
    ].join('\n');

    await bot!.sendMessage(chatId!, message, { parse_mode: 'HTML' });

  } catch (err) {
    // Never let a notification failure affect trade recording
    log.warn({ err: (err as Error).message }, 'Telegram notification failed');
  }
}
