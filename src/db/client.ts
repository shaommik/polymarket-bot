import { PrismaClient } from '@prisma/client';
import { createLogger } from '../utils/logger.js';

const log = createLogger('db');

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('error', (e) => {
  log.error({ message: e.message, target: e.target }, 'Prisma error');
});

prisma.$on('warn', (e) => {
  log.warn({ message: e.message, target: e.target }, 'Prisma warning');
});

export async function connectDb(): Promise<void> {
  await prisma.$connect();
  log.info('Database connected');
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  log.info('Database disconnected');
}
