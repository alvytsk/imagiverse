import pino from 'pino';
import { env } from '../config/env';

/**
 * Shared structured logger for use outside of Fastify request context
 * (BullMQ workers, cron jobs, scripts).
 *
 * In request handlers, always prefer `request.log` so that `reqId` is
 * automatically included.  Use this logger only when no request context
 * is available.
 */
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
});
