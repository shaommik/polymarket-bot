import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { createLogger } from '../utils/logger.js';
import type { WsEvent } from '../types/index.js';

const log = createLogger('api-server');

/** All connected dashboard WebSocket clients */
const clients = new Set<WebSocket>();

export function buildServer() {
  const app = Fastify({ logger: false }); // We use pino directly

  // ── Plugins ────────────────────────────────────────────
  app.register(cors, {
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  app.register(websocket);

  // ── Dashboard WebSocket feed ───────────────────────────
  app.register(async (instance) => {
    instance.get('/ws/feed', { websocket: true }, (socket) => {
      clients.add(socket);
      log.info({ clientCount: clients.size }, 'Dashboard client connected');

      socket.on('close', () => {
        clients.delete(socket);
        log.info({ clientCount: clients.size }, 'Dashboard client disconnected');
      });

      socket.on('error', (err) => {
        log.error({ err: err.message }, 'Dashboard WS client error');
        clients.delete(socket);
      });
    });
  });

  // ── Health check ───────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return app;
}

/**
 * Broadcast a typed event to all connected dashboard clients.
 * Called from pnl-tracker and risk-engine after significant events.
 */
export function broadcast(event: WsEvent): void {
  if (clients.size === 0) return;

  const payload = JSON.stringify(event);
  let dead = 0;

  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    } else {
      clients.delete(client);
      dead++;
    }
  }

  if (dead > 0) {
    log.debug({ removed: dead, remaining: clients.size }, 'Removed stale WS clients');
  }
}
