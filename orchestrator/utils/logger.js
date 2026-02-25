import winston from 'winston';

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

const isDev = process.env.NODE_ENV !== 'production';

// ─────────────────────────────────────────────
// Log sanitization — strip sensitive fields before they reach log storage
// ─────────────────────────────────────────────

const REDACTED_KEYS = new Set([
  'password',
  'password_hash',
  'api_key',
  'secret',
  'token',
  'authorization',
  'credit_card',
  'ssn',
  'access_token',
  'refresh_token',
]);

/**
 * Recursively redact sensitive fields from an object before logging.
 * Returns a new object; the original is not mutated.
 *
 * @param {unknown} obj - Value to sanitize
 * @returns {unknown} Sanitized copy
 */
export function sanitize(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = sanitize(value);
    }
  }
  return out;
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp(),
    json()
  ),
  defaultMeta: { service: 'lsc-orchestrator' },
  transports: [
    new winston.transports.Console({
      format: isDev ? combine(colorize(), simple()) : combine(timestamp(), json()),
    }),
    new winston.transports.File({
      filename: '/var/log/lsc/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: '/var/log/lsc/combined.log',
      maxsize: 50 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

export function agentLogger(agentName) {
  return logger.child({ agent: agentName });
}
