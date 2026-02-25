/**
 * Internal Event Bus
 *
 * Decouples agents — when one agent produces an output, other agents react.
 * Pattern: EventEmitter + persistent event log in Redis for replay.
 *
 * Key events:
 *   lead.captured        → score immediately, sync CRM
 *   lead.scored          → route to nurture or personal follow-up
 *   lead.stage_changed   → update CRM, trigger new nurture sequence
 *   content.published    → repurpose to social, build internal links
 *   revenue.recorded     → run attribution, update keyword/content stats
 *   experiment.winner    → scale winner, kill loser, create playbook
 *   keyword.ranking_drop → trigger SEO audit, consider rewrite
 */

import { EventEmitter } from 'events';
import { agentLogger } from '../utils/logger.js';
import { queues } from '../queues/index.js';
import { query } from '../utils/db.js';
import { hubspotClient } from '../integrations/hubspot.js';
import { emailClient } from '../integrations/sendgrid.js';
import { broadcast } from '../utils/sse-broadcaster.js';

const log = agentLogger('event_bus');

class AgentEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this._registerHandlers();
  }

  // ─────────────────────────────────────────────
  // Event publishers (called by agents)
  // ─────────────────────────────────────────────

  async emit(event, data) {
    log.debug('Event emitted', { event, data: JSON.stringify(data).substring(0, 80) });
    await this._persistEvent(event, data);
    return super.emit(event, data);
  }

  // ─────────────────────────────────────────────
  // Handler registration
  // ─────────────────────────────────────────────

  _registerHandlers() {

    // ── LEAD EVENTS ──────────────────────────────

    this.on('lead.captured', async ({ leadId, email, sourcePage, sourceKeyword }) => {
      log.info('lead.captured → scoring + CRM sync', { leadId });
      // Immediate: score the lead
      await queues.dispatch('inbound_conversion', 'process_lead', {
        leadId, leadData: { email }, sourcePage, sourceKeyword,
      }, { priority: 1 });
    });

    this.on('lead.scored', async ({ leadId, compositeScore, stage, routing }) => {
      log.info('lead.scored → nurture routing', { leadId, compositeScore, stage });

      // Broadcast to SSE dashboard clients
      broadcast('lead.scored', { leadId, compositeScore, stage, ts: new Date().toISOString() });

      // High-intent: immediate personal outreach
      if (compositeScore >= 70) {
        await queues.dispatch('inbound_conversion', 'follow_up', { leadId }, { priority: 1 });
        log.info('High-intent lead → immediate follow-up', { leadId });
      }

      // Sync to HubSpot regardless
      const lead = await query(`SELECT * FROM leads WHERE id = $1`, [leadId]);
      if (lead.rows[0]) {
        await hubspotClient.upsertContact({ lead: lead.rows[0] });
      }
    });

    this.on('lead.stage_changed', async ({ leadId, oldStage, newStage }) => {
      log.info('lead.stage_changed', { leadId, oldStage, newStage });

      // Broadcast to SSE dashboard clients
      broadcast('lead.stage_changed', { leadId, oldStage, newStage, ts: new Date().toISOString() });

      // Opportunity stage → create HubSpot deal
      if (newStage === 'opportunity') {
        const lead = await query(`SELECT * FROM leads WHERE id = $1`, [leadId]);
        if (lead.rows[0]) {
          await hubspotClient.createDeal({ lead: lead.rows[0] });
        }
      }

      // Stage escalation → trigger new nurture sequence step
      if (['mql', 'sql'].includes(newStage)) {
        await emailClient.executeNurtureStep({ leadId });
      }
    });

    // ── CONTENT EVENTS ───────────────────────────

    this.on('content.published', async ({ contentId, contentType, title, slug }) => {
      log.info('content.published → repurpose to social + internal linking', { contentId });

      // Broadcast to SSE dashboard clients
      broadcast('content.published', { contentId, contentType, title, slug, ts: new Date().toISOString() });

      // Repurpose to LinkedIn immediately for BOFU/case study content
      if (['landing_page', 'comparison', 'case_study', 'use_case'].includes(contentType)) {
        await queues.dispatch('social_distribution', 'repurpose_content', {
          contentAssetId: contentId,
          platforms: ['linkedin', 'twitter'],
        }, { priority: 3 });
      }

      // Update internal links on related pages
      await queues.dispatch('seo_demand_capture', 'technical_audit', {}, { priority: 5 });
    });

    this.on('content.conversion_spike', async ({ contentId, conversionRate }) => {
      log.info('content.conversion_spike → notify orchestrator to scale', { contentId, conversionRate });
      if (conversionRate >= 0.03) {
        await queues.dispatch('compounding_growth', 'scale_winner', {
          type: 'content', id: contentId,
          reason: `Conversion rate ${(conversionRate * 100).toFixed(1)}% exceeds 3% threshold`,
          action: 'create_keyword_cluster',
        }, { priority: 2 });
      }
    });

    // ── REVENUE EVENTS ───────────────────────────

    this.on('revenue.recorded', async ({ revenueEventId, leadId, amount }) => {
      log.info('revenue.recorded → attribution', { revenueEventId, amount });

      // Multi-touch attribution
      await queues.dispatch('revenue_analytics', 'attribute_revenue',
        { revenueEventId }, { priority: 2 });

      // Update lead stage
      await query(`UPDATE leads SET stage = 'customer', converted_at = NOW() WHERE id = $1`, [leadId]);
    });

    // ── EXPERIMENT EVENTS ────────────────────────

    this.on('experiment.winner', async ({ experimentId, winner, uplift, element }) => {
      log.info('experiment.winner → scale winner', { experimentId, winner, uplift });

      if (uplift >= 0.10) {
        await queues.dispatch('compounding_growth', 'scale_winner', {
          type: 'content', id: winner,
          reason: `Experiment winner with ${(uplift * 100).toFixed(1)}% uplift on ${element}`,
          action: 'apply_winning_pattern',
        }, { priority: 2 });
      }
    });

    // ── SEO EVENTS ───────────────────────────────

    this.on('keyword.ranking_drop', async ({ keyword, dropPositions, currentPosition }) => {
      log.warn('keyword.ranking_drop → SEO audit', { keyword, dropPositions, currentPosition });

      if (dropPositions >= 5) {
        await queues.dispatch('seo_demand_capture', 'technical_audit', {
          urgentKeyword: keyword,
        }, { priority: 2 });
      }
    });

    this.on('keyword.page1_achieved', async ({ keyword, position }) => {
      log.info('keyword.page1_achieved → extract pattern + scale', { keyword, position });
      await queues.dispatch('compounding_growth', 'extract_patterns', {}, { priority: 4 });
    });
  }

  async _persistEvent(event, data) {
    try {
      await query(
        `INSERT INTO agent_runs (agent, job_type, status, input, triggered_by)
         VALUES ('event_bus', $1, 'success', $2, 'event')`,
        [event, JSON.stringify(data)]
      );
    } catch { /* non-critical */ }
  }
}

export const eventBus = new AgentEventBus();
