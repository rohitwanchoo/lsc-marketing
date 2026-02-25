/**
 * Agent 7: Compounding Growth Agent
 *
 * Purpose: Make growth irreversible
 * Method: Identify patterns → Create playbooks → Systematically expand
 * Output: Scalable templates that multiply winning strategies
 */

import { callAI, parseJSON } from '../utils/ai.js';
import { queryAll, queryOne, query } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { v4 as uuidv4 } from 'uuid';

const log = agentLogger('compounding_growth');

const SYSTEM_PROMPT = `You are the Compounding Growth Agent for ${config.business.companyName}.

Your job: Find what's working, understand WHY it works, and systematically replicate it at scale.

You operate on patterns, not individual campaigns.

COMPOUNDING LOOPS you look for:
1. Content patterns: What type/format/topic drives leads reliably?
2. Keyword clusters: Which keyword families convert? Expand them.
3. Nurture patterns: Which email sequences convert? Clone for new segments.
4. Social patterns: Which post types drive DMs? Scale them.
5. Page patterns: Which page structures convert? Templatize.

SCALE DECISIONS:
- Winner identified (>90% confidence, >10% uplift) → build template → apply to 10x more keywords/assets
- Pattern found in 3+ data points → create playbook → automate
- Industry/use-case wins → expand to adjacent industries/use-cases

Output structured JSON playbooks and expansion plans.`;

export class CompoundingGrowthAgent {
  constructor() {
    this.name = 'compounding_growth';
  }

  /**
   * Analyze all winning content/keywords and extract reusable patterns
   */
  async extractGrowthPatterns() {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Extracting growth patterns', { runId });

    const [
      topContent,
      topKeywords,
      topPosts,
      topNurture,
      existingPlaybooks,
    ] = await Promise.all([
      queryAll(
        `SELECT title, content_type, meta_title, meta_description, seo_score,
                leads_generated, revenue_attr, conversion_rate
         FROM content_assets WHERE status = 'published' AND leads_generated > 0
         ORDER BY revenue_attr DESC LIMIT 15`
      ),
      queryAll(
        `SELECT keyword, intent, search_volume, serp_position, leads_attr, revenue_attr
         FROM keywords WHERE leads_attr > 0 ORDER BY revenue_attr DESC LIMIT 20`
      ),
      queryAll(
        `SELECT platform, post_body, impressions, engagements, leads_generated
         FROM social_posts WHERE leads_generated > 0 ORDER BY leads_generated DESC LIMIT 10`
      ),
      queryAll(
        `SELECT name, total_enrolled, total_converted, conversion_rate
         FROM nurture_sequences WHERE total_enrolled > 0 ORDER BY conversion_rate DESC LIMIT 5`
      ),
      queryAll(`SELECT name, category, description FROM playbooks WHERE is_active = true LIMIT 20`),
    ]);

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'pattern_extraction',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analyze all winning assets and extract reusable growth patterns.

Top content: ${JSON.stringify(topContent)}
Top keywords: ${JSON.stringify(topKeywords)}
Top social posts: ${JSON.stringify(topPosts)}
Top nurture sequences: ${JSON.stringify(topNurture)}
Existing playbooks: ${JSON.stringify(existingPlaybooks)}

Find patterns that explain WHY these work. Then create systematic playbooks.

Return JSON:
{
  "patterns_found": [
    {
      "pattern_name": "...",
      "category": "content|keyword|social|nurture|page",
      "description": "...",
      "evidence": ["data point 1", "data point 2"],
      "replication_confidence": number (0-1),
      "scale_potential": "low|medium|high"
    }
  ],
  "new_playbooks": [
    {
      "name": "...",
      "category": "...",
      "description": "...",
      "trigger_conditions": {...},
      "action_steps": [
        { "step": 1, "action": "...", "agent": "...", "parameters": {} }
      ],
      "expected_roi": "..."
    }
  ],
  "expansion_plan": {
    "keyword_clusters_to_expand": [
      { "seed_keyword": "...", "expand_to": ["..."], "rationale": "..." }
    ],
    "content_types_to_scale": [...],
    "new_use_cases_to_target": [...],
    "new_industries_to_enter": [...]
  }
}`,
      }],
      maxTokens: 5000,
    });

    const patterns = parseJSON(content);

    // Save new playbooks to database — batch INSERT to avoid N+1 queries.
    const newPlaybooks = (patterns.new_playbooks || []).filter(
      pb => pb.name && pb.category
    );
    if (newPlaybooks.length > 0) {
      // Build parameterised VALUES list: ($1,$2,$3,$4,$5,'compounding_growth'), ($6,$7,…)
      const values = [];
      const placeholders = newPlaybooks.map((pb, i) => {
        const base = i * 5;
        values.push(
          pb.name,
          pb.category,
          pb.description || '',
          JSON.stringify(pb.trigger_conditions || {}),
          JSON.stringify(pb.action_steps || [])
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, 'compounding_growth')`;
      });

      await query(
        `INSERT INTO playbooks (name, category, description, trigger_conditions, action_steps, created_by)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT DO NOTHING`,
        values
      );
    }

    await this._logRun(runId, 'pattern_extraction', 'success',
      {}, patterns, inputTokens + outputTokens, costUsd, Date.now() - start);

    log.info('Pattern extraction complete', {
      runId,
      patternsFound: patterns.patterns_found?.length,
      playbooksCreated: patterns.new_playbooks?.length,
    });

    return patterns;
  }

  /**
   * Scale a proven winner — apply its pattern to new keywords/content
   */
  async scaleWinner({ type, id, action, reason }) {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Scaling winner', { runId, type, id, action });

    let winnerData = null;

    if (type === 'content') {
      winnerData = await queryOne(
        `SELECT * FROM content_assets WHERE id = $1`, [id]
      );
    } else if (type === 'keyword') {
      winnerData = await queryOne(
        `SELECT * FROM keywords WHERE id = $1`, [id]
      );
    }

    if (!winnerData) {
      log.warn('Winner not found', { type, id });
      return null;
    }

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'scale_winner',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `This ${type} is a proven winner. Create a scaling plan.

Winner data: ${JSON.stringify(winnerData)}
Reason it's winning: ${reason}
Requested action: ${action}

Create a specific scaling plan:
1. What template/pattern to extract from this winner
2. 5-10 new variations to create (new keywords/angles/audiences)
3. Which agent should execute each variation
4. Success metrics for each variation

Return JSON:
{
  "winner_template": {
    "structure": "...",
    "key_elements": [...],
    "conversion_triggers": [...]
  },
  "scaling_jobs": [
    {
      "variation": "...",
      "agent": "seo_demand_capture|authority_content|social_distribution",
      "job_type": "...",
      "payload": {},
      "expected_outcome": "..."
    }
  ],
  "success_metric": "...",
  "timeline": "..."
}`,
      }],
      maxTokens: 3000,
    });

    const scalePlan = parseJSON(content);

    // ── Dispatch scaling jobs generated by the AI ──────────────────────────
    // The AI returns a list of agent jobs to execute — we actually run them.
    const { queues } = await import('../queues/index.js');
    const ALLOWED_AGENTS = new Set([
      'seo_demand_capture', 'authority_content', 'social_distribution',
      'inbound_conversion', 'revenue_analytics', 'compounding_growth',
    ]);
    const ALLOWED_JOBS = new Set([
      'keyword_discovery', 'generate_page', 'bulk_generate_pages',
      'case_study', 'linkedin_strategy', 'nurture_sequence',
      'repurpose_content', 'ab_variants', 'extract_patterns',
    ]);

    let dispatched = 0;
    for (const job of scalePlan.scaling_jobs || []) {
      const agentName = job.agent;
      const jobType   = job.job_type;

      if (!ALLOWED_AGENTS.has(agentName) || !ALLOWED_JOBS.has(jobType)) {
        log.warn('Scaling job skipped — not in allowlist', { agentName, jobType });
        continue;
      }

      await queues.dispatch(agentName, jobType, job.payload || {}, { priority: 4 }).catch(err => {
        log.warn('Scaling job dispatch failed', { agentName, jobType, err: err.message });
      });
      dispatched++;
    }

    log.info('Scaling jobs dispatched', { runId, dispatched, total: scalePlan.scaling_jobs?.length });

    // Update playbook usage
    await query(
      `UPDATE playbooks SET times_applied = times_applied + 1, updated_at = NOW()
       WHERE name ILIKE $1`,
      [`%${type}%`]
    );

    await this._logRun(runId, 'scale_winner', 'success',
      { type, id }, { ...scalePlan, dispatched }, inputTokens + outputTokens, costUsd, Date.now() - start);

    return scalePlan;
  }

  /**
   * Monthly: Generate the 90-day organic revenue roadmap
   */
  async generate90DayRoadmap() {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Generating 90-day roadmap', { runId });

    const [kpis, playbooks, goals] = await Promise.all([
      queryOne('SELECT * FROM v_organic_kpis'),
      queryAll('SELECT * FROM playbooks WHERE is_active = true ORDER BY avg_roi DESC NULLS LAST LIMIT 10'),
      queryOne(`SELECT * FROM growth_goals WHERE status = 'active' ORDER BY period_start DESC LIMIT 1`),
    ]);

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: '90_day_roadmap',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Generate a precise 90-day organic revenue roadmap.

Current KPIs: ${JSON.stringify(kpis)}
Proven playbooks: ${JSON.stringify(playbooks)}
Current goals: ${JSON.stringify(goals)}
Target MRR: $${config.business.targetMrrUsd}

Be specific. No fluff. Every action must have a measurable outcome.

Return JSON:
{
  "roadmap": {
    "month_1": {
      "theme": "...",
      "goal": "...",
      "weeks": [
        {
          "week": 1,
          "focus": "...",
          "seo_actions": [...],
          "content_actions": [...],
          "conversion_actions": [...],
          "target_leads": number,
          "target_revenue": number
        }
      ]
    },
    "month_2": { ... },
    "month_3": { ... }
  },
  "paid_unlock_milestone": {
    "trigger": "...",
    "expected_date": "...",
    "required_metrics": {
      "organic_leads_per_month": number,
      "conversion_rate_minimum": number,
      "cac_maximum_usd": number
    }
  },
  "compounding_effect": {
    "month_1_mrr_projection": number,
    "month_2_mrr_projection": number,
    "month_3_mrr_projection": number
  }
}`,
      }],
      maxTokens: 6000,
    });

    const roadmap = parseJSON(content);

    await this._logRun(runId, '90_day_roadmap', 'success',
      {}, roadmap, inputTokens + outputTokens, costUsd, Date.now() - start);

    log.info('90-day roadmap generated', {
      m1: roadmap.compounding_effect?.month_1_mrr_projection,
      m3: roadmap.compounding_effect?.month_3_mrr_projection,
    });

    return roadmap;
  }

  async _logRun(id, jobType, status, input, output, tokens, costUsd, durationMs, error = null) {
    await query(
      `INSERT INTO agent_runs (id, agent, job_type, status, input, output, tokens_used, cost_usd, duration_ms, error, completed_at, triggered_by)
       VALUES ($1, 'compounding_growth', $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'scheduler')`,
      [id, jobType, status, JSON.stringify(input), JSON.stringify(output), tokens, costUsd, durationMs, error]
    );
  }
}
