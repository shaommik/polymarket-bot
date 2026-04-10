import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { getPnLHistory, getOpenPositionsPnL } from '../../core/pnl-tracker.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('routes/pnl');

const dateRangeSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export async function pnlRoutes(app: FastifyInstance) {
  // ── GET /pnl/:botId ──────────────────────────────────
  app.get<{ Params: { botId: string } }>('/pnl/:botId', async (req, reply) => {
    const query = dateRangeSchema.safeParse(req.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'Invalid query params', details: query.error.flatten() });
    }

    const bot = await prisma.bot.findUnique({ where: { id: req.params.botId } });
    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    const history = await getPnLHistory(req.params.botId);

    const { from, to } = query.data;
    const filtered = history.filter(r => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      return true;
    });

    const unrealizedPnl = await getOpenPositionsPnL(req.params.botId);
    const totalRealized = filtered.reduce((sum, r) => sum + r.realizedPnl, 0);
    const totalTrades = filtered.reduce((sum, r) => sum + r.totalTrades, 0);
    const avgWinRate = filtered.length > 0
      ? filtered.reduce((sum, r) => sum + r.winRate, 0) / filtered.length
      : 0;

    log.debug({ botId: req.params.botId, records: filtered.length }, 'PnL history fetched');

    return reply.send({
      botId: req.params.botId,
      botName: bot.name,
      niche: bot.niche,
      history: filtered,
      summary: {
        totalRealized,
        unrealizedPnl,
        totalPnl: totalRealized + unrealizedPnl,
        totalTrades,
        avgWinRate,
      },
    });
  });

  // ── GET /pnl/summary — all bots ──────────────────────
  app.get('/pnl/summary', async (_req, reply) => {
    const bots = await prisma.bot.findMany({ where: { active: true } });

    const summaries = await Promise.all(
      bots.map(async (bot) => {
        const today = new Date().toISOString().split('T')[0];
        const record = await prisma.pnLRecord.findUnique({
          where: { botId_date: { botId: bot.id, date: today } },
        });
        const unrealizedPnl = await getOpenPositionsPnL(bot.id);

        return {
          botId: bot.id,
          botName: bot.name,
          niche: bot.niche,
          todayRealized: record?.realizedPnl ?? 0,
          unrealizedPnl,
          totalPnl: (record?.realizedPnl ?? 0) + unrealizedPnl,
          totalTrades: record?.totalTrades ?? 0,
          winRate: record?.winRate ?? 0,
        };
      }),
    );

    return reply.send({ summaries, date: new Date().toISOString().split('T')[0] });
  });
}
