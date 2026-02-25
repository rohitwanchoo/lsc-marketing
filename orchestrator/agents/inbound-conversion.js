/**
 * Agent 5: Inbound Conversion Agent
 *
 * Purpose: Convert organic traffic into qualified pipeline
 * Rule: No lead is allowed to "die" without follow-up
 * Output: Leads booked → pipeline created → revenue attributed
 */

import { callAI, parseJSON } from '../utils/ai.js';
import { queryAll, queryOne, query } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { slackClient } from '../integrations/slack.js';
import { twilioClient } from '../integrations/twilio.js';
import { linkedinClient } from '../integrations/linkedin.js';
import { v4 as uuidv4 } from 'uuid';

// Default weights — overridden by active scoring_models row
const DEFAULT_WEIGHTS = {
  job_title:    25,
  company_size: 20,
  page_intent:  20,
  engagement:   20,
  behavior:     15,
};

const log = agentLogger('inbound_conversion');

const SYSTEM_PROMPT = `You are the Inbound Conversion Agent for ${config.business.companyName}.

Your job is to turn every organic visitor into a lead, and every lead into a booked call or revenue event.

ICP: ${config.business.icp}
Value proposition: ${config.business.valueProposition}

CONVERSION PRINCIPLES:
1. Reduce friction at every step — fewer fields, clearer value
2. Lead magnet must solve a SPECIFIC pain, not be generic
3. Follow-up starts within 5 minutes of form submit
4. Personalize based on the page they came from (keyword intent)
5. Never send a "just checking in" email — always add value

SCORING MODEL (0-100):
- Job title match: 0-25
- Company size match: 0-20
- Page intent match: 0-20
- Engagement depth: 0-20
- Behavioral signals: 0-15

Leads above 60: SQL → immediate personal follow-up
Leads 40-59: MQL → automated nurture
Leads below 40: nurture lightly, track for intent spikes

Output structured JSON only.`;

export class InboundConversionAgent {
  constructor() {
    this.name = 'inbound_conversion';
  }

  /**
   * Score and route a newly captured lead
   */
  async processNewLead({ leadId, leadData, sourcePage, sourceKeyword }) {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Processing new lead', { runId, leadId, email: leadData.email });

    // Fetch calibrated weights (falls back to defaults when table doesn't exist yet)
    const weights = await this._getActiveWeights();

    const dynamicSystem = `${SYSTEM_PROMPT}

CURRENT CALIBRATED SCORING WEIGHTS (sum = 100, updated weekly from closed deal data):
- Job title ICP match:  0-${weights.job_title}
- Company size match:   0-${weights.company_size}
- Page intent match:    0-${weights.page_intent}
- Engagement depth:     0-${weights.engagement}
- Behavioral signals:   0-${weights.behavior}`;

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'lead_scoring',
      system: dynamicSystem,
      messages: [{
        role: 'user',
        content: `Score and route this new inbound lead.

Lead data: ${JSON.stringify(leadData)}
Source page: ${sourcePage}
Source keyword: ${sourceKeyword}
ICP definition: ${config.business.icp}

Calculate scores and determine routing:

Return JSON:
{
  "intent_score": number (0-100),
  "fit_score": number (0-100),
  "engagement_score": number (0-100),
  "composite_score": number (0-100),
  "stage": "mql|sql|prospect",
  "routing": "immediate_personal|automated_nurture|light_nurture",
  "nurture_sequence": "sequence_name",
  "immediate_action": {
    "type": "send_email|send_dm|book_call|assign_to_sdr",
    "message": "...",
    "subject_line": "..."
  },
  "personalization_signals": ["..."],
  "estimated_ltv": number,
  "priority": 1-10
}`,
      }],
      maxTokens: 2000,
    });

    const scoring = parseJSON(content);

    // Update lead record
    await query(
      `UPDATE leads SET
         intent_score = $1,
         fit_score = $2,
         engagement_score = $3,
         composite_score = $4,
         stage = $5,
         next_follow_up_at = NOW() + INTERVAL '5 minutes'
       WHERE id = $6`,
      [
        scoring.intent_score,
        scoring.fit_score,
        scoring.engagement_score,
        scoring.composite_score,
        scoring.stage,
        leadId,
      ]
    );

    // Log pipeline event
    await query(
      `INSERT INTO pipeline_events (lead_id, event_type, channel, metadata)
       VALUES ($1, 'lead_scored', $2, $3)`,
      [leadId, 'organic_search', JSON.stringify(scoring)]
    );

    // Multi-channel hot SQL alerts (score > 80) — all fire async, non-blocking
    if (scoring.composite_score > 80) {
      const fullLead = await queryOne(`SELECT * FROM leads WHERE id = $1`, [leadId]);
      const alertLead = fullLead || { ...leadData, id: leadId };

      // 1. Slack — rich block message to sales channel
      slackClient.sendSQLAlert({ lead: alertLead, scoring })
        .catch(err => log.error('Slack SQL alert failed', { err: err.message }));

      // 2. SMS — text alert to sales rep's phone
      twilioClient.sendSQLAlert({ lead: alertLead, scoring })
        .catch(err => log.error('Twilio SQL alert failed', { err: err.message }));

      // 3. LinkedIn DM — if we have the lead's LinkedIn URL
      if (alertLead.linkedin_url && scoring.immediate_action?.message) {
        const recipientUrn = linkedinClient.extractUrnFromUrl(alertLead.linkedin_url);
        if (recipientUrn) {
          linkedinClient.sendDM({ recipientUrn, message: scoring.immediate_action.message })
            .catch(err => log.error('LinkedIn DM failed', { err: err.message }));
        }
      }
    }

    await this._logRun(runId, 'lead_scoring', 'success',
      { leadId }, scoring, inputTokens + outputTokens, costUsd, Date.now() - start);

    log.info('Lead scored', {
      runId,
      leadId,
      composite: scoring.composite_score,
      stage: scoring.stage,
      routing: scoring.routing,
    });

    return scoring;
  }

  /**
   * Generate personalized follow-up for a lead based on their behavior
   */
  async generateFollowUp({ leadId }) {
    const runId = uuidv4();
    const start = Date.now();

    const lead = await queryOne(
      `SELECT l.*, array_agg(pe.event_type) as events
       FROM leads l
       LEFT JOIN pipeline_events pe ON pe.lead_id = l.id
       WHERE l.id = $1
       GROUP BY l.id`,
      [leadId]
    );

    if (!lead || lead.do_not_contact) return null;
    log.info('Generating follow-up', { runId, leadId, stage: lead.stage });

    // Get the content they consumed
    const consumedContent = lead.content_consumed?.length
      ? await queryAll(
          `SELECT title, content_type FROM content_assets WHERE id = ANY($1)`,
          [lead.content_consumed]
        )
      : [];

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'follow_up_generation',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Write a personalized follow-up for this lead.

Lead profile:
- Name: ${lead.full_name || 'Unknown'}
- Company: ${lead.company || 'Unknown'}
- Job title: ${lead.job_title || 'Unknown'}
- Stage: ${lead.stage}
- Score: ${lead.composite_score}/100
- Email opens: ${lead.email_opens}
- Content consumed: ${JSON.stringify(consumedContent)}
- Events: ${JSON.stringify(lead.events)}
- Nurture step: ${lead.nurture_step}

Rules:
- DO NOT say "just checking in"
- Reference something specific they read or did
- Add genuine value — a specific insight, resource, or question
- One clear ask only (book a call / reply with a pain point)
- Max 150 words

Return JSON:
{
  "channel": "email|whatsapp",
  "subject": "...",
  "body": "...",
  "cta": "...",
  "send_at": "ISO timestamp"
}`,
      }],
      maxTokens: 1000,
    });

    const followUp = parseJSON(content);

    // Update nurture step
    await query(
      `UPDATE leads SET nurture_step = nurture_step + 1, next_follow_up_at = $1 WHERE id = $2`,
      [followUp.send_at || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), leadId]
    );

    await this._logRun(runId, 'follow_up_generation', 'success',
      { leadId }, followUp, inputTokens + outputTokens, costUsd, Date.now() - start);

    return followUp;
  }

  /**
   * Optimize a landing page's conversion based on analytics data
   */
  async optimizeLandingPage({ pageId, analyticsData }) {
    const runId = uuidv4();
    const start = Date.now();

    const page = await queryOne(
      `SELECT title, body_html, conversion_rate, leads_generated, pageviews FROM content_assets WHERE id = $1`,
      [pageId]
    );

    if (!page) return null;
    log.info('Optimizing landing page', { runId, pageId, conversionRate: page.conversion_rate });

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'page_optimization',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analyze and optimize this landing page for conversion.

Page: ${page.title}
Current conversion rate: ${(page.conversion_rate * 100).toFixed(2)}%
Pageviews: ${page.pageviews}, Leads: ${page.leads_generated}
Analytics data: ${JSON.stringify(analyticsData)}

Identify the top 5 conversion killers and propose specific fixes.

Return JSON:
{
  "current_conversion_rate": number,
  "target_conversion_rate": number,
  "conversion_killers": [
    {
      "element": "...",
      "issue": "...",
      "fix": "...",
      "expected_uplift": "X%"
    }
  ],
  "new_headline": "...",
  "new_cta": "...",
  "new_lead_magnet": "...",
  "ab_test_to_run": {
    "variable": "headline|cta|form_length|social_proof",
    "variant_a": "...",
    "variant_b": "..."
  }
}`,
      }],
      maxTokens: 2000,
    });

    const optimization = parseJSON(content);

    // Create experiment
    if (optimization.ab_test_to_run) {
      await query(
        `INSERT INTO experiments (name, hypothesis, element, status)
         VALUES ($1, $2, $3, 'running')`,
        [
          `CRO: ${page.title}`,
          `Testing ${optimization.ab_test_to_run.variable} to increase conversion from ${(page.conversion_rate * 100).toFixed(1)}%`,
          optimization.ab_test_to_run.variable,
        ]
      );
    }

    await this._logRun(runId, 'page_optimization', 'success',
      { pageId }, optimization, inputTokens + outputTokens, costUsd, Date.now() - start);

    return optimization;
  }

  /**
   * Run daily: find all leads that need follow-up and process them
   */
  async processFollowUpQueue() {
    const leads = await queryAll(
      `SELECT id FROM leads
       WHERE next_follow_up_at <= NOW()
         AND stage NOT IN ('customer', 'churned')
         AND do_not_contact = FALSE
         AND nurture_step < 7
       ORDER BY composite_score DESC
       LIMIT 50`
    );

    log.info(`Processing follow-up queue: ${leads.length} leads`);

    const results = [];
    for (const lead of leads) {
      try {
        const followUp = await this.generateFollowUp({ leadId: lead.id });
        results.push({ leadId: lead.id, status: 'queued', followUp });
      } catch (err) {
        log.error('Follow-up generation failed', { leadId: lead.id, err: err.message });
        results.push({ leadId: lead.id, status: 'failed' });
      }
    }

    return results;
  }

  /**
   * Fetch the currently active calibrated scoring weights.
   * Falls back to DEFAULT_WEIGHTS when the scoring_models table doesn't exist yet
   * or no active model is present.
   */
  async _getActiveWeights() {
    try {
      const model = await queryOne(
        `SELECT weights FROM scoring_models WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`
      );
      return model?.weights ?? DEFAULT_WEIGHTS;
    } catch {
      return DEFAULT_WEIGHTS; // table may not exist yet in dev
    }
  }

  /**
   * Recalibrate lead scoring weights using Python analytics API.
   * Compares won leads (converted to customer) vs lost leads (churned/stalled).
   * Stores new weights in scoring_models and marks them active.
   *
   * Called weekly by revenue-analytics agent after intelligence report.
   */
  async recalibrateScoreWeights() {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Recalibrating lead scoring weights', { runId });

    // Sample won leads (converted to customer in last 90 days)
    const wonLeads = await queryAll(
      `SELECT intent_score, fit_score, engagement_score, composite_score,
              job_title, company, first_touch_channel
       FROM leads
       WHERE stage = 'customer'
         AND converted_at >= NOW() - INTERVAL '90 days'
       ORDER BY converted_at DESC
       LIMIT 200`
    );

    // Sample lost/stalled leads
    const lostLeads = await queryAll(
      `SELECT intent_score, fit_score, engagement_score, composite_score,
              job_title, company, first_touch_channel
       FROM leads
       WHERE stage IN ('churned', 'prospect')
         AND created_at <= NOW() - INTERVAL '30 days'
         AND composite_score < 50
       ORDER BY created_at DESC
       LIMIT 200`
    );

    if (wonLeads.length < 5) {
      log.info('Insufficient won leads for recalibration — skipping', { wonLeads: wonLeads.length });
      return { skipped: true, reason: 'insufficient_data', wonLeads: wonLeads.length };
    }

    // Call Python scoring enhancement API
    let pythonResult = null;
    try {
      const res = await fetch(`${config.pythonApiUrl}/scoring/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          won_leads:       wonLeads,
          lost_leads:      lostLeads,
          current_weights: await this._getActiveWeights(),
          dimensions:      ['job_title', 'company_size', 'page_intent', 'engagement', 'behavior'],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) pythonResult = await res.json();
    } catch (err) {
      log.warn('Python scoring API unavailable', { err: err.message });
    }

    // Build new weights — use Python result if available, otherwise nudge current weights
    const currentWeights = await this._getActiveWeights();
    const newWeights = pythonResult?.recommended_weights ?? currentWeights;

    // Normalise weights to sum exactly to 100
    const total = Object.values(newWeights).reduce((a, b) => a + b, 0);
    const normalised = Object.fromEntries(
      Object.entries(newWeights).map(([k, v]) => [k, Math.round((v / total) * 100)])
    );

    const now = new Date();
    const periodStart = new Date(now); periodStart.setDate(now.getDate() - 90);

    // Deactivate previous model
    await query(`UPDATE scoring_models SET is_active = FALSE WHERE is_active = TRUE`).catch(() => {});

    // Insert new active model
    await query(
      `INSERT INTO scoring_models
         (period_start, period_end, weights, win_rate, sample_size, won_sample, lost_sample, raw_response, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
      [
        periodStart.toISOString().split('T')[0],
        now.toISOString().split('T')[0],
        JSON.stringify(normalised),
        wonLeads.length / (wonLeads.length + lostLeads.length),
        wonLeads.length + lostLeads.length,
        wonLeads.length,
        lostLeads.length,
        JSON.stringify(pythonResult || { source: 'fallback' }),
      ]
    ).catch(err => log.warn('scoring_models insert failed (run migration 002)', { err: err.message }));

    await this._logRun(runId, 'recalibrate_scoring', 'success',
      { wonLeads: wonLeads.length, lostLeads: lostLeads.length },
      { new_weights: normalised, python_used: Boolean(pythonResult) },
      0, 0, Date.now() - start);

    log.info('Scoring weights recalibrated', { runId, weights: normalised });
    return { weights: normalised, wonLeads: wonLeads.length, lostLeads: lostLeads.length };
  }

  async _logRun(id, jobType, status, input, output, tokens, costUsd, durationMs, error = null) {
    await query(
      `INSERT INTO agent_runs (id, agent, job_type, status, input, output, tokens_used, cost_usd, duration_ms, error, completed_at, triggered_by)
       VALUES ($1, 'inbound_conversion', $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'scheduler')`,
      [id, jobType, status, JSON.stringify(input), JSON.stringify(output), tokens, costUsd, durationMs, error]
    );
  }
}
