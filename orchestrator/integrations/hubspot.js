/**
 * HubSpot CRM Integration
 *
 * Bidirectional sync: LSC leads ↔ HubSpot contacts
 * Handles: contact creation, deal creation, stage updates, activity logging
 */

import { config } from '../config.js';
import { query, queryAll, queryOne } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';
import { eventBus } from '../events/event-bus.js';

const log = agentLogger('hubspot');

const HS_API = 'https://api.hubapi.com';

// Stage mapping: LSC → HubSpot lifecycle stages
const STAGE_MAP = {
  visitor:     'subscriber',
  prospect:    'lead',
  mql:         'marketingqualifiedlead',
  sql:         'salesqualifiedlead',
  opportunity: 'opportunity',
  customer:    'customer',
  churned:     'other',
};

// Reverse mapping: HubSpot lifecycle → LSC stage
const REVERSE_STAGE_MAP = {
  subscriber:               'visitor',
  lead:                     'prospect',
  marketingqualifiedlead:   'mql',
  salesqualifiedlead:       'sql',
  opportunity:              'opportunity',
  customer:                 'customer',
  other:                    'churned',
};

// HubSpot deal stage → LSC lead stage
const DEAL_STAGE_MAP = {
  closedwon:  'customer',
  closedlost: 'churned',
};

class HubSpotClient {
  constructor() {
    this.apiKey       = config.integrations.hubspot.apiKey;
    this.isConfigured = Boolean(this.apiKey);
  }

  get headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Upsert a lead into HubSpot contacts
   */
  async upsertContact({ lead }) {
    if (!this.isConfigured) {
      log.debug('HubSpot not configured — skipping CRM sync', { email: lead.email });
      return { status: 'skipped' };
    }

    const properties = {
      email:          lead.email,
      firstname:      lead.full_name?.split(' ')[0] || '',
      lastname:       lead.full_name?.split(' ').slice(1).join(' ') || '',
      company:        lead.company      || '',
      jobtitle:       lead.job_title    || '',
      phone:          lead.phone        || '',
      lifecyclestage: STAGE_MAP[lead.stage] || 'lead',
      // Custom LSC properties
      lsc_intent_score:     String(lead.intent_score    || 0),
      lsc_composite_score:  String(lead.composite_score || 0),
      lsc_source_keyword:   lead.source_keyword || '',
      lsc_source_channel:   lead.first_touch_channel || '',
      lsc_nurture_step:     String(lead.nurture_step || 0),
    };

    try {
      // Try to update existing contact first
      const res = await fetch(`${HS_API}/crm/v3/objects/contacts`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ properties }),
      });

      if (res.status === 409) {
        // Contact exists — update it
        const existing = await this._getContactByEmail(lead.email);
        if (existing) {
          await fetch(`${HS_API}/crm/v3/objects/contacts/${existing.id}`, {
            method: 'PATCH',
            headers: this.headers,
            body: JSON.stringify({ properties }),
          });
          await query(
            `UPDATE leads SET crm_id = $1, crm_provider = 'hubspot', crm_synced_at = NOW() WHERE id = $2`,
            [existing.id, lead.id]
          );
          return { status: 'updated', crmId: existing.id };
        }
      }

      if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);

      const data = await res.json();
      await query(
        `UPDATE leads SET crm_id = $1, crm_provider = 'hubspot', crm_synced_at = NOW() WHERE id = $2`,
        [data.id, lead.id]
      );

      log.info('HubSpot contact created', { email: lead.email, crmId: data.id });
      return { status: 'created', crmId: data.id };

    } catch (err) {
      log.error('HubSpot upsert failed', { email: lead.email, err: err.message });
      return { status: 'failed', error: err.message };
    }
  }

  /**
   * Create a deal when a lead becomes an opportunity
   */
  async createDeal({ lead, dealName, amount, stage = 'appointmentscheduled' }) {
    if (!this.isConfigured) return { status: 'skipped' };
    if (!lead.crm_id) await this.upsertContact({ lead });

    try {
      const dealRes = await fetch(`${HS_API}/crm/v3/objects/deals`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          properties: {
            dealname:  dealName || `${lead.company || lead.email} — Organic Inbound`,
            amount:    String(amount || config.business.avgDealSizeUsd),
            dealstage: stage,
            pipeline:  'default',
          },
        }),
      });

      if (!dealRes.ok) throw new Error(`${dealRes.status}`);
      const deal = await dealRes.json();

      // Associate deal with contact
      if (lead.crm_id) {
        await fetch(`${HS_API}/crm/v3/objects/deals/${deal.id}/associations/contacts/${lead.crm_id}/deal_to_contact`, {
          method: 'PUT',
          headers: this.headers,
        });
      }

      log.info('HubSpot deal created', { dealId: deal.id, email: lead.email });
      return { status: 'created', dealId: deal.id };
    } catch (err) {
      log.error('HubSpot deal creation failed', { err: err.message });
      return { status: 'failed', error: err.message };
    }
  }

  /**
   * Bulk sync all out-of-sync leads → HubSpot
   */
  async bulkSync() {
    const leads = await queryAll(
      `SELECT * FROM leads WHERE crm_synced_at IS NULL OR crm_synced_at < NOW() - INTERVAL '24 hours' LIMIT 100`
    );

    let synced = 0, failed = 0;
    for (const lead of leads) {
      const result = await this.upsertContact({ lead });
      result.status !== 'failed' ? synced++ : failed++;
      // Rate limit: 10 req/sec
      await new Promise(r => setTimeout(r, 100));
    }

    log.info('HubSpot bulk sync complete', { total: leads.length, synced, failed });
    return { synced, failed };
  }

  /**
   * Handle inbound HubSpot webhook events (bi-directional sync)
   *
   * Supported event types:
   *   contact.propertyChange (lifecyclestage) → update LSC lead.stage
   *   deal.propertyChange    (dealstage)      → closedwon→customer, closedlost→churned
   *
   * @param {Array} events  - Array of HubSpot webhook event objects
   */
  async handleWebhook(events) {
    if (!Array.isArray(events) || !events.length) return { processed: 0 };

    let processed = 0;
    for (const event of events) {
      try {
        const { subscriptionType, objectId, propertyName, propertyValue } = event;

        // ── Contact lifecycle stage change ────────────
        if (subscriptionType === 'contact.propertyChange' && propertyName === 'lifecyclestage') {
          const lscStage = REVERSE_STAGE_MAP[propertyValue];
          if (!lscStage) continue;

          // Find LSC lead by CRM ID
          const lead = await queryOne(
            `SELECT id, stage FROM leads WHERE crm_id = $1 AND crm_provider = 'hubspot'`,
            [String(objectId)]
          );
          if (!lead) continue;
          if (lead.stage === lscStage) continue; // no change

          await query(
            `UPDATE leads SET stage = $1::lead_stage, updated_at = NOW() WHERE id = $2`,
            [lscStage, lead.id]
          );
          await query(
            `INSERT INTO pipeline_events (lead_id, event_type, channel, metadata)
             VALUES ($1, 'stage_changed', 'direct', $2)`,
            [lead.id, JSON.stringify({ source: 'hubspot_webhook', from: lead.stage, to: lscStage, hubspot_object_id: objectId })]
          );

          await eventBus.emit('lead.stage_changed', {
            leadId:   lead.id,
            oldStage: lead.stage,
            newStage: lscStage,
          });

          log.info('HubSpot→LSC stage sync', { leadId: lead.id, from: lead.stage, to: lscStage });
          processed++;
        }

        // ── Deal stage change ─────────────────────────
        if (subscriptionType === 'deal.propertyChange' && propertyName === 'dealstage') {
          const lscStage = DEAL_STAGE_MAP[propertyValue];
          if (!lscStage) continue;

          // Look up associated contact via HubSpot Associations API
          const assocRes = await fetch(
            `${HS_API}/crm/v3/objects/deals/${objectId}/associations/contacts`,
            { headers: this.headers }
          );
          if (!assocRes.ok) continue;

          const assocData = await assocRes.json();
          const contactId = assocData.results?.[0]?.id;
          if (!contactId) continue;

          const lead = await queryOne(
            `SELECT id, stage FROM leads WHERE crm_id = $1 AND crm_provider = 'hubspot'`,
            [String(contactId)]
          );
          if (!lead || lead.stage === lscStage) continue;

          const updateFields = lscStage === 'customer'
            ? `stage = 'customer'::lead_stage, converted_at = NOW(), updated_at = NOW()`
            : `stage = 'churned'::lead_stage, churned_at = NOW(), updated_at = NOW()`;

          await query(`UPDATE leads SET ${updateFields} WHERE id = $1`, [lead.id]);
          await query(
            `INSERT INTO pipeline_events (lead_id, event_type, channel, metadata)
             VALUES ($1, $2, 'direct', $3)`,
            [lead.id,
             lscStage === 'customer' ? 'deal_won' : 'deal_lost',
             JSON.stringify({ source: 'hubspot_webhook', deal_id: objectId, stage: propertyValue })]
          );

          await eventBus.emit('lead.stage_changed', {
            leadId:   lead.id,
            oldStage: lead.stage,
            newStage: lscStage,
          });

          log.info('HubSpot deal→LSC stage sync', {
            leadId: lead.id, dealStage: propertyValue, lscStage,
          });
          processed++;
        }
      } catch (err) {
        log.error('HubSpot webhook event error', { event, err: err.message });
      }
    }

    return { processed };
  }

  /**
   * Enrich a lead by fetching their HubSpot contact record
   */
  async enrichContact(email) {
    if (!this.isConfigured) {
      // Mock enrichment with placeholder data
      return { company: null, job_title: null, phone: null, source: 'mock' };
    }
    try {
      const contact = await this._getContactByEmail(email);
      if (!contact) return null;
      const p = contact.properties || {};
      return {
        company:   p.company,
        job_title: p.jobtitle,
        phone:     p.phone,
        linkedin:  p.hs_linkedin_handle,
        source:    'hubspot',
      };
    } catch (err) {
      log.error('enrichContact failed', { email, err: err.message });
      return null;
    }
  }

  async _getContactByEmail(email) {
    const res = await fetch(
      `${HS_API}/crm/v3/objects/contacts/search`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
          limit: 1,
        }),
      }
    );
    const data = await res.json();
    return data.results?.[0] || null;
  }
}

export const hubspotClient = new HubSpotClient();
