/**
 * Agent 1: Revenue Orchestrator (The Brain)
 *
 * Responsibilities:
 * - Define weekly/monthly revenue targets
 * - Evaluate agent performance against goals
 * - Dynamically prioritize which agents run and on what
 * - Allocate "effort budget" across channels
 * - Kill underperforming strategies ruthlessly
 * - Signal when organic benchmarks unlock paid growth
 */

import { callAI, parseJSON } from '../utils/ai.js';
import { queryAll, queryOne, query } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { queues } from '../queues/index.js';
import { v4 as uuidv4 } from 'uuid';

const log = agentLogger('revenue_orchestrator');

const SYSTEM_PROMPT = `You are the Revenue Orchestrator for ${config.business.companyName}.

Your ONLY metric is revenue. Not traffic. Not impressions. Revenue.

Business context:
- ICP: ${config.business.icp}
- Value proposition: ${config.business.valueProposition}
- Target MRR: $${config.business.targetMrrUsd}
- Avg deal size: $${config.business.avgDealSizeUsd}
- Strategy: Organic-only until conversion benchmarks are met

You analyze real performance data and make precise, actionable decisions.
You output structured JSON decisions only — no commentary, no fluff.
Every recommendation must include: what to do, why, expected impact, priority (1-5).`;

export class RevenueOrchestratorAgent {
  constructor() {
    this.name = 'revenue_orchestrator';
  }

  /**
   * Weekly strategic review — runs every Monday at 06:00
   */
  async weeklyStrategicReview() {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Starting weekly strategic review', { runId });

    try {
      // 1. Gather all performance data — use allSettled so one failing query
      //    doesn't abort the entire review.
      const settled = await Promise.allSettled([
        this._getKPIs(),
        this._getTopContent(10),
        this._getTopKeywords(20),
        this._getLeadPipeline(),
        this._getRecentRevenue(30),
        this._getExperiments(),
      ]);

      const [kpis, topContent, topKeywords, leadPipeline, recentRevenue, experiments] =
        settled.map((r, i) => {
          if (r.status === 'rejected') {
            log.warn('weeklyStrategicReview: data fetch failed', { index: i, err: r.reason?.message });
          }
          // Default to null for scalars, empty array for collections
          return r.status === 'fulfilled' ? r.value : (i === 0 ? null : []);
        });

      // 2. Get current goals
      const currentGoals = await queryOne(
        `SELECT * FROM growth_goals WHERE status = 'active' ORDER BY period_start DESC LIMIT 1`
      );

      // 3. Ask AI for strategic decisions
      const { content, inputTokens, outputTokens, costUsd, durationMs } = await callAI({
        agentName: this.name,
        jobType: 'weekly_strategic_review',
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Perform a full weekly strategic review and output your decisions.

CURRENT PERFORMANCE DATA:
${JSON.stringify({ kpis, topContent, topKeywords, leadPipeline, recentRevenue, experiments }, null, 2)}

CURRENT GOALS:
${JSON.stringify(currentGoals, null, 2)}

Analyze this data and return a JSON object with this exact structure:
{
  "executive_summary": "2-3 sentence assessment of growth trajectory",
  "revenue_gap": { "current_mrr": number, "target_mrr": number, "gap_usd": number, "weeks_to_target": number },
  "next_week_goals": {
    "leads_target": number,
    "content_to_publish": number,
    "keywords_to_target": string[],
    "experiments_to_run": number
  },
  "agent_priorities": [
    { "agent": "seo_demand_capture", "priority": 1-5, "focus": "...", "actions": [...] },
    { "agent": "authority_content",  "priority": 1-5, "focus": "...", "actions": [...] },
    { "agent": "social_distribution","priority": 1-5, "focus": "...", "actions": [...] },
    { "agent": "inbound_conversion",  "priority": 1-5, "focus": "...", "actions": [...] },
    { "agent": "revenue_analytics",   "priority": 1-5, "focus": "...", "actions": [...] },
    { "agent": "compounding_growth",  "priority": 1-5, "focus": "...", "actions": [...] }
  ],
  "kill_list": [
    { "type": "content|keyword|experiment|channel", "id": "...", "reason": "..." }
  ],
  "scale_list": [
    { "type": "content|keyword|channel", "id": "...", "reason": "...", "action": "..." }
  ],
  "paid_unlock_status": {
    "unlocked": boolean,
    "reason": "...",
    "thresholds_met": { "organic_leads_per_month": boolean, "conversion_rate": boolean, "cac_below_ltv": boolean }
  },
  "playbook_updates": [
    { "name": "...", "category": "...", "insight": "..." }
  ]
}`,
        }],
        maxTokens: 6000,
        temperature: 0.2,
      });

      const decisions = parseJSON(content);

      // 4. Execute decisions
      await this._executeDecisions(decisions);

      // 5. Log run
      await this._logRun(runId, 'weekly_strategic_review', 'success', {
        kpis, currentGoals,
      }, decisions, inputTokens + outputTokens, costUsd, Date.now() - start);

      log.info('Weekly strategic review complete', {
        runId,
        executiveSummary: decisions.executive_summary,
        killCount: decisions.kill_list?.length,
        scaleCount: decisions.scale_list?.length,
      });

      return decisions;
    } catch (err) {
      await this._logRun(runId, 'weekly_strategic_review', 'failed', {}, {}, 0, 0, Date.now() - start, err.message);
      throw err;
    }
  }

  /**
   * Daily priority dispatch — runs every morning at 07:00
   */
  async dailyDispatch() {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Starting daily dispatch', { runId });

    try {
      const kpis = await this._getKPIs();
      const currentGoals = await queryOne(
        `SELECT * FROM growth_goals WHERE status = 'active' ORDER BY period_start DESC LIMIT 1`
      );

      const { content, inputTokens, outputTokens, costUsd } = await callAI({
        agentName: this.name,
        jobType: 'daily_dispatch',
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Generate today's agent dispatch plan.

KPIs: ${JSON.stringify(kpis)}
Weekly Goals: ${JSON.stringify(currentGoals)}
Today: ${new Date().toISOString().split('T')[0]}

Return JSON:
{
  "dispatch": [
    {
      "agent": "agent_name",
      "jobs": [
        { "type": "job_type", "payload": {}, "priority": 1-10 }
      ]
    }
  ]
}`,
        }],
        maxTokens: 2000,
        temperature: 0.2,
      });

      const plan = parseJSON(content);

      // Dispatch jobs to BullMQ queues
      for (const agentPlan of plan.dispatch || []) {
        for (const job of agentPlan.jobs || []) {
          await queues.dispatch(agentPlan.agent, job.type, job.payload, {
            priority: job.priority,
            jobId: `${agentPlan.agent}-${job.type}-${Date.now()}`,
          });
          log.info('Dispatched job', { agent: agentPlan.agent, jobType: job.type });
        }
      }

      await this._logRun(runId, 'daily_dispatch', 'success',
        { kpis }, plan, inputTokens + outputTokens, costUsd, Date.now() - start);

      return plan;
    } catch (err) {
      await this._logRun(runId, 'daily_dispatch', 'failed', {}, {}, 0, 0, Date.now() - start, err.message);
      throw err;
    }
  }

  async _executeDecisions(decisions) {
    // UUID format validator — GPT sometimes returns names instead of real UUIDs
    const isUUID = (str) => typeof str === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    // Kill underperforming assets
    for (const item of decisions.kill_list || []) {
      if (!isUUID(item.id)) {
        log.warn('Skipping kill_list item — id is not a UUID', { id: item.id, type: item.type });
        continue;
      }
      if (item.type === 'content') {
        await query(
          `UPDATE content_assets SET status = 'killed', killed_at = NOW(), kill_reason = $1 WHERE id = $2`,
          [item.reason, item.id]
        );
        log.info('Killed content asset', { id: item.id, reason: item.reason });
      }
      if (item.type === 'keyword') {
        await query(
          `UPDATE keywords SET priority_score = 0 WHERE id = $1`,
          [item.id]
        );
      }
    }

    // Queue scale actions
    for (const item of decisions.scale_list || []) {
      if (!isUUID(item.id)) {
        log.warn('Skipping scale_list item — id is not a UUID', { id: item.id, type: item.type });
        continue;
      }
      await queues.dispatch('compounding_growth', 'scale_winner', {
        type: item.type,
        id: item.id,
        action: item.action,
        reason: item.reason,
      });
    }

    // Store new playbook insights
    for (const pb of decisions.playbook_updates || []) {
      await query(
        `INSERT INTO playbooks (name, category, description, created_by)
         VALUES ($1, $2, $3, 'revenue_orchestrator')
         ON CONFLICT DO NOTHING`,
        [pb.name, pb.category, pb.insight]
      );
    }

    // Update/create weekly goal
    if (decisions.next_week_goals) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
      const weekEnd   = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      await query(
        `INSERT INTO growth_goals (period, period_start, period_end, target_leads, target_mrr_usd)
         VALUES ('weekly', $1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [
          weekStart.toISOString().split('T')[0],
          weekEnd.toISOString().split('T')[0],
          decisions.next_week_goals.leads_target,
          config.business.targetMrrUsd,
        ]
      );
    }
  }

  async _getKPIs() {
    return queryOne('SELECT * FROM v_organic_kpis');
  }

  async _getTopContent(limit = 10) {
    return queryAll(
      `SELECT title, content_type, pageviews, leads_generated, revenue_attr, conversion_rate, status
       FROM v_revenue_by_content LIMIT $1`,
      [limit]
    );
  }

  async _getTopKeywords(limit = 20) {
    return queryAll(
      `SELECT keyword, intent, serp_position, total_leads, total_revenue, revenue_per_lead
       FROM v_revenue_by_keyword LIMIT $1`,
      [limit]
    );
  }

  async _getLeadPipeline() {
    return queryAll(
      `SELECT stage, COUNT(*) as count, AVG(composite_score) as avg_score
       FROM leads GROUP BY stage ORDER BY
       CASE stage WHEN 'visitor' THEN 1 WHEN 'prospect' THEN 2 WHEN 'mql' THEN 3
                  WHEN 'sql' THEN 4 WHEN 'opportunity' THEN 5 WHEN 'customer' THEN 6 END`
    );
  }

  async _getRecentRevenue(days = 30) {
    return queryAll(
      `SELECT DATE_TRUNC('week', occurred_at) as week,
              SUM(amount_usd) as revenue, COUNT(*) as deals
       FROM revenue_events
       WHERE occurred_at >= NOW() - INTERVAL '${days} days'
       GROUP BY week ORDER BY week`
    );
  }

  async _getExperiments() {
    return queryAll(
      `SELECT name, status, confidence, winner, winner_uplift FROM experiments
       WHERE status IN ('running','winner_found') ORDER BY started_at DESC LIMIT 10`
    );
  }

  async _logRun(id, jobType, status, input, output, tokens, costUsd, durationMs, error = null) {
    await query(
      `INSERT INTO agent_runs (id, agent, job_type, status, input, output, tokens_used, cost_usd, duration_ms, error, completed_at, triggered_by)
       VALUES ($1, 'revenue_orchestrator', $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'scheduler')`,
      [id, jobType, status, JSON.stringify(input), JSON.stringify(output), tokens, costUsd, durationMs, error]
    );
  }
}
