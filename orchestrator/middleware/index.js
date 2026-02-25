/**
 * Express Middleware Stack
 *
 * Security, rate limiting, request logging, CORS, guardrails
 */

import { createHmac } from 'crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ─────────────────────────────────────────────
// Request Logger
// ─────────────────────────────────────────────

export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('HTTP', {
      method:   req.method,
      path:     req.path,
      status:   res.statusCode,
      ms:       Date.now() - start,
      ip:       req.ip,
    });
  });
  next();
}

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────

export function cors(req, res, next) {
  const allowed = [
    'http://localhost:3000',
    `https://${config.business.domain}`,
    `https://dashboard.${config.business.domain}`,
  ];

  const origin = req.headers.origin;
  if (!origin || allowed.includes(origin) || config.env === 'development') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Signature');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

// ─────────────────────────────────────────────
// Simple in-memory rate limiter
// ─────────────────────────────────────────────

const requestCounts = new Map();

export function rateLimiter({ windowMs = 60_000, max = 60, keyFn = null } = {}) {
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : req.ip;
    const now = Date.now();

    if (!requestCounts.has(key)) {
      requestCounts.set(key, { count: 0, resetAt: now + windowMs });
    }

    const entry = requestCounts.get(key);
    if (now > entry.resetAt) {
      entry.count   = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count++;

    if (entry.count > max) {
      logger.warn('Rate limit exceeded', { key, count: entry.count });
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
    }

    res.setHeader('X-RateLimit-Limit',     max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    next();
  };
}

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts) {
    if (now > entry.resetAt) requestCounts.delete(key);
  }
}, 300_000);

// ─────────────────────────────────────────────
// Webhook signature validation (Stripe, SendGrid)
// ─────────────────────────────────────────────

export function validateWebhookSignature({ secretEnvKey, headerName = 'x-webhook-signature' }) {
  return (req, res, next) => {
    const secret    = process.env[secretEnvKey];
    const signature = req.headers[headerName];

    if (!secret) return next(); // not configured → skip validation

    const payload = JSON.stringify(req.body);
    const expected = createHmac('sha256', secret).update(payload).digest('hex');

    if (signature !== `sha256=${expected}`) {
      logger.warn('Invalid webhook signature', { path: req.path });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
  };
}

// ─────────────────────────────────────────────
// Internal API auth (dashboard → orchestrator)
// ─────────────────────────────────────────────

export function requireInternalAuth(req, res, next) {
  // Skip auth in development
  if (config.env === 'development') return next();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─────────────────────────────────────────────
// Trigger API Key auth — protects /trigger/:agent/:jobType
// ─────────────────────────────────────────────

export function requireTriggerApiKey(req, res, next) {
  const apiKey = process.env.TRIGGER_API_KEY;

  // Not configured → open in development, block in production
  if (!apiKey) {
    if (config.env === 'production') {
      return res.status(503).json({ error: 'Trigger endpoint disabled: TRIGGER_API_KEY not configured' });
    }
    return next();
  }

  const provided = req.headers['x-api-key'] || req.query.api_key;
  if (!provided || provided !== apiKey) {
    logger.warn('Trigger API key rejected', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Invalid or missing API key. Set X-Api-Key header.' });
  }

  next();
}

// ─────────────────────────────────────────────
// Guardrails — enforce platform-level safety rules
// ─────────────────────────────────────────────

export function guardrails(req, res, next) {
  // Block any attempt to trigger paid ad jobs
  if (req.path.includes('paid_ads') || req.body?.agent === 'paid_ads') {
    return res.status(403).json({
      error: 'Paid ads module is locked. Organic benchmarks not yet met.',
      unlock_criteria: {
        organic_leads_per_month: 50,
        conversion_rate: '3%',
        cac_maximum_usd: 500,
      },
    });
  }

  // Enforce brand tone on AI-generated content (checked in agent layer too)
  if (req.body?.content) {
    const blockedTopics = config.guardrails.blockedTopics;
    const lower = req.body.content.toLowerCase();
    for (const topic of blockedTopics) {
      if (topic && lower.includes(topic.toLowerCase())) {
        return res.status(400).json({ error: `Content contains blocked topic: ${topic}` });
      }
    }
  }

  next();
}

// ─────────────────────────────────────────────
// Error handler (register last)
// ─────────────────────────────────────────────

export function errorHandler(err, req, res, _next) {
  logger.error('Unhandled error', { path: req.path, err: err.message, stack: err.stack });
  res.status(err.status || 500).json({
    error:   config.env === 'production' ? 'Internal server error' : err.message,
    path:    req.path,
  });
}
