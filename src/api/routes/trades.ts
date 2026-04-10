import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('routes/trades');

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  side: z.enum(['buy', 'sell']).optional(),
  market: z.string().optional(),
});

export async function tradesRoutes(app: FastifyInstance) {
  // ── GET /trades/:botId ───────────────────────────────
  app.get<{ Params: { botId: string } }>('/trades/:botId', async (req, reply) => {
    const query = querySchema.safeParse(req.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'Invalid query params', details: query.error.flatten() });
    }

    const { limit, offset, side, market } = query.data;

    const bot = await prisma.bot.findUnique({ where: { id: req.params.botId } });
    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    const trades = await prisma.trade.findMany({
      where: {
        botId: req.params.botId,
        ...(side ? { side } : {}),
        ...(market ? { market } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });

    log.debug({ botId: req.params.botId, count: trades.length }, 'Trades fetched');
    return reply.send({ trades, limit, offset, count: trades.length });
  });

  // ── GET /trades/heatmap — activity by day × hour ─────
  app.get('/trades/heatmap', async (req, reply) => {
    const query = (req.query as Record<string, string>);
    const botId = query.botId ?? null; // optional — omit for all bots

    const trades = await prisma.trade.findMany({
      where: botId ? { botId } : {},
      select: { timestamp: true },
    });

    // Build a day×hour count matrix
    // day: 0=Sun … 6=Sat, hour: 0–23
    const matrix: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const t of trades) {
      const d = new Date(t.timestamp);
      matrix[d.getUTCDay()][d.getUTCHours()]++;
    }

    const cells = [];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        cells.push({ day: DAYS[day], dayIndex: day, hour, count: matrix[day][hour] });
      }
    }

    const maxCount = Math.max(...cells.map(c => c.count), 1);
    return reply.send({ cells, maxCount, total: trades.length });
  });

  // ── GET /trades/:botId/positions ─────────────────────
  app.get<{ Params: { botId: string } }>('/trades/:botId/positions', async (req, reply) => {
    const bot = await prisma.bot.findUnique({ where: { id: req.params.botId } });
    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    const positions = await prisma.position.findMany({
      where: { botId: req.params.botId, shares: { gt: 0 } },
      orderBy: { updatedAt: 'desc' },
    });

    return reply.send({ positions, count: positions.length });
  });
}
