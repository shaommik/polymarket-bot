import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { requireValidAddress } from '../../utils/wallet.js';
import { createLogger } from '../../utils/logger.js';
import { getAllBots, getBotById } from '../../bots/bot-manager.js';

const log = createLogger('routes/bots');

const createBotSchema = z.object({
  name: z.string().min(1).max(100),
  walletId: z.string().min(1),
  niche: z.enum(['crypto', 'sports', 'politics', 'entertainment', 'science', 'other']),
  sizeScale: z.number().min(0.01).max(10).default(1.0),
  speed: z.enum(['instant', 'delayed_5s', 'delayed_30s']).default('instant'),
  active: z.boolean().default(true),
});

export async function botsRoutes(app: FastifyInstance) {
  // ── GET /bots ────────────────────────────────────────
  app.get('/bots', async (_req, reply) => {
    const bots = getAllBots();
    return reply.send(bots);
  });

  // ── GET /bots/:id ────────────────────────────────────
  app.get<{ Params: { id: string } }>('/bots/:id', async (req, reply) => {
    const bot = getBotById(req.params.id);
    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }
    return reply.send(bot);
  });

  // ── POST /bots ───────────────────────────────────────
  app.post('/bots', async (req, reply) => {
    const result = createBotSchema.safeParse(req.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.flatten() });
    }

    const data = result.data;

    let walletId: string;
    try {
      walletId = requireValidAddress(data.walletId);
    } catch {
      return reply.status(400).send({ error: `Invalid wallet address: ${data.walletId}` });
    }

    // Check for duplicate wallet
    const existing = await prisma.bot.findFirst({ where: { walletId } });
    if (existing) {
      return reply.status(409).send({ error: `Wallet ${walletId} is already watched by bot "${existing.name}"` });
    }

    const bot = await prisma.bot.create({
      data: { name: data.name, walletId, niche: data.niche, sizeScale: data.sizeScale, speed: data.speed, active: data.active },
    });

    // Seed initial PnL record
    const today = new Date().toISOString().split('T')[0];
    await prisma.pnLRecord.upsert({
      where: { botId_date: { botId: bot.id, date: today } },
      update: {},
      create: { botId: bot.id, date: today, realizedPnl: 0, unrealizedPnl: 0, totalTrades: 0, winRate: 0 },
    });

    log.info({ botId: bot.id, name: bot.name, niche: bot.niche }, 'Bot created via API');
    return reply.status(201).send(bot);
  });

  // ── PATCH /bots/:id ──────────────────────────────────
  app.patch<{ Params: { id: string } }>('/bots/:id', async (req, reply) => {
    const patchSchema = createBotSchema.partial();
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.flatten() });
    }

    const existing = await prisma.bot.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    const bot = await prisma.bot.update({
      where: { id: req.params.id },
      data: result.data,
    });

    log.info({ botId: bot.id, changes: result.data }, 'Bot updated via API');
    return reply.send(bot);
  });
}
