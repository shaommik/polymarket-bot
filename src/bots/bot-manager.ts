import type { Bot } from '../types/index.js';
import { prisma } from '../db/client.js';
import { requireValidAddress } from '../utils/wallet.js';
import { createLogger } from '../utils/logger.js';
import { BOT_DEFINITIONS, type BotDefinition } from './bot-config.js';

const log = createLogger('bot-manager');

/** In-memory cache of active bots, keyed by wallet address for fast lookup */
const botsByWallet = new Map<string, Bot>();

/** All bots keyed by id */
const botsById = new Map<string, Bot>();

function indexBot(bot: Bot) {
  botsById.set(bot.id, bot);
  if (bot.active) {
    botsByWallet.set(bot.walletId.toLowerCase(), bot);
  }
}

/**
 * Upsert a single bot definition into the database and cache.
 * Validates the wallet address before writing.
 */
async function upsertBot(def: BotDefinition): Promise<Bot> {
  const walletId = requireValidAddress(def.walletId);

  const row = await prisma.bot.upsert({
    where: { walletId },
    update: { name: def.name, niche: def.niche, sizeScale: def.sizeScale, speed: def.speed, active: def.active },
    create: { name: def.name, walletId, niche: def.niche, sizeScale: def.sizeScale, speed: def.speed, active: def.active },
  });

  // Prisma returns plain objects — cast to our interface (fields match 1:1)
  const bot = row as unknown as Bot;
  indexBot(bot);
  log.info({ botId: bot.id, name: bot.name, niche: bot.niche }, 'Bot registered');
  return bot;
}

/**
 * Load all bots from the database into memory.
 * Called on startup after seeding.
 */
async function loadFromDb(): Promise<void> {
  const rows = await prisma.bot.findMany();
  botsByWallet.clear();
  botsById.clear();
  for (const row of rows) {
    indexBot(row as unknown as Bot);
  }
  log.info({ count: botsById.size, active: botsByWallet.size }, 'Bots loaded from database');
}

/**
 * Seed bots from BOT_DEFINITIONS if the database is empty,
 * then load all bots into memory.
 */
export async function initBots(): Promise<void> {
  const existing = await prisma.bot.count();

  if (existing === 0) {
    log.info({ definitions: BOT_DEFINITIONS.length }, 'Seeding bots from bot-config');
    for (const def of BOT_DEFINITIONS) {
      await upsertBot(def);
    }
  } else {
    log.info({ existing }, 'Bots already seeded, loading from database');
  }

  await loadFromDb();
}

/** Look up a bot by the wallet address it watches (case-insensitive) */
export function getBotByWallet(walletAddress: string): Bot | undefined {
  return botsByWallet.get(walletAddress.toLowerCase());
}

/** Look up a bot by its ID */
export function getBotById(id: string): Bot | undefined {
  return botsById.get(id);
}

/** Get all registered bots */
export function getAllBots(): Bot[] {
  return Array.from(botsById.values());
}

/** Get only active bots */
export function getActiveBots(): Bot[] {
  return Array.from(botsById.values()).filter(b => b.active);
}

/** Get all wallet addresses that should be watched */
export function getWatchedWallets(): string[] {
  return Array.from(botsByWallet.keys());
}

/**
 * Update a bot in the in-memory cache after a DB write.
 * Called from the PATCH /bots/:id route so pause/resume
 * takes effect immediately without a restart.
 */
export function updateBotInCache(bot: Bot): void {
  // Remove from wallet index first (active state may have changed)
  const existing = botsById.get(bot.id);
  if (existing) {
    botsByWallet.delete(existing.walletId.toLowerCase());
  }
  indexBot(bot);
  log.info({ botId: bot.id, active: bot.active }, 'Bot cache updated');
}
