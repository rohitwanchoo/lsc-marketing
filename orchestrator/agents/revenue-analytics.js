/**
 * Agent 6: Revenue Analytics Agent
 *
 * Purpose: Prove what actually makes money — attribution, patterns, decisions
 * Rule: Recommend next actions, not reports
 * Output: Weekly growth insights, kill/scale decisions, paid unlock signals
 */

import { callAI, parseJSON } from '../utils/ai.js';
import { queryAll, queryOne, query, withTransaction } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { v4 as uuidv4 } from 'uuid';

const PYTHON_API = config.pythonApiUrl;

const log = agentLogger('revenue_analytics');

const SYSTEM_PROMPT = `You are the Revenue Analytics Agent for ${config.business.companyName}.

You analyze real performance data and produce actionable growth intelligence.
You do NOT write reports. You produce decisions.

Every output must answer: "What should we DO differently next week?"

Your analysis covers:
- Multi-touch revenue attribution (keyword → page → lead → revenue)
- Content ROI by piece, by type, by channel
- Lead quality by source, stage conversion rates
- Experiment results interpretation
- CAC vs LTV trends
- Pipeline velocity

DECISION FRAMEWORK:
1. If content converts < 0.5% → flag for kill or major rewrite
2. If keyword has leads but no revenue → check funnel leak
3. If lead stage conversion < industry avg → fix that stage
4. If experiment shows >10% uplift at >90% confidence → declare winner and scale

Output structured JSON with decisions, not observations.`;

export class RevenueAnalyticsAgent {
  constructor() {
    this.name = 'revenue_analytics';
  }

  /**
   * Full weekly revenue intelligence report with action items
   */
  async weeklyIntelligenceReport() {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Generating weekly intelligence report', { runId });

    const [
      revenueByContent,
      revenueByKeyword,
      pipelineVelocity,
      stageConversions,
      experimentResults,
      topLeadSources,
      cacTrend,
    ] = await Promise.all([
      queryAll('SELECT * FROM v_revenue_by_content LIMIT 20'),
      queryAll('SELECT * FROM v_revenue_by_keyword LIMIT 20'),
      queryAll('SELECT * FROM v_pipeline_velocity LIMIT 8'),
      this._getStageConversions(),
      this._getExperimentResults(),
      this._getTopLeadSources(),
      this._getCACTrend(),
    ]);

    // Enrich with Python Analytics API (non-blocking — degrade gracefully)
    const [mrrForecast, attributionModels, experimentStats] = await Promise.all([
      this._callPythonApi('/forecasting/mrr', { monthly_data: cacTrend }),
      this._callPythonApi('/attribution/analyze', {
        touchpoints: revenueByKeyword.map(k => ({
          channel: k.keyword,
          revenue: k.revenue_attr || 0,
          leads: k.leads_attr || 0,
        })),
        models: ['u_shaped', 'linear', 'time_decay', 'first_touch', 'last_touch'],
      }),
      experimentResults.length
        ? this._callPythonApi('/experiments/analyze', { experiments: experimentResults })
        : Promise.resolve(null),
    ]);

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'weekly_intelligence',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analyze this week's organic revenue performance and produce action decisions.

Revenue by content: ${JSON.stringify(revenueByContent)}
Revenue by keyword: ${JSON.stringify(revenueByKeyword)}
Pipeline velocity: ${JSON.stringify(pipelineVelocity)}
Stage conversions: ${JSON.stringify(stageConversions)}
Experiments: ${JSON.stringify(experimentResults)}
Top lead sources: ${JSON.stringify(topLeadSources)}
CAC trend: ${JSON.stringify(cacTrend)}

--- Python Analytics Insights ---
MRR Forecast (next 90 days): ${JSON.stringify(mrrForecast)}
Attribution model comparison: ${JSON.stringify(attributionModels)}
Statistical experiment results: ${JSON.stringify(experimentStats)}

Return JSON:
{
  "headline_insight": "1 sentence: the most important thing happening in our growth",
  "revenue_attribution": {
    "top_revenue_keywords": [...],
    "top_revenue_content": [...],
    "top_revenue_channel": "...",
    "biggest_opportunity": "..."
  },
  "funnel_leaks": [
    {
      "stage": "...",
      "conversion_rate": number,
      "industry_benchmark": number,
      "fix": "..."
    }
  ],
  "experiment_decisions": [
    {
      "experiment_name": "...",
      "decision": "declare_winner|kill|extend",
      "reason": "...",
      "winner": "a|b|null",
      "action": "..."
    }
  ],
  "kill_list": [
    { "type": "content|keyword", "id": "...", "title": "...", "reason": "..." }
  ],
  "scale_list": [
    { "type": "content|keyword|channel", "id": "...", "action": "...", "expected_roi": "..." }
  ],
  "next_week_bets": [
    { "bet": "...", "rationale": "...", "success_metric": "..." }
  ],
  "paid_unlock_check": {
    "organic_lead_volume_sufficient": boolean,
    "conversion_rate_benchmark_met": boolean,
    "cac_acceptable": boolean,
    "recommendation": "stay_organic|prepare_for_paid|unlock_paid"
  }
}`,
      }],
      maxTokens: 5000,
    });

    const intelligence = parseJSON(content);

    // Execute decisions automatically
    await this._executeAnalyticDecisions(intelligence);

    // Auto-resolve experiments with statistical significance
    const experimentResolution = await this._autoResolveExperiments();
    log.info('Experiment auto-resolution complete', experimentResolution);

    // Recalibrate lead scoring weights from closed deal data
    const { InboundConversionAgent } = await import('./inbound-conversion.js');
    const conversionAgent = new InboundConversionAgent();
    const recalibration = await conversionAgent.recalibrateScoreWeights().catch(err => {
      log.warn('Score recalibration failed', { err: err.message });
      return { skipped: true };
    });
    log.info('Score recalibration complete', recalibration);

    await this._logRun(runId, 'weekly_intelligence', 'success',
      {}, intelligence, inputTokens + outputTokens, costUsd, Date.now() - start);

    log.info('Weekly intelligence complete', {
      runId,
      kills: intelligence.kill_list?.length,
      scales: intelligence.scale_list?.length,
      bets: intelligence.next_week_bets?.length,
    });

    return intelligence;
  }

  /**
   * Attribution: trace a revenue event back to its sources
   */
  async attributeRevenue({ revenueEventId }) {
    const runId = uuidv4();

    const event = await queryOne(
      `SELECT re.*, l.email, l.first_touch_keyword, l.first_touch_content,
              l.first_touch_channel, l.pages_visited, l.content_consumed
       FROM revenue_events re JOIN leads l ON l.id = re.lead_id
       WHERE re.id = $1`,
      [revenueEventId]
    );

    if (!event) return null;

    // Build attribution model
    const touchpoints = await queryAll(
      `SELECT pe.event_type, pe.channel, ca.title as content_title, k.keyword
       FROM pipeline_events pe
       LEFT JOIN content_assets ca ON ca.id = pe.content_id
       LEFT JOIN keywords k ON k.id = pe.keyword_id
       WHERE pe.lead_id = $1
       ORDER BY pe.occurred_at`,
      [event.lead_id]
    );

    // U-shaped attribution: 40% first touch, 40% last touch, 20% distributed
    const attribution = this._calculateUShapedAttribution(touchpoints, event.amount_usd);

    // Update keyword and content attribution in DB — wrap in a transaction so
    // all attribution updates are atomic (no partial writes if one fails).
    await withTransaction(async (client) => {
      for (const touch of attribution) {
        if (touch.keyword_id) {
          await client.query(
            `UPDATE keywords SET revenue_attr = revenue_attr + $1 WHERE id = $2`,
            [touch.attributed_amount, touch.keyword_id]
          );
        }
        if (touch.content_id) {
          await client.query(
            `UPDATE content_assets SET revenue_attr = revenue_attr + $1 WHERE id = $2`,
            [touch.attributed_amount, touch.content_id]
          );
        }
      }

      await client.query(
        `UPDATE revenue_events SET attribution = $1 WHERE id = $2`,
        [JSON.stringify(attribution), revenueEventId]
      );
    });

    return attribution;
  }

  _calculateUShapedAttribution(touchpoints, totalAmount) {
    if (!touchpoints.length) return [];
    if (touchpoints.length === 1) return [{ ...touchpoints[0], attributed_amount: totalAmount, weight: 1.0 }];

    const first = touchpoints[0];
    const last  = touchpoints[touchpoints.length - 1];
    const middle = touchpoints.slice(1, -1);

    const firstAmount = totalAmount * 0.40;
    const lastAmount  = totalAmount * 0.40;
    const middleAmount = totalAmount * 0.20;
    const perMiddle = middle.length ? middleAmount / middle.length : 0;

    return [
      { ...first, attributed_amount: firstAmount, weight: 0.40, position: 'first' },
      ...middle.map(t => ({ ...t, attributed_amount: perMiddle, weight: 0.20 / middle.length, position: 'middle' })),
      { ...last, attributed_amount: lastAmount, weight: 0.40, position: 'last' },
    ];
  }

  async _executeAnalyticDecisions(intelligence) {
    // Apply experiment decisions
    for (const exp of intelligence.experiment_decisions || []) {
      if (exp.decision === 'declare_winner' && exp.winner) {
        await query(
          `UPDATE experiments SET status = 'winner_found', winner = $1, ended_at = NOW(), agent_decision = $2
           WHERE name = $3`,
          [exp.winner, exp.reason, exp.experiment_name]
        );
      }
      if (exp.decision === 'kill') {
        await query(
          `UPDATE experiments SET status = 'killed', ended_at = NOW(), agent_decision = $1
           WHERE name = $2`,
          [exp.reason, exp.experiment_name]
        );
      }
    }

    // Apply kills
    for (const item of intelligence.kill_list || []) {
      if (item.type === 'content') {
        await query(
          `UPDATE content_assets SET status = 'killed', killed_at = NOW(), kill_reason = $1 WHERE id = $2`,
          [item.reason, item.id]
        ).catch(() => {});
      }
    }
  }

  async _getStageConversions() {
    return queryAll(
      `SELECT
         stage,
         COUNT(*) as count,
         COUNT(*) FILTER (WHERE stage IN ('sql','opportunity','customer')) as converted
       FROM leads GROUP BY stage`
    );
  }

  async _getExperimentResults() {
    return queryAll(
      `SELECT name, status, visitors_a, visitors_b, conversions_a, conversions_b, confidence, winner
       FROM experiments WHERE status IN ('running','winner_found')
       ORDER BY started_at DESC LIMIT 10`
    );
  }

  async _getTopLeadSources() {
    return queryAll(
      `SELECT first_touch_channel, COUNT(*) as leads,
              COUNT(*) FILTER (WHERE stage = 'customer') as customers
       FROM leads GROUP BY first_touch_channel ORDER BY leads DESC`
    );
  }

  async _getCACTrend() {
    return queryAll(
      `SELECT DATE_TRUNC('month', occurred_at) as month,
              COUNT(DISTINCT lead_id) as customers,
              SUM(amount_usd) as revenue
       FROM revenue_events WHERE type = 'new_mrr'
       GROUP BY month ORDER BY month DESC LIMIT 6`
    );
  }

  /**
   * Auto-resolve running experiments using statistical significance from Python API.
   * Called at the end of weeklyIntelligenceReport() — declares winners, kills losers.
   */
  async _autoResolveExperiments() {
    const running = await queryAll(
      `SELECT id, name, hypothesis, element,
              visitors_a, visitors_b, conversions_a, conversions_b,
              revenue_a, revenue_b, started_at
       FROM experiments WHERE status = 'running'`
    );

    if (!running.length) return { resolved: 0 };

    let resolved = 0;
    for (const exp of running) {
      try {
        const result = await this._callPythonApi('/experiments/analyze', {
          experiment_id:  exp.id,
          visitors_a:     exp.visitors_a,
          visitors_b:     exp.visitors_b,
          conversions_a:  exp.conversions_a,
          conversions_b:  exp.conversions_b,
          revenue_a:      parseFloat(exp.revenue_a) || 0,
          revenue_b:      parseFloat(exp.revenue_b) || 0,
        });

        if (!result.available) continue;

        const confidence = result.confidence ?? result.frequentist?.confidence ?? 0;
        const uplift     = result.uplift ?? result.relative_uplift ?? 0;
        const winner     = result.winner ?? null; // 'a'|'b'|null

        // Declare winner: >90% confidence + >10% uplift
        if (confidence >= 90 && uplift >= 0.10 && winner) {
          await query(
            `UPDATE experiments
               SET status = 'winner_found', winner = $1, winner_uplift = $2, confidence = $3,
                   ended_at = NOW(), agent_decision = $4
             WHERE id = $5`,
            [winner, uplift, confidence,
             `Auto-declared by analytics agent: ${(uplift * 100).toFixed(1)}% uplift at ${confidence.toFixed(1)}% confidence`,
             exp.id]
          );

          log.info('Experiment winner declared', { name: exp.name, winner, confidence, uplift });

          // Queue the winning content for scaling
          const winnerContentId = winner === 'a'
            ? (await queryOne(`SELECT content_a FROM experiments WHERE id = $1`, [exp.id]))?.content_a
            : (await queryOne(`SELECT content_b FROM experiments WHERE id = $1`, [exp.id]))?.content_b;

          if (winnerContentId) {
            const { queues } = await import('../queues/index.js');
            await queues.dispatch('compounding_growth', 'scale_winner', {
              type:   'content',
              id:     winnerContentId,
              reason: `Experiment "${exp.name}" winner — ${(uplift * 100).toFixed(1)}% uplift on ${exp.element}`,
              action: 'apply_winning_pattern',
            }, { priority: 2 });
          }

          resolved++;
        }

        // Kill inconclusive experiments running > 30 days with low traffic
        const daysRunning = (Date.now() - new Date(exp.started_at).getTime()) / 86_400_000;
        if (daysRunning > 30 && (exp.visitors_a + exp.visitors_b) < 100) {
          await query(
            `UPDATE experiments SET status = 'killed', ended_at = NOW(),
               agent_decision = 'Auto-killed: insufficient traffic after 30 days'
             WHERE id = $1`,
            [exp.id]
          );
          log.info('Experiment killed (no traffic)', { name: exp.name, daysRunning: Math.round(daysRunning) });
          resolved++;
        }

        // Update confidence score on DB even if no decision yet
        if (confidence > 0) {
          await query(
            `UPDATE experiments SET confidence = $1 WHERE id = $2 AND status = 'running'`,
            [confidence, exp.id]
          );
        }
      } catch (err) {
        log.error('Experiment auto-resolve failed', { expId: exp.id, err: err.message });
      }
    }

    return { resolved, total: running.length };
  }

  /**
   * Call the Python Analytics API.
   * Always returns a result — on failure returns { error, available: false }
   * so callers don't need to handle exceptions.
   */
  async _callPythonApi(endpoint, body) {
    try {
      const resp = await fetch(`${PYTHON_API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      if (!resp.ok) {
        log.warn(`Python API ${endpoint} returned ${resp.status}`);
        return { available: false, status: resp.status };
      }

      const data = await resp.json();
      log.info(`Python API ${endpoint} OK`);
      return { available: true, ...data };
    } catch (err) {
      log.warn(`Python API ${endpoint} unavailable`, { err: err.message });
      return { available: false, error: err.message };
    }
  }

  async _logRun(id, jobType, status, input, output, tokens, costUsd, durationMs, error = null) {
    await query(
      `INSERT INTO agent_runs (id, agent, job_type, status, input, output, tokens_used, cost_usd, duration_ms, error, completed_at, triggered_by)
       VALUES ($1, 'revenue_analytics', $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'scheduler')`,
      [id, jobType, status, JSON.stringify(input), JSON.stringify(output), tokens, costUsd, durationMs, error]
    );
  }
}
