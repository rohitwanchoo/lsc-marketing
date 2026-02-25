import OpenAI from 'openai';
import { config } from '../config.js';
import { logger } from './logger.js';
import { query, queryOne } from './db.js';

const client = new OpenAI({ apiKey: config.openai.apiKey });

// ─────────────────────────────────────────────
// Budget guardrails
// ─────────────────────────────────────────────

// Agents that continue even when over budget (on fallback model)
const CRITICAL_AGENTS = new Set(['inbound_conversion', 'revenue_orchestrator']);

// Cheaper fallback model used for critical agents when over budget
const FALLBACK_MODEL = 'gpt-4o-mini';

// In-memory cache — refreshed every 5 minutes
let _budgetCache = null;
let _budgetFetchedAt = 0;
const BUDGET_TTL_MS = 5 * 60 * 1000;

async function getBudget() {
  const now = Date.now();
  if (_budgetCache && (now - _budgetFetchedAt) < BUDGET_TTL_MS) return _budgetCache;

  const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  try {
    // Upsert ensures the row exists for the current month
    const row = await queryOne(
      `INSERT INTO ai_budget (period, budget_usd)
       VALUES ($1, $2)
       ON CONFLICT (period) DO UPDATE SET period = EXCLUDED.period
       RETURNING *`,
      [period, config.budget.monthlyUsd]
    );
    _budgetCache = row;
    _budgetFetchedAt = now;
    return row;
  } catch {
    return null; // DB unavailable — don't block AI calls
  }
}

async function _trackSpend(period, costUsd) {
  try {
    await query(
      `UPDATE ai_budget
         SET spent_usd = spent_usd + $1, updated_at = NOW()
       WHERE period = $2`,
      [costUsd, period]
    );

    // Refresh cache after spend update
    const updated = await queryOne(
      `SELECT * FROM ai_budget WHERE period = $1`, [period]
    );
    if (updated) {
      _budgetCache = updated;
      _budgetFetchedAt = Date.now();

      const pct = parseFloat(updated.spent_usd) / parseFloat(updated.budget_usd);

      // 80% alert — once per period
      if (pct >= 0.8 && !updated.alert_80_sent) {
        await query(
          `UPDATE ai_budget SET alert_80_sent = TRUE WHERE period = $1 AND alert_80_sent = FALSE`,
          [period]
        );
        // Lazy import to avoid circular dependencies
        import('../integrations/slack.js').then(({ slackClient }) => {
          slackClient.sendAlert({
            text: `⚠️ AI budget alert: ${(pct * 100).toFixed(0)}% used ($${parseFloat(updated.spent_usd).toFixed(2)} / $${parseFloat(updated.budget_usd).toFixed(2)}) for ${period}. Non-critical agents will be blocked at 100%.`,
          }).catch(() => {});
        }).catch(() => {});
      }

      // 100% alert — once per period
      if (pct >= 1.0 && !updated.alert_100_sent) {
        await query(
          `UPDATE ai_budget SET alert_100_sent = TRUE WHERE period = $1 AND alert_100_sent = FALSE`,
          [period]
        );
        import('../integrations/slack.js').then(({ slackClient }) => {
          slackClient.sendAlert({
            text: `🚨 AI budget EXCEEDED: $${parseFloat(updated.spent_usd).toFixed(2)} spent of $${parseFloat(updated.budget_usd).toFixed(2)} budget for ${period}. Non-critical agents are blocked. Critical agents switched to fallback model.`,
          }).catch(() => {});
        }).catch(() => {});
      }
    }
  } catch { /* non-critical */ }
}

/**
 * Core AI call with automatic run tracking, cost estimation, and budget guardrails
 */
export async function callAI({
  system,
  messages,
  model = config.openai.model,
  maxTokens = 4096,
  temperature = 0.3,
  agentName = 'unknown',
  jobType = 'unknown',
}) {
  const start = Date.now();

  // ── Budget pre-check ──────────────────────────────
  const budget = await getBudget();
  const period = new Date().toISOString().slice(0, 7);

  if (budget) {
    const pct = parseFloat(budget.spent_usd) / parseFloat(budget.budget_usd);
    if (pct >= 1.0) {
      if (CRITICAL_AGENTS.has(agentName)) {
        // Critical agents continue on cheapest fallback model
        model = FALLBACK_MODEL;
        logger.warn('AI budget exceeded — critical agent using fallback model', {
          agentName, jobType, model, spentUsd: budget.spent_usd, budgetUsd: budget.budget_usd,
        });
      } else {
        // Non-critical agents are blocked
        logger.warn('AI budget exceeded — non-critical agent blocked', {
          agentName, jobType, spentUsd: budget.spent_usd, budgetUsd: budget.budget_usd,
        });
        throw new Error(`AI budget exceeded for ${period}. Agent ${agentName} is non-critical and has been paused until next month.`);
      }
    }
  }

  // ── AI call ───────────────────────────────────────
  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    });

    const inputTokens  = response.usage?.prompt_tokens     || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    // GPT-4o-mini pricing: $0.15/MTok input, $0.60/MTok output
    const costUsd = (inputTokens * 0.15 + outputTokens * 0.60) / 1_000_000;

    logger.info('AI call complete', {
      agent: agentName,
      jobType,
      model,
      inputTokens,
      outputTokens,
      costUsd: costUsd.toFixed(6),
      durationMs: Date.now() - start,
    });

    // ── Non-blocking spend tracking ───────────────────
    if (budget && costUsd > 0) {
      _trackSpend(period, costUsd).catch(() => {});
    }

    return {
      content:    response.choices[0]?.message?.content || '',
      inputTokens,
      outputTokens,
      costUsd,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    // Re-throw budget errors without logging them as AI errors
    if (err.message?.includes('AI budget exceeded')) throw err;
    logger.error('AI call failed', { agentName, jobType, err: err.message });
    throw err;
  }
}

/**
 * Parse JSON from AI response reliably
 */
export function parseJSON(text) {
  // Extract JSON block if wrapped in markdown
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = match ? match[1] : text;
  try {
    return JSON.parse(raw.trim());
  } catch {
    // Try to extract first JSON object/array
    const objMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objMatch) return JSON.parse(objMatch[1]);
    throw new Error(`Cannot parse JSON from: ${raw.substring(0, 200)}`);
  }
}

/**
 * Get current budget state (for the API endpoint)
 */
export async function getBudgetStatus() {
  return getBudget();
}
