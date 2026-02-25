/**
 * Orchestrator HTTP Server
 * Exposes internal APIs + health checks + webhook receivers
 */

import express from 'express';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { queues } from './queues/index.js';
import { startAutonomousLoop } from './schedulers/autonomous-loop.js';
import { queryOne, queryAll, query } from './utils/db.js';
import { v4 as uuidv4 } from 'uuid';
import {
  requestLogger, cors, rateLimiter,
  validateWebhookSignature, guardrails, errorHandler,
  requireTriggerApiKey,
} from './middleware/index.js';
import { eventBus } from './events/event-bus.js';
import { emailClient } from './integrations/sendgrid.js';
import { linkedinClient } from './integrations/linkedin.js';
import { hubspotClient } from './integrations/hubspot.js';
import { gscClient } from './integrations/google-search-console.js';
import { analyzeWebsite } from './utils/website-analyzer.js';
import { createHmac, timingSafeEqual } from 'crypto';
import { registerClient, unregisterClient, clientCount } from './utils/sse-broadcaster.js';
import { getBudgetStatus, callAI } from './utils/ai.js';
import { getIntegrationConfig } from './utils/integration-config.js';

// Lightweight cookie parser — avoids adding a dependency
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(c => {
    const [k, ...v] = c.trim().split('=');
    return [k, decodeURIComponent(v.join('='))];
  }).filter(([k]) => k));
}

// ─────────────────────────────────────────────
// Input validation helpers
// ─────────────────────────────────────────────

/**
 * Validate email format using RFC 5322-lite regex.
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

/**
 * Trim whitespace and strip HTML tags from a string field.
 * Returns undefined if the input is not a string.
 * @param {unknown} str
 * @returns {string|undefined}
 */
function sanitizeString(str) {
  if (str === undefined || str === null) return undefined;
  if (typeof str !== 'string') return undefined;
  return str.trim().replace(/<[^>]*>/g, '');
}

const app = express();
app.use(express.json({ limit: '2mb' }));

// ─────────────────────────────────────────────
// Security headers (applied before all routes)
// ─────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('X-Powered-By');
  next();
});

app.use(requestLogger);
app.use(cors);
app.use(guardrails);

// ─────────────────────────────────────────────
// HEALTH & STATUS
// ─────────────────────────────────────────────

// Public routes (no rate limit)
app.get('/health', async (req, res) => {
  const services = {
    database:   'ok',
    redis:      'ok',
    python_api: 'ok',
  };

  // ── Database check ────────────────────────────────
  try {
    await queryOne('SELECT 1 AS ping');
  } catch (err) {
    services.database = `error: ${err.message}`;
    logger.warn('Health check: database unreachable', { err: err.message });
  }

  // ── Redis check ───────────────────────────────────
  try {
    await queues.connection.ping();
  } catch (err) {
    services.redis = `error: ${err.message}`;
    logger.warn('Health check: redis unreachable', { err: err.message });
  }

  // ── Python Analytics API check ────────────────────
  try {
    const resp = await fetch(`${config.pythonApiUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) services.python_api = `error: HTTP ${resp.status}`;
  } catch (err) {
    services.python_api = `error: ${err.message}`;
  }

  const allOk      = Object.values(services).every(v => v === 'ok');
  const criticalOk = services.database === 'ok' && services.redis === 'ok';

  const overallStatus = allOk ? 'ok' : criticalOk ? 'degraded' : 'down';
  const httpStatus    = allOk ? 200 : criticalOk ? 207 : 503;

  res.status(httpStatus).json({
    status:    overallStatus,
    version:   '1.0.0',
    uptime:    Math.floor(process.uptime()),
    services,
    timestamp: new Date().toISOString(),
  });
});

// Apply rate limiting to all API routes
app.use('/api',     rateLimiter({ windowMs: 60_000, max: 120 }));
app.use('/trigger', rateLimiter({ windowMs: 60_000, max: 20 }));

app.get('/status', async (req, res) => {
  try {
    const [kpis, recentRuns] = await Promise.all([
      queryOne('SELECT * FROM v_organic_kpis'),
      queryAll('SELECT agent, job_type, status, started_at FROM agent_runs ORDER BY started_at DESC LIMIT 10'),
    ]);
    res.json({ kpis, recentRuns, queues: Object.keys(queues.getAllQueues()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// WEBHOOK: New Lead Capture
// ─────────────────────────────────────────────

app.post('/webhook/lead', async (req, res) => {
  try {
    const body = req.body || {};

    // ── Input validation ──────────────────────────────────────
    const email = sanitizeString(body.email);
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'email must be a valid email address' });
    }

    const full_name  = sanitizeString(body.full_name);
    const company    = sanitizeString(body.company);
    const job_title  = sanitizeString(body.job_title);
    const phone      = sanitizeString(body.phone);

    if (full_name  && full_name.length  > 200) return res.status(400).json({ error: 'full_name must not exceed 200 characters' });
    if (company    && company.length    > 200) return res.status(400).json({ error: 'company must not exceed 200 characters' });
    if (job_title  && job_title.length  > 200) return res.status(400).json({ error: 'job_title must not exceed 200 characters' });
    if (phone      && phone.length      >  50) return res.status(400).json({ error: 'phone must not exceed 50 characters' });

    const source_page    = sanitizeString(body.source_page);
    const source_keyword = sanitizeString(body.source_keyword);
    const utm            = body.utm && typeof body.utm === 'object' ? body.utm : {};

    const leadId = uuidv4();

    // Create lead record
    await queryOne(
      `INSERT INTO leads
         (id, email, full_name, company, job_title,
          first_touch_channel, utm_source, utm_medium, utm_campaign, first_touch_url, stage)
       VALUES ($1, $2, $3, $4, $5, 'organic_search', $6, $7, $8, $9, 'prospect')
       ON CONFLICT (email) DO NOTHING`,
      [leadId, email, full_name, company, job_title,
       utm?.source, utm?.medium, utm?.campaign, source_page]
    );

    // Immediate async scoring
    await queues.dispatch('inbound_conversion', 'process_lead', {
      leadId,
      leadData: { email, full_name, company, job_title },
      sourcePage: source_page,
      sourceKeyword: source_keyword,
    }, { priority: 1 }); // highest priority

    logger.info('New lead captured', { leadId, email });
    res.status(201).json({ leadId, status: 'processing' });
  } catch (err) {
    logger.error('Lead webhook error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// WEBHOOK: Revenue Event (from Stripe/billing)
// ─────────────────────────────────────────────

app.post('/webhook/revenue', async (req, res) => {
  try {
    const { email, amount_usd, type, product, plan, invoice_id } = req.body;

    const lead = await queryOne(`SELECT id FROM leads WHERE email = $1`, [email]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const eventId = uuidv4();
    await queryOne(
      `INSERT INTO revenue_events (id, lead_id, type, amount_usd, product, plan, invoice_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, lead.id, type || 'new_mrr', amount_usd, product, plan, invoice_id]
    );

    // Update lead stage
    await queryOne(
      `UPDATE leads SET stage = 'customer', converted_at = NOW() WHERE id = $1`,
      [lead.id]
    );

    // Queue attribution
    await queues.dispatch('revenue_analytics', 'attribute_revenue', { revenueEventId: eventId });

    logger.info('Revenue event recorded', { eventId, email, amount_usd });
    res.status(201).json({ eventId });
  } catch (err) {
    logger.error('Revenue webhook error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// MANUAL TRIGGERS (for dashboard use)
// ─────────────────────────────────────────────

app.post('/trigger/:agent/:jobType', requireTriggerApiKey, async (req, res) => {
  try {
    const { agent, jobType } = req.params;
    const payload = req.body || {};

    const job = await queues.dispatch(agent, jobType, payload, { priority: 5 });
    res.json({ jobId: job.id, status: 'queued' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// DATA APIs for Dashboard
// ─────────────────────────────────────────────

app.get('/api/kpis', async (req, res) => {
  const kpis = await queryOne('SELECT * FROM v_organic_kpis');
  res.json(kpis);
});

app.get('/api/content', async (req, res) => {
  const rows = await queryAll(`
    SELECT ca.id, ca.product_id, ca.body_markdown, v.*
    FROM v_revenue_by_content v
    JOIN content_assets ca ON ca.title = v.title AND ca.content_type::text = v.content_type::text
    ORDER BY ca.created_at DESC LIMIT 50
  `);
  res.json(rows);
});

// Delete all content assets
app.delete('/api/content-assets', async (req, res) => {
  try {
    const row = await queryOne(`SELECT COUNT(*) AS cnt FROM content_assets`);
    await query(`UPDATE revenue_events SET first_touch_content = NULL, last_touch_content = NULL`);
    await query(`DELETE FROM social_posts WHERE content_asset_id IS NOT NULL`);
    await query(`DELETE FROM content_assets`);
    res.json({ ok: true, deleted: parseInt(row?.cnt || 0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all content assets not linked to any product
app.delete('/api/content-assets/unassigned', async (req, res) => {
  try {
    const row = await queryOne(`SELECT COUNT(*) AS cnt FROM content_assets WHERE product_id IS NULL`);
    await query(`UPDATE revenue_events SET first_touch_content = NULL WHERE first_touch_content IN (SELECT id FROM content_assets WHERE product_id IS NULL)`);
    await query(`UPDATE revenue_events SET last_touch_content  = NULL WHERE last_touch_content  IN (SELECT id FROM content_assets WHERE product_id IS NULL)`);
    await query(`DELETE FROM social_posts WHERE content_asset_id IN (SELECT id FROM content_assets WHERE product_id IS NULL)`);
    await query(`DELETE FROM content_assets WHERE product_id IS NULL`);
    res.json({ ok: true, deleted: parseInt(row?.cnt || 0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/keywords', async (req, res) => {
  const rows = await queryAll(`
    SELECT
      k.id, k.keyword, k.intent, k.search_volume, k.difficulty, k.cpc_usd,
      k.serp_position, k.priority_score, k.product_id,
      p.name AS product_name, p.website_url AS product_website,
      COALESCE(agg.total_leads, 0) AS total_leads,
      COALESCE(agg.total_revenue, 0) AS total_revenue,
      CASE WHEN COALESCE(agg.total_leads, 0) > 0
           THEN COALESCE(agg.total_revenue, 0) / agg.total_leads
           ELSE 0 END AS revenue_per_lead
    FROM keywords k
    LEFT JOIN products p ON p.id = k.product_id
    LEFT JOIN (
      SELECT kk.id AS keyword_id,
        COUNT(DISTINCT l.id) AS total_leads,
        SUM(re.amount_usd) AS total_revenue
      FROM keywords kk
      LEFT JOIN leads l ON l.first_touch_keyword = kk.id
      LEFT JOIN revenue_events re ON re.first_touch_keyword = kk.id
      GROUP BY kk.id
    ) agg ON agg.keyword_id = k.id
    ORDER BY COALESCE(p.name, 'zzz'), k.priority_score DESC NULLS LAST
    LIMIT 200
  `);
  res.json(rows);
});

// Delete all keywords not linked to any product
app.delete('/api/keywords/unassigned', async (req, res) => {
  try {
    const row = await queryOne(`SELECT COUNT(*) AS cnt FROM keywords WHERE product_id IS NULL`);
    await query(`DELETE FROM keywords WHERE product_id IS NULL`);
    res.json({ ok: true, deleted: parseInt(row?.cnt || 0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pipeline', async (req, res) => {
  const rows = await queryAll('SELECT * FROM v_pipeline_velocity LIMIT 12');
  res.json(rows);
});

app.get('/api/leads', async (req, res) => {
  const { stage, limit = 50 } = req.query;
  const rows = await queryAll(
    `SELECT id, email, full_name, company, stage, composite_score, first_touch_channel, created_at
     FROM leads
     ${stage ? 'WHERE stage = $1' : ''}
     ORDER BY composite_score DESC, created_at DESC
     LIMIT ${parseInt(limit)}`,
    stage ? [stage] : []
  );
  res.json(rows);
});

app.get('/api/experiments', async (req, res) => {
  const rows = await queryAll(
    `SELECT * FROM experiments ORDER BY started_at DESC LIMIT 20`
  );
  res.json(rows);
});

app.get('/api/agent-runs', async (req, res) => {
  const rows = await queryAll(
    `SELECT id, agent, job_type, status, tokens_used, cost_usd, duration_ms, started_at
     FROM agent_runs ORDER BY started_at DESC LIMIT 100`
  );
  res.json(rows);
});

// Live queue state — active + waiting jobs from BullMQ + recent DB history
app.get('/api/jobs', async (req, res) => {
  try {
    const allQueues = queues.getAllQueues();
    const active  = [];
    const waiting = [];

    await Promise.all(Object.entries(allQueues).map(async ([agentName, queue]) => {
      const [activeJobs, waitingJobs, counts] = await Promise.all([
        queue.getActive(),
        queue.getWaiting(),
        queue.getJobCounts('active', 'waiting', 'delayed', 'failed', 'completed'),
      ]);

      for (const job of activeJobs) {
        active.push({
          id:        job.id,
          agent:     agentName,
          jobType:   job.name,
          status:    'running',
          startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
          attempts:  job.attemptsMade,
        });
      }

      for (const job of waitingJobs) {
        waiting.push({
          id:         job.id,
          agent:      agentName,
          jobType:    job.name,
          status:     'queued',
          queuedAt:   job.timestamp ? new Date(job.timestamp).toISOString() : null,
          priority:   job.opts?.priority ?? 5,
        });
      }
    }));

    // Sort waiting by priority (lower number = higher priority)
    waiting.sort((a, b) => a.priority - b.priority);

    // Recent history from DB
    const history = await queryAll(
      `SELECT id, agent, job_type, status, tokens_used, cost_usd, duration_ms, error,
              started_at, completed_at
       FROM agent_runs
       ORDER BY completed_at DESC NULLS LAST
       LIMIT 50`
    );

    res.json({ active, waiting, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/playbooks', async (req, res) => {
  const rows = await queryAll(
    `SELECT * FROM playbooks WHERE is_active = true ORDER BY times_applied DESC LIMIT 20`
  );
  res.json(rows);
});

// ─────────────────────────────────────────────
// INTEGRATION WEBHOOKS
// ─────────────────────────────────────────────

// SendGrid inbound events (opens, clicks, unsubscribes)
app.post('/webhook/email/events',
  validateWebhookSignature({ secretEnvKey: 'SENDGRID_WEBHOOK_SECRET' }),
  async (req, res) => {
    try {
      await emailClient.handleWebhookEvent(Array.isArray(req.body) ? req.body : [req.body]);
      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error('SendGrid webhook error', { err: err.message });
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────
// INTEGRATION SYNC ENDPOINTS
// ─────────────────────────────────────────────

app.post('/integrations/gsc/sync', async (req, res) => {
  try {
    const result = await gscClient.syncToDatabase();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/integrations/hubspot/sync', async (req, res) => {
  try {
    const result = await hubspotClient.bulkSync();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/integrations/linkedin/publish', async (req, res) => {
  try {
    const result = await linkedinClient.publishScheduledPosts();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/integrations/email/nurture-queue', async (req, res) => {
  try {
    const result = await emailClient.runNurtureQueue();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// EXTENDED DATA APIS
// ─────────────────────────────────────────────

app.get('/api/leads/:id', async (req, res) => {
  try {
    const lead = await queryOne(
      `SELECT l.*,
              k.keyword as first_keyword,
              ca.title as first_content_title
       FROM leads l
       LEFT JOIN keywords k      ON k.id = l.first_touch_keyword
       LEFT JOIN content_assets ca ON ca.id = l.first_touch_content
       WHERE l.id = $1`,
      [req.params.id]
    );
    if (!lead) return res.status(404).json({ error: 'Not found' });
    const events = await queryAll(
      `SELECT * FROM pipeline_events WHERE lead_id = $1 ORDER BY occurred_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json({ ...lead, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/revenue/summary', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT
         DATE_TRUNC('month', occurred_at) AS month,
         SUM(amount_usd) FILTER (WHERE type = 'new_mrr')   AS new_mrr,
         SUM(amount_usd) FILTER (WHERE type = 'expansion') AS expansion,
         SUM(amount_usd) FILTER (WHERE type = 'churn')     AS churn,
         COUNT(*) AS events
       FROM revenue_events
       WHERE occurred_at >= NOW() - INTERVAL '12 months'
       GROUP BY month ORDER BY month`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agent-runs/:agent', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT id, job_type, status, tokens_used, cost_usd, duration_ms, started_at, error
       FROM agent_runs WHERE agent = $1 ORDER BY started_at DESC LIMIT 50`,
      [req.params.agent]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/failed-jobs', async (req, res) => {
  try {
    const { agent, limit = 100 } = req.query;
    const rows = await queryAll(
      `SELECT id, agent, job_type, error, started_at, duration_ms
       FROM agent_runs
       WHERE status = 'error'
       ${agent ? 'AND agent = $2' : ''}
       ORDER BY started_at DESC
       LIMIT ${parseInt(limit)}`,
      agent ? [agent] : []
    );

    // Group by agent with counts and most recent errors
    const byAgent = {};
    for (const row of rows) {
      if (!byAgent[row.agent]) {
        byAgent[row.agent] = { agent: row.agent, total_failures: 0, recent: [] };
      }
      byAgent[row.agent].total_failures++;
      if (byAgent[row.agent].recent.length < 5) {
        byAgent[row.agent].recent.push({
          id: row.id,
          job_type: row.job_type,
          error: row.error,
          started_at: row.started_at,
          duration_ms: row.duration_ms,
        });
      }
    }

    res.json({
      total_failures: rows.length,
      by_agent: Object.values(byAgent).sort((a, b) => b.total_failures - a.total_failures),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/social/posts', async (req, res) => {
  try {
    const { platform, limit = 50 } = req.query;
    const rows = await queryAll(
      `SELECT sp.*, ca.title as content_title
       FROM social_posts sp
       LEFT JOIN content_assets ca ON ca.id = sp.content_asset_id
       ${platform ? 'WHERE sp.platform = $1' : ''}
       ORDER BY sp.created_at DESC LIMIT ${parseInt(limit)}`,
      platform ? [platform] : []
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all social posts
app.delete('/api/social/posts', async (req, res) => {
  try {
    const row = await queryOne(`SELECT COUNT(*) AS cnt FROM social_posts`);
    await query(`DELETE FROM social_posts`);
    res.json({ ok: true, deleted: parseInt(row?.cnt || 0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all unpublished (draft/scheduled) social posts
app.delete('/api/social/posts/drafts', async (req, res) => {
  try {
    const row = await queryOne(`SELECT COUNT(*) AS cnt FROM social_posts WHERE published_at IS NULL`);
    await query(`DELETE FROM social_posts WHERE published_at IS NULL`);
    res.json({ ok: true, deleted: parseInt(row?.cnt || 0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all social posts not linked to any content asset
app.delete('/api/social/posts/unassigned', async (req, res) => {
  try {
    const row = await queryOne(`SELECT COUNT(*) AS cnt FROM social_posts WHERE content_asset_id IS NULL`);
    await query(`DELETE FROM social_posts WHERE content_asset_id IS NULL`);
    res.json({ ok: true, deleted: parseInt(row?.cnt || 0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/nurture/sequences', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT id, name, trigger_stage, total_enrolled, total_converted, conversion_rate, is_active
       FROM nurture_sequences ORDER BY total_enrolled DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/growth-goals', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT * FROM growth_goals ORDER BY period_start DESC LIMIT 12`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cost tracking
app.get('/api/cost/summary', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT
         agent,
         COUNT(*)           AS runs,
         SUM(tokens_used)   AS total_tokens,
         SUM(cost_usd)      AS total_cost_usd,
         AVG(duration_ms)   AS avg_duration_ms
       FROM agent_runs
       WHERE started_at >= NOW() - INTERVAL '30 days'
         AND status = 'success'
       GROUP BY agent ORDER BY total_cost_usd DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// PRODUCTS — add, analyze, track performance
// ─────────────────────────────────────────────

// List all products with performance summary
app.get('/api/products', async (req, res) => {
  try {
    const rows = await queryAll(`
      SELECT
        p.*,
        COUNT(DISTINCT k.id)  AS keyword_count,
        COUNT(DISTINCT ca.id) AS content_count,
        COUNT(DISTINCT l.id)  AS lead_count,
        COALESCE(SUM(re.amount_usd), 0) AS revenue_usd
      FROM products p
      LEFT JOIN keywords       k  ON k.product_id  = p.id
      LEFT JOIN content_assets ca ON ca.product_id = p.id
      LEFT JOIN leads          l  ON l.product_id  = p.id
      LEFT JOIN revenue_events re ON re.lead_id    = l.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single product with full performance breakdown
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await queryOne(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Not found' });

    const [keywords, content, leads, recentRuns] = await Promise.all([
      queryAll(`SELECT keyword, intent, serp_position, priority_score, revenue_attr, leads_attr
                FROM keywords WHERE product_id = $1 ORDER BY priority_score DESC LIMIT 20`, [req.params.id]),
      queryAll(`SELECT title, content_type, status, pageviews, leads_generated, revenue_attr
                FROM content_assets WHERE product_id = $1 ORDER BY revenue_attr DESC LIMIT 20`, [req.params.id]),
      queryAll(`SELECT email, company, stage, composite_score, created_at
                FROM leads WHERE product_id = $1 ORDER BY composite_score DESC LIMIT 20`, [req.params.id]),
      queryAll(`SELECT agent, job_type, status, started_at FROM agent_runs
                WHERE input_data::text LIKE $1 ORDER BY started_at DESC LIMIT 10`, [`%${req.params.id}%`]),
    ]);

    res.json({ ...product, keywords, content, leads, recentRuns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new product and trigger website analysis
app.post('/api/products', async (req, res) => {
  try {
    const { website_url, name } = req.body;
    if (!website_url) return res.status(400).json({ error: 'website_url required' });

    // Normalise URL
    const url = website_url.startsWith('http') ? website_url : `https://${website_url}`;

    // Insert in pending state
    const product = await queryOne(`
      INSERT INTO products (name, website_url, status)
      VALUES ($1, $2, 'analyzing')
      ON CONFLICT (website_url) DO UPDATE SET status = 'analyzing'
      RETURNING *
    `, [name || url, url]);

    res.status(201).json({ id: product.id, status: 'analyzing', message: 'Analysis started' });

    // Run analysis async (don't block the response)
    analyzeWebsite(url).then(async (profile) => {
      await queryOne(`
        UPDATE products SET
          name              = $1,
          tagline           = $2,
          description       = $3,
          icp               = $4,
          value_proposition = $5,
          features          = $6,
          competitors       = $7,
          pricing_model     = $8,
          target_market     = $9,
          brand_tone        = $10,
          raw_analysis      = $11,
          status            = 'active',
          analyzed_at       = NOW()
        WHERE id = $12
      `, [
        profile.name || name || url,
        profile.tagline,
        profile.description,
        profile.icp,
        profile.value_proposition,
        JSON.stringify(profile.features || []),
        JSON.stringify(profile.competitors || []),
        profile.pricing_model,
        profile.target_market,
        profile.brand_tone,
        JSON.stringify(profile),
        product.id,
      ]);
      logger.info('Product analysis complete', { productId: product.id, name: profile.name });
    }).catch(async (err) => {
      await queryOne(`UPDATE products SET status = 'failed' WHERE id = $1`, [product.id]);
      logger.error('Product analysis failed', { productId: product.id, err: err.message });
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Re-analyze an existing product
app.post('/api/products/:id/reanalyze', async (req, res) => {
  try {
    const product = await queryOne(`
      UPDATE products SET status = 'analyzing' WHERE id = $1 RETURNING *
    `, [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Not found' });

    res.json({ status: 'analyzing' });

    analyzeWebsite(product.website_url).then(async (profile) => {
      await queryOne(`
        UPDATE products SET
          name = $1, tagline = $2, description = $3, icp = $4,
          value_proposition = $5, features = $6, competitors = $7,
          pricing_model = $8, target_market = $9, brand_tone = $10,
          raw_analysis = $11, status = 'active', analyzed_at = NOW()
        WHERE id = $12
      `, [
        profile.name || product.name,
        profile.tagline, profile.description, profile.icp, profile.value_proposition,
        JSON.stringify(profile.features || []), JSON.stringify(profile.competitors || []),
        profile.pricing_model, profile.target_market, profile.brand_tone,
        JSON.stringify(profile), product.id,
      ]);
    }).catch(async () => {
      await queryOne(`UPDATE products SET status = 'failed' WHERE id = $1`, [product.id]);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a product and its associated keywords and content assets
app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Count what will be removed so we can return a summary
    const [kwRow, caRow, leadRow, reRow] = await Promise.all([
      queryOne(`SELECT COUNT(*) AS cnt FROM keywords       WHERE product_id = $1`, [id]),
      queryOne(`SELECT COUNT(*) AS cnt FROM content_assets WHERE product_id = $1`, [id]),
      queryOne(`SELECT COUNT(*) AS cnt FROM leads          WHERE product_id = $1`, [id]),
      queryOne(`SELECT COUNT(*) AS cnt FROM revenue_events WHERE lead_id IN (SELECT id FROM leads WHERE product_id = $1)`, [id]),
    ]);
    // revenue_events first — it FKs to leads, keywords, and content_assets
    await query(`DELETE FROM revenue_events WHERE lead_id IN (SELECT id FROM leads WHERE product_id = $1)`, [id]);
    await query(`DELETE FROM leads          WHERE product_id = $1`, [id]);
    await query(`DELETE FROM keywords       WHERE product_id = $1`, [id]);
    await query(`DELETE FROM content_assets WHERE product_id = $1`, [id]);
    await query(`DELETE FROM products       WHERE id = $1`,         [id]);
    res.json({
      ok: true,
      deleted: {
        revenue_events: parseInt(reRow?.cnt   || 0, 10),
        leads:          parseInt(leadRow?.cnt  || 0, 10),
        keywords:       parseInt(kwRow?.cnt    || 0, 10),
        content:        parseInt(caRow?.cnt    || 0, 10),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// GAP 2: A/B EXPERIMENT PAGE SERVING
// Serves the right content variant and tracks impressions
// ─────────────────────────────────────────────

// Serve a page with experiment variant assignment
app.get('/page/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // Look up the canonical content asset
    const asset = await queryOne(
      `SELECT id, title, body_html, status, published_url FROM content_assets
       WHERE slug = $1 AND status = 'published'`,
      [slug]
    );
    if (!asset) return res.status(404).json({ error: 'Page not found' });

    // Check for a running experiment linked to this content
    const experiment = await queryOne(
      `SELECT id, content_a, content_b, traffic_split
       FROM experiments
       WHERE status = 'running'
         AND (content_a = $1 OR content_b = $1)
       LIMIT 1`,
      [asset.id]
    );

    if (!experiment) {
      // No experiment — serve canonical page
      return res.type('html').send(asset.body_html || `<p>${asset.title}</p>`);
    }

    // Assign variant via cookie (sticky per user)
    const cookieKey = `exp_${experiment.id}`;
    const cookies   = parseCookies(req);
    let variant     = cookies[cookieKey];

    if (!variant) {
      variant = Math.random() < (parseFloat(experiment.traffic_split) || 0.5) ? 'a' : 'b';
      res.cookie(cookieKey, variant, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    }

    // Fetch the variant's content asset
    const variantAssetId = variant === 'a' ? experiment.content_a : experiment.content_b;
    const variantAsset   = variantAssetId
      ? await queryOne(`SELECT body_html, title FROM content_assets WHERE id = $1`, [variantAssetId])
      : null;

    // Track impression
    const col = variant === 'a' ? 'visitors_a' : 'visitors_b';
    await query(`UPDATE experiments SET ${col} = ${col} + 1 WHERE id = $1`, [experiment.id]);

    const html = variantAsset?.body_html || asset.body_html || `<p>${asset.title}</p>`;

    // Inject tracking pixel for conversion tracking
    const trackingScript = `<script>
      window.__exp = { id: '${experiment.id}', variant: '${variant}' };
      function trackConversion() {
        fetch('/track/experiment/${experiment.id}/conversion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variant: '${variant}' })
        });
      }
      document.querySelectorAll('form').forEach(f => f.addEventListener('submit', trackConversion));
      document.querySelectorAll('[data-cta]').forEach(el => el.addEventListener('click', trackConversion));
    </script>`;

    res.type('html').send(html.replace('</body>', `${trackingScript}</body>`) || html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Track a conversion event on an experiment
app.post('/track/experiment/:id/conversion', async (req, res) => {
  try {
    const { id } = req.params;
    const variant = req.body?.variant || parseCookies(req)[`exp_${id}`];
    if (!variant) return res.status(400).json({ error: 'variant required' });

    const col = variant === 'a' ? 'conversions_a' : 'conversions_b';
    await query(`UPDATE experiments SET ${col} = ${col} + 1 WHERE id = $1 AND status = 'running'`, [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// GAP 3: LEAD MAGNET DELIVERY
// Signed download tokens → lead capture → file redirect
// ─────────────────────────────────────────────

const LM_SECRET = process.env.LEAD_MAGNET_SECRET || 'change-me-in-production';

function signToken(payload) {
  const data = JSON.stringify(payload);
  const sig   = createHmac('sha256', LM_SECRET).update(data).digest('hex');
  return Buffer.from(`${data}::${sig}`).toString('base64url');
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const sepIdx  = decoded.lastIndexOf('::');
    const data    = decoded.slice(0, sepIdx);
    const sig     = decoded.slice(sepIdx + 2);
    const expected = createHmac('sha256', LM_SECRET).update(data).digest('hex');
    const match    = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return match ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

// List all active lead magnets
app.get('/api/lead-magnets', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT id, title, description, type, download_count, leads_captured, is_active, created_at
       FROM lead_magnets WHERE is_active = TRUE ORDER BY download_count DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: create a lead magnet
app.post('/api/lead-magnets', requireTriggerApiKey, async (req, res) => {
  try {
    const { title, description, file_url, type, content_asset_id } = req.body;
    if (!title || !file_url || !type) {
      return res.status(400).json({ error: 'title, file_url, and type are required' });
    }
    const row = await queryOne(
      `INSERT INTO lead_magnets (title, description, file_url, type, content_asset_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, description, file_url, type, content_asset_id || null]
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate a signed download token (called when visitor submits lead form)
app.post('/api/lead-magnets/:id/token', async (req, res) => {
  try {
    const { email, full_name, company, source_page } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const magnet = await queryOne(
      `SELECT id, title FROM lead_magnets WHERE id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (!magnet) return res.status(404).json({ error: 'Lead magnet not found' });

    const expiresAt  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const tokenData  = { lead_magnet_id: magnet.id, email, exp: expiresAt.getTime() };
    const token      = signToken(tokenData);

    await queryOne(
      `INSERT INTO lead_magnet_tokens
         (token, lead_magnet_id, email, full_name, company, source_page, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [token, magnet.id, email, full_name, company, source_page, expiresAt]
    );

    // Fire lead.captured so the lead is scored immediately
    const leadId = uuidv4();
    await queryOne(
      `INSERT INTO leads (id, email, full_name, company, first_touch_channel, stage)
       VALUES ($1, $2, $3, $4, 'organic_search', 'prospect')
       ON CONFLICT (email) DO NOTHING`,
      [leadId, email, full_name, company]
    );
    eventBus.emit('lead.captured', { leadId, email, sourcePage: source_page }).catch(() => {});

    const downloadUrl = `/download/${token}`;
    res.status(201).json({ token, downloadUrl, expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Redeem a download token — validate, capture lead, redirect to file
app.get('/download/:token', async (req, res) => {
  try {
    const payload = verifyToken(req.params.token);
    if (!payload) return res.status(400).send('Invalid or tampered download link.');
    if (Date.now() > payload.exp) return res.status(410).send('This download link has expired.');

    const tokenRow = await queryOne(
      `SELECT lmt.*, lm.file_url, lm.title
       FROM lead_magnet_tokens lmt
       JOIN lead_magnets lm ON lm.id = lmt.lead_magnet_id
       WHERE lmt.token = $1`,
      [req.params.token]
    );
    if (!tokenRow) return res.status(404).send('Download link not found.');

    // Record first download only
    if (!tokenRow.downloaded_at) {
      await query(
        `UPDATE lead_magnet_tokens SET downloaded_at = NOW() WHERE token = $1`,
        [req.params.token]
      );
      await query(
        `UPDATE lead_magnets SET download_count = download_count + 1 WHERE id = $1`,
        [tokenRow.lead_magnet_id]
      );

      // Tie download to the lead record
      const lead = await queryOne(`SELECT id FROM leads WHERE email = $1`, [tokenRow.email]);
      if (lead) {
        await query(
          `UPDATE lead_magnet_tokens SET lead_id = $1 WHERE token = $2`,
          [lead.id, req.params.token]
        );
        await query(
          `INSERT INTO pipeline_events (lead_id, event_type, channel, metadata)
           VALUES ($1, 'lead_magnet_download', 'organic_search', $2)`,
          [lead.id, JSON.stringify({ magnet: tokenRow.title, magnet_id: tokenRow.lead_magnet_id })]
        );
        // Intent spike on download
        await query(
          `UPDATE leads SET intent_score = LEAST(intent_score + 10, 100) WHERE id = $1`,
          [lead.id]
        );
      }
    }

    // Redirect to the actual file
    res.redirect(302, tokenRow.file_url);
  } catch (err) {
    logger.error('Download token error', { err: err.message });
    res.status(500).send('Download error — please contact support.');
  }
});

// ─────────────────────────────────────────────
// GAP 4: HUBSPOT INBOUND WEBHOOK (bi-directional sync)
// HubSpot → LSC stage updates on deal/contact changes
// ─────────────────────────────────────────────

app.post('/webhook/hubspot',
  validateWebhookSignature({ secretEnvKey: 'HUBSPOT_WEBHOOK_SECRET', headerName: 'x-hubspot-signature-v3' }),
  async (req, res) => {
    try {
      const events = Array.isArray(req.body) ? req.body : [req.body];
      const result = await hubspotClient.handleWebhook(events);
      logger.info('HubSpot webhook processed', result);
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      logger.error('HubSpot webhook error', { err: err.message });
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────
// GAP 11: REAL-TIME SSE — Live activity stream
// Dashboard connects here to get push events:
//   lead.scored, lead.stage_changed, content.published, intent_spike
// ─────────────────────────────────────────────

app.get('/api/live-activity', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering if applicable
  res.flushHeaders();

  // Send a heartbeat comment every 25s to keep the connection alive
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25_000);

  // Send current client count as initial connection confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ clients: clientCount() + 1, ts: new Date().toISOString() })}\n\n`);

  const clientId = registerClient(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    unregisterClient(clientId);
  });
});

// ─────────────────────────────────────────────
// GAP 12: AI BUDGET — Current spend vs budget
// ─────────────────────────────────────────────

app.get('/api/cost/budget', async (req, res) => {
  try {
    const budget = await getBudgetStatus();
    if (!budget) return res.json({ available: false, reason: 'db_unavailable' });

    const spent  = parseFloat(budget.spent_usd);
    const total  = parseFloat(budget.budget_usd);
    const pct    = total > 0 ? spent / total : 0;

    res.json({
      period:       budget.period,
      budget_usd:   total,
      spent_usd:    parseFloat(spent.toFixed(4)),
      remaining_usd: parseFloat(Math.max(0, total - spent).toFixed(4)),
      percent_used:  parseFloat((pct * 100).toFixed(1)),
      status:        pct >= 1.0 ? 'exceeded' : pct >= 0.8 ? 'warning' : 'ok',
      alert_80_sent:  budget.alert_80_sent,
      alert_100_sent: budget.alert_100_sent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// PLATFORM FEATURES — Phase 2
// ─────────────────────────────────────────────

// ── 2.1 Integration Settings ──────────────────

app.get('/api/settings/integrations', async (req, res) => {
  try {
    const rows = await queryAll(`SELECT id, integration_name, api_key, config_json, enabled, updated_at FROM integrations_config ORDER BY integration_name`);
    const masked = rows.map(r => ({
      ...r,
      api_key: r.api_key ? '****' + r.api_key.slice(-4) : null,
    }));
    res.json(masked);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings/integrations/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { api_key, config_json, enabled } = req.body;
    await query(
      `INSERT INTO integrations_config (integration_name, api_key, config_json, enabled, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       ON CONFLICT (integration_name) DO UPDATE
         SET api_key = COALESCE($2, integrations_config.api_key),
             config_json = COALESCE($3::jsonb, integrations_config.config_json),
             enabled = COALESCE($4, integrations_config.enabled),
             updated_at = NOW()`,
      [name, api_key || null, config_json ? JSON.stringify(config_json) : null, enabled ?? null]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings/integrations/test/:name', async (req, res) => {
  const start = Date.now();
  try {
    const cfg = await getIntegrationConfig(req.params.name);
    if (!cfg.api_key && !cfg.enabled) {
      return res.json({ ok: false, latency_ms: 0, error: 'Not configured' });
    }
    // Simple connectivity test — just verify config is readable
    res.json({ ok: true, latency_ms: Date.now() - start });
  } catch (err) { res.json({ ok: false, latency_ms: Date.now() - start, error: err.message }); }
});

app.post('/api/settings/alerts', async (req, res) => {
  try {
    const { webhook_url } = req.body;
    await query(
      `INSERT INTO integrations_config (integration_name, config_json, enabled, updated_at)
       VALUES ('alert_webhook', $1::jsonb, TRUE, NOW())
       ON CONFLICT (integration_name) DO UPDATE
         SET config_json = $1::jsonb, enabled = TRUE, updated_at = NOW()`,
      [JSON.stringify({ webhook_url })]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── 2.2 Content & Social ──────────────────────

app.patch('/api/content/:id/approval', async (req, res) => {
  try {
    const { approval_status } = req.body;
    await query(
      `UPDATE content_assets SET approval_status = $1 WHERE id = $2`,
      [approval_status, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/content/bulk-publish', async (req, res) => {
  try {
    const result = await query(
      `UPDATE content_assets
       SET status = 'published', approval_status = 'approved', published_at = COALESCE(published_at, NOW())
       WHERE status IN ('review', 'draft') OR approval_status = 'pending_review'
       RETURNING id`
    );
    res.json({ ok: true, published: result.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/content/:id/repurpose', async (req, res) => {
  try {
    const { platforms = ['linkedin', 'twitter'] } = req.body;
    const job = await queues.dispatch('authority_content', 'repurpose_content', {
      contentAssetId: req.params.id,
      platforms,
    }, { priority: 4 });
    res.json({ jobId: job.id, status: 'queued' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── 2.3 SEO & Keywords ────────────────────────

app.get('/api/keywords/clusters', async (req, res) => {
  try {
    const rows = await queryAll(`
      SELECT
        COALESCE(cluster_name, 'Unclustered') AS cluster_name,
        COUNT(*) AS keyword_count,
        SUM(search_volume) AS total_volume,
        AVG(priority_score) AS avg_priority,
        MAX(serp_position) AS worst_position,
        MIN(serp_position) AS best_position
      FROM keywords
      GROUP BY cluster_name
      ORDER BY total_volume DESC NULLS LAST
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/keywords/:id/serp-history', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT date, position, search_volume, source
       FROM keyword_serp_history
       WHERE keyword_id = $1
         AND date >= CURRENT_DATE - INTERVAL '90 days'
       ORDER BY date ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/keywords/:id/brief', async (req, res) => {
  try {
    const kw = await queryOne(`SELECT * FROM keywords WHERE id = $1`, [req.params.id]);
    if (!kw) return res.status(404).json({ error: 'Keyword not found' });
    const { content } = await callAI({
      agentName: 'seo_demand_capture',
      jobType:   'content_brief',
      system:    'You are a content strategist. Output structured JSON only.',
      messages:  [{
        role: 'user',
        content: `Generate a detailed content brief for the keyword: "${kw.keyword}"
Intent: ${kw.intent}, Search volume: ${kw.search_volume}, Difficulty: ${kw.difficulty}
Return JSON: { title, meta_description, h1, outline: [{heading, notes}], word_count, cta, internal_links_needed }`,
      }],
    });
    let brief;
    try { brief = JSON.parse(content.replace(/```json\n?|\n?```/g, '')); } catch { brief = { raw: content }; }
    res.json(brief);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/keywords/:id/internal-links', async (req, res) => {
  try {
    const kw = await queryOne(`SELECT keyword FROM keywords WHERE id = $1`, [req.params.id]);
    if (!kw) return res.status(404).json({ error: 'Not found' });
    const words = kw.keyword.split(' ').slice(0, 3).join(' | ');
    const rows = await queryAll(
      `SELECT id, title, slug, content_type, status
       FROM content_assets
       WHERE title ILIKE $1 OR body_markdown ILIKE $1
       LIMIT 10`,
      [`%${words}%`]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── 2.4 Lead CRM ──────────────────────────────

app.get('/api/leads/:id/timeline', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT id, event_type, event_data, source, created_at
       FROM lead_timeline WHERE lead_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/leads/:id/enrich', async (req, res) => {
  try {
    const lead = await queryOne(`SELECT * FROM leads WHERE id = $1`, [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const enriched = await hubspotClient.enrichContact(lead.email);
    if (enriched) {
      await query(
        `UPDATE leads SET company = COALESCE($1, company), job_title = COALESCE($2, job_title) WHERE id = $3`,
        [enriched.company, enriched.job_title, req.params.id]
      );
      await query(
        `INSERT INTO lead_timeline (lead_id, event_type, event_data, source)
         VALUES ($1, 'enriched', $2::jsonb, 'hubspot')`,
        [req.params.id, JSON.stringify(enriched)]
      );
    }
    res.json({ ok: true, enriched: enriched || {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/leads/:id/trigger-sequence', async (req, res) => {
  try {
    const lead = await queryOne(`SELECT email FROM leads WHERE id = $1`, [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { sequence_id } = req.body;
    await emailClient.enrollInSequence(lead.email, sequence_id);
    await query(
      `INSERT INTO lead_timeline (lead_id, event_type, event_data, source)
       VALUES ($1, 'email_sent', $2::jsonb, 'sendgrid')`,
      [req.params.id, JSON.stringify({ sequence_id, triggered_at: new Date().toISOString() })]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/leads/:id/owner', async (req, res) => {
  try {
    const { owner_email } = req.body;
    await query(`UPDATE leads SET owner_email = $1 WHERE id = $2`, [owner_email, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── 2.5 Analytics ─────────────────────────────

app.get('/api/analytics/ai-costs', async (req, res) => {
  try {
    const rows = await queryAll(`
      SELECT
        agent,
        job_type,
        DATE(started_at) AS day,
        COUNT(*) AS runs,
        SUM(tokens_used) AS total_tokens,
        SUM(cost_usd) AS total_cost_usd
      FROM agent_runs
      WHERE started_at >= NOW() - INTERVAL '30 days'
      GROUP BY agent, job_type, day
      ORDER BY day DESC, total_cost_usd DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/analytics/channel-roi', async (req, res) => {
  try {
    const rows = await queryAll(`
      SELECT
        COALESCE(l.first_touch_channel, 'unknown') AS channel,
        COUNT(DISTINCT l.id) AS leads,
        COUNT(DISTINCT re.id) AS conversions,
        COALESCE(SUM(re.amount_usd), 0) AS revenue_usd,
        CASE WHEN COUNT(DISTINCT l.id) > 0
             THEN COALESCE(SUM(re.amount_usd), 0) / COUNT(DISTINCT l.id)
             ELSE 0 END AS revenue_per_lead
      FROM leads l
      LEFT JOIN revenue_events re ON re.lead_id = l.id
      GROUP BY l.first_touch_channel
      ORDER BY revenue_usd DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/analytics/cohort', async (req, res) => {
  try {
    const rows = await queryAll(`
      SELECT
        DATE_TRUNC('week', l.created_at) AS cohort_week,
        COUNT(DISTINCT l.id) AS leads,
        COUNT(DISTINCT re.lead_id) AS converted,
        CASE WHEN COUNT(DISTINCT l.id) > 0
             THEN ROUND(100.0 * COUNT(DISTINCT re.lead_id) / COUNT(DISTINCT l.id), 1)
             ELSE 0 END AS conversion_rate
      FROM leads l
      LEFT JOIN revenue_events re ON re.lead_id = l.id
      WHERE l.created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY cohort_week
      ORDER BY cohort_week DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/experiments/:id/autoscale', async (req, res) => {
  try {
    const exp = await queryOne(`SELECT * FROM experiments WHERE id = $1`, [req.params.id]);
    if (!exp) return res.status(404).json({ error: 'Not found' });
    const { conversions_a = 0, conversions_b = 0 } = exp;
    const winner = conversions_b > conversions_a ? 'b' : 'a';
    await query(
      `UPDATE experiments SET traffic_split = $1, status = 'completed' WHERE id = $2`,
      [winner === 'b' ? 1.0 : 0.0, req.params.id]
    );
    res.json({ ok: true, winner, traffic_split: winner === 'b' ? 1.0 : 0.0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── 2.6 Agent Schedules ───────────────────────

app.get('/api/agents/schedules', async (req, res) => {
  try {
    const rows = await queryAll(`SELECT * FROM agent_schedules ORDER BY agent_name, job_type`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/agents/schedules/:id', async (req, res) => {
  try {
    const { cron_expression, enabled, max_daily_cost } = req.body;
    await query(
      `UPDATE agent_schedules
       SET cron_expression = COALESCE($1, cron_expression),
           enabled         = COALESCE($2, enabled),
           max_daily_cost  = COALESCE($3, max_daily_cost),
           updated_at      = NOW()
       WHERE id = $4`,
      [cron_expression || null, enabled ?? null, max_daily_cost ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── 2.7 UX / Platform ─────────────────────────

app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ leads: [], content: [], keywords: [], products: [] });
    const like = `%${q}%`;
    const [leads, content, keywords, products] = await Promise.all([
      queryAll(`SELECT id, email, full_name, company, stage FROM leads WHERE email ILIKE $1 OR full_name ILIKE $1 OR company ILIKE $1 LIMIT 5`, [like]),
      queryAll(`SELECT id, title, content_type, status FROM content_assets WHERE title ILIKE $1 LIMIT 5`, [like]),
      queryAll(`SELECT id, keyword, intent, serp_position FROM keywords WHERE keyword ILIKE $1 LIMIT 5`, [like]),
      queryAll(`SELECT id, name, website_url FROM products WHERE name ILIKE $1 OR website_url ILIKE $1 LIMIT 5`, [like]),
    ]);
    res.json({ leads, content, keywords, products });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/export/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { format = 'csv', stage, dateFrom, dateTo } = req.query;
    let rows = [];
    let filename = `${type}.${format === 'json' ? 'json' : 'csv'}`;

    if (type === 'leads') {
      const conditions = [];
      const params = [];
      if (stage) { params.push(stage); conditions.push(`stage = $${params.length}`); }
      if (dateFrom) { params.push(dateFrom); conditions.push(`created_at >= $${params.length}`); }
      if (dateTo) { params.push(dateTo); conditions.push(`created_at <= $${params.length}`); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      rows = await queryAll(
        `SELECT id, email, full_name, company, job_title, stage, composite_score,
                intent_score, fit_score, engagement_score,
                first_touch_channel, utm_source, utm_medium, utm_campaign,
                created_at, converted_at
         FROM leads ${where} ORDER BY created_at DESC`,
        params
      );
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.json(rows);
      }
    } else if (type === 'content') {
      rows = await queryAll(`SELECT id, title, content_type, status, approval_status, pageviews, leads_generated, revenue_attr, published_at FROM content_assets ORDER BY created_at DESC`);
    } else if (type === 'keywords') {
      rows = await queryAll(`SELECT id, keyword, intent, search_volume, difficulty, serp_position, priority_score, cluster_name FROM keywords ORDER BY priority_score DESC NULLS LAST`);
    } else if (type === 'social-posts') {
      rows = await queryAll(`SELECT id, platform, caption, status, likes_count, comments_count, shares_count, published_at FROM social_posts ORDER BY created_at DESC`);
    } else {
      return res.status(400).json({ error: 'Unknown export type' });
    }

    if (!rows.length) return res.status(200).send('');

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => {
        const v = r[h] == null ? '' : String(r[h]);
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// NOTIFICATIONS CRUD
// ─────────────────────────────────────────────

app.get('/api/notifications', async (req, res) => {
  try {
    const { unread, limit = 50, type } = req.query;
    const conditions = [];
    const params = [];
    if (unread === 'true') { conditions.push(`read_at IS NULL`); }
    if (type) { params.push(type); conditions.push(`type = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await queryAll(
      `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ${parseInt(limit)}`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/notifications/read-all', async (req, res) => {
  try {
    await query(`UPDATE notifications SET read_at = NOW() WHERE read_at IS NULL`);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    await query(`UPDATE notifications SET read_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/notifications/:id', async (req, res) => {
  try {
    await query(`DELETE FROM notifications WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────

app.get('/api/audit-logs', async (req, res) => {
  try {
    const { limit = 50, offset = 0, userId, action } = req.query;
    const conditions = [];
    const params = [];
    if (userId) { params.push(userId); conditions.push(`user_id = $${params.length}`); }
    if (action) { params.push(`%${action}%`); conditions.push(`action ILIKE $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), parseInt(offset));
    const rows = await queryAll(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// INTEGRATIONS CONFIG CRUD
// ─────────────────────────────────────────────

app.get('/api/integrations', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT id, integration_name, config_json, enabled, last_sync_at, last_error, updated_at
       FROM integrations_config ORDER BY integration_name`
    );
    // Mask secrets inside config_json
    const masked = rows.map(r => {
      let cfg = r.config_json || {};
      if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }
      // Redact any key that looks like a secret
      const safeCfg = Object.fromEntries(
        Object.entries(cfg).map(([k, v]) => {
          const lower = k.toLowerCase();
          if (lower.includes('secret') || lower.includes('token') || lower.includes('api_key') || lower.includes('password')) {
            return [k, v ? '****' : null];
          }
          return [k, v];
        })
      );
      return { ...r, config_json: safeCfg };
    });
    res.json(masked);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/integrations/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { enabled, webhook_url, config } = req.body;
    // Build config_json update from webhook_url or explicit config
    const configUpdate = config || (webhook_url ? { webhook_url } : null);
    await query(
      `INSERT INTO integrations_config (integration_name, config_json, enabled, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (integration_name) DO UPDATE
         SET enabled     = COALESCE($3, integrations_config.enabled),
             config_json = CASE WHEN $2::jsonb IS NOT NULL
                                THEN integrations_config.config_json || $2::jsonb
                                ELSE integrations_config.config_json END,
             updated_at  = NOW()`,
      [name, configUpdate ? JSON.stringify(configUpdate) : null, enabled ?? null]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/onboarding/status', async (req, res) => {
  try {
    const [intCount, contCount, leadCount] = await Promise.all([
      queryOne(`SELECT COUNT(*) AS cnt FROM integrations_config WHERE enabled = TRUE`),
      queryOne(`SELECT COUNT(*) AS cnt FROM content_assets`),
      queryOne(`SELECT COUNT(*) AS cnt FROM leads`),
    ]);
    const integrations_configured = parseInt(intCount?.cnt || 0) > 0;
    const has_content  = parseInt(contCount?.cnt || 0) > 0;
    const has_leads    = parseInt(leadCount?.cnt || 0) > 0;
    const complete     = integrations_configured && has_content && has_leads;
    res.json({ complete, integrations_configured, has_content, has_leads });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Lead PATCH (stage, owner, score updates from dashboard) ───────────────────
app.patch('/api/leads/:id', async (req, res) => {
  try {
    const allowed = ['stage', 'owner_email', 'intent_score', 'fit_score', 'engagement_score'];
    const updates = [];
    const params  = [];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        params.push(req.body[field]);
        updates.push(`${field} = $${params.length}`);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    params.push(req.params.id);
    const row = await queryOne(
      `UPDATE leads SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING id`,
      params
    );
    if (!row) return res.status(404).json({ error: 'Lead not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Products PATCH ─────────────────────────────────────────────────────────────
app.patch('/api/products/:id', async (req, res) => {
  try {
    const allowed = ['name', 'tagline', 'description', 'icp', 'value_proposition', 'brand_tone', 'pricing_model', 'target_market'];
    const updates = [];
    const params  = [];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        params.push(req.body[field]);
        updates.push(`${field} = $${params.length}`);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    params.push(req.params.id);
    const row = await queryOne(
      `UPDATE products SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING id`,
      params
    );
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Agent run inspector (full detail) ─────────
app.get('/api/agent-runs/:id/detail', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM agent_runs WHERE id = $1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Register error handler last
app.use(errorHandler);

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

app.listen(config.port, () => {
  logger.info(`Orchestrator server running on port ${config.port}`);
  startAutonomousLoop();
  logger.info('Autonomous growth loop ACTIVE');
});

export default app;
