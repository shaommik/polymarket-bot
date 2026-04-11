import 'dotenv/config';
import { config, port } from './config.js';
import { connectDb, disconnectDb } from './db/client.js';
import { initBots, getWatchedWallets, getBotById } from './bots/bot-manager.js';
import { TradeMonitor } from './core/trade-monitor.js';
import { parseTrade } from './core/trade-parser.js';
import { executeTrade } from './core/copy-executor.js';
import { recordTrade } from './core/pnl-tracker.js';
import { buildServer, broadcast } from './api/server.js';
import { botsRoutes } from './api/routes/bots.js';
import { tradesRoutes } from './api/routes/trades.js';
import { pnlRoutes } from './api/routes/pnl.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('main');

async function main() {
  log.info({ paperMode: config.paperMode }, 'Starting Polymarket copy-trading bot');

  // ── 1. Database ───────────────────────────────────────
  await connectDb();

  // ── 2. Bots ───────────────────────────────────────────
  await initBots();
  const wallets = getWatchedWallets();
  log.info({ wallets: wallets.length }, 'Watching wallets');

  // ── 3. Polymarket trade monitor (polling) ────────────
  const listener = new TradeMonitor();

  const SPEED_DELAY: Record<string, number> = {
    instant:     0,
    delayed_5s:  5_000,
    delayed_30s: 30_000,
  };

  listener.on('trade', async (raw) => {
    const parsed = await parseTrade(raw);
    if (!parsed) return;

    const { trade } = parsed;

    // Apply bot speed delay before executing
    const bot = getBotById(trade.botId);
    const delay = bot ? (SPEED_DELAY[bot.speed] ?? 0) : 0;
    if (delay > 0) await new Promise(res => setTimeout(res, delay));

    const result = await executeTrade(trade);
    if (!result.success) return;

    await recordTrade(result.trade);

    // Push new_trade event to dashboard
    broadcast({ type: 'new_trade', payload: result.trade });
  });

  listener.start(wallets);

  // ── 4. API server ─────────────────────────────────────
  const app = buildServer();
  await app.register(botsRoutes);
  await app.register(tradesRoutes);
  await app.register(pnlRoutes);

  await app.listen({ port, host: '0.0.0.0' });
  log.info({ port }, 'API server listening');

  // ── 5. Graceful shutdown ──────────────────────────────
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down');
    listener.stop();
    await app.close();
    await disconnectDb();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
