import { PrismaClient } from '@prisma/client';

/**
 * Transient connection-level failures that are safe to retry.
 *
 * A retry is only safe when we are CONFIDENT the underlying SQL statement never
 * reached the database (so we can't double-apply a write). The connection errors
 * below all fire at the driver/transport layer — before or while negotiating a
 * connection — so the operation itself did not execute and can be retried idempotently.
 *
 * This is the mechanism that keeps `login`, `/auth/profile`, notifications and
 * the other page-load endpoints from returning a generic 500 every time the
 * Supabase pooler has a brief blip (observed repeatedly as P1001 in the logs).
 */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'P1001', // Can't reach database server (host/port unreachable, DNS, pooler blip)
  'P1002', // Server responded but handshake timed out
  'P1003', // Database does not exist (harmless to retry only transiently)
  'P1008', // Operations timed out
  'P1011', // Connection closed by the server (TLS/disconnect) — read-only retry
]);

const RETRYABLE_MESSAGE_FRAGMENTS: ReadonlyArray<string> = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'Can\'t reach database',
  'Connection was closed',
  'connection is already closed',
  'socket hang up',
  'connection lost',
];

function isRetryableConnectionFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: unknown; message?: unknown };
  if (typeof err.code === 'string' && RETRYABLE_CODES.has(err.code)) return true;
  if (typeof err.message === 'string') {
    const message = err.message.toLowerCase();
    return RETRYABLE_MESSAGE_FRAGMENTS.some((frag) => message.includes(frag));
  }
  return false;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const basePrisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = basePrisma;
}

// Bounded automatic retry for transient connection failures. Default: up to
// 3 attempts with exponential backoff (~200ms, 400ms) so a brief DB blip does
// not surface to the user as a 500. Non-connection errors (validation, unique
// constraint, introspection, etc.) are passed through untouched on the first try.
const MAX_CONN_RETRY_ATTEMPTS = Number(process.env.DB_CONN_RETRY_ATTEMPTS || 3);
const BASE_RETRY_DELAY_MS = Number(process.env.DB_CONN_RETRY_BASE_DELAY_MS || 200);

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        let attempt = 0;
        for (;;) {
          try {
            return await query(args);
          } catch (error) {
            attempt += 1;
            const retryable = isRetryableConnectionFailure(error);
            if (!retryable || attempt >= MAX_CONN_RETRY_ATTEMPTS) {
              // Surface the real cause so operators can still diagnose — but
              // controllers wrap these in try/catch and map to a 5xx.
              throw error;
            }
            await sleep(BASE_RETRY_DELAY_MS * Math.pow(2, (attempt - 1)));
          }
        }
      },
    },
  },
});

export default prisma;
