/**
 * HubSpot CRM Integration
 *
 * Bidirectional sync: LSC leads ↔ HubSpot contacts + deals
 *
 * Methods:
 *   upsertContact(lead)                        → creates or updates HubSpot contact
 *   createDeal(lead, dealName, amount, stage)  → creates deal in HubSpot pipeline
 *   updateDealStage(dealId, stage)             → moves deal to new stage
 *   addNote(contactId, note)                   → adds note to contact
 *   bulkSync(leads)                            → syncs multiple leads to HubSpot
 *   getContactByEmail(email)                   → looks up contact by email
 *   mapLeadToHubspot(lead)                     → maps LSC lead fields to HubSpot properties
 */

import { config } from '../config.js';
import { query, queryAll, queryOne } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';
import { eventBus } from '../events/event-bus.js';

const log = agentLogger('hubspot');

const HS_API = 'https://api.hubapi.com';

// LSC stage → HubSpot lifecycle stage
const STAGE_MAP = {
  visitor:     'subscriber',
  prospect:    'lead',
  mql:         'marketingqualifiedlead',
  sql:         'salesqualifiedlead',
  opportunity: 'opportunity',
  customer:    'customer',
  churned:     'other',
};

// HubSpot lifecycle stage → LSC stage
const REVERSE_STAGE_MAP = {
  subscriber:             'visitor',
  lead:                   'prospect',
  marketingqualifiedlead: 'mql',
  salesqualifiedlead:     'sql',
  opportunity:            'opportunity',
  customer:               'customer',
  other:                  'churned',
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
      Authorization:  `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  // ─────────────────────────────────────────────
  // Field mapping
  // ─────────────────────────────────────────────

  /**
   * Map a LSC lead row to HubSpot contact properties.
   * Handles name splitting and custom LSC properties.
   *
   * @param {object} lead — Lead row from DB
   * @returns {object}    — HubSpot properties object
   */
  mapLeadToHubspot(lead) {
    const nameParts = (lead.full_name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName  = nameParts.slice(1).join(' ') || '';

    return {
      email:          lead.email,
      firstname:      firstName,
      lastname:       lastName,
      company:        lead.company    || '',
      jobtitle:       lead.job_title  || '',
      phone:          lead.phone      || '',
      website:        lead.linkedin_url ? `https://linkedin.com/in/${lead.linkedin_url.replace(/.*\/in\//, '')}` : '',
      lifecyclestage: STAGE_MAP[lead.stage] || 'lead',
      // Custom LSC properties (must be created in HubSpot portal first)
      lsc_lead_score:       String(lead.composite_score || 0),
      lsc_intent_score:     String(lead.intent_score    || 0),
      lsc_fit_score:        String(lead.fit_score       || 0),
      lsc_source_keyword:   lead.source_keyword         || lead.first_touch_keyword || '',
      lsc_source_channel:   lead.first_touch_channel    || '',
      lsc_nurture_step:     String(lead.nurture_step    || 0),
    };
  }

  // ─────────────────────────────────────────────
  // Upsert contact
  // ─────────────────────────────────────────────

  /**
   * Create or update a HubSpot contact for a LSC lead.
   * Uses POST (create) then falls back to PATCH on 409 conflict.
   *
   * @param {object} lead  — Lead row (may be passed as { lead } or directly)
   * @returns {{ status: 'created'|'updated'|'skipped'|'failed', crmId?: string }}
   */
  async upsertContact(lead) {
    // Support both upsertContact(lead) and upsertContact({ lead })
    if (lead && lead.lead && !lead.email) lead = lead.lead;

    if (!this.isConfigured) {
      const mockId = `hs_mock_${Date.now()}`;
      log.info('HubSpot not configured — returning mock contact ID', { email: lead.email, mockId });
      await query(
        `UPDATE leads SET crm_id = $1, crm_provider = 'hubspot', crm_synced_at = NOW() WHERE id = $2`,
        [mockId, lead.id]
      ).catch(() => {});
      return { status: 'skipped', crmId: mockId, mock: true };
    }

    const properties = this.mapLeadToHubspot(lead);

    try {
      // Attempt create first
      const createRes = await fetch(`${HS_API}/crm/v3/objects/contacts`, {
        method:  'POST',
        headers: this.headers,
        body:    JSON.stringify({ properties }),
      });

      if (createRes.status === 409) {
        // Contact already exists — fetch and patch
        const existing = await this._getContactByEmail(lead.email);
        if (existing) {
          const patchRes = await fetch(`${HS_API}/crm/v3/objects/contacts/${existing.id}`, {
            method:  'PATCH',
            headers: this.headers,
            body:    JSON.stringify({ properties }),
          });
          if (!patchRes.ok) {
            const errText = await patchRes.text();
            throw new Error(`HubSpot PATCH ${patchRes.status}: ${errText}`);
          }
          await query(
            `UPDATE leads SET crm_id = $1, crm_provider = 'hubspot', crm_synced_at = NOW() WHERE id = $2`,
            [existing.id, lead.id]
          );
          log.info('HubSpot contact updated', { email: lead.email, crmId: existing.id });
          return { status: 'updated', crmId: existing.id };
        }
      }

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`HubSpot POST ${createRes.status}: ${errText}`);
      }

      const data = await createRes.json();
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

  // ─────────────────────────────────────────────
  // Create deal
  // ─────────────────────────────────────────────

  /**
   * Create a HubSpot deal and associate it with the contact.
   *
   * @param {object} lead
   * @param {string} [dealName]
   * @param {number} [amount]
   * @param {string} [stage='appointmentscheduled']
   * @returns {{ status: string, dealId?: string }}
   */
  async createDeal(lead, dealName, amount, stage = 'appointmentscheduled') {
    if (!this.isConfigured) {
      const mockDealId = `hs_deal_mock_${Date.now()}`;
      log.info('HubSpot not configured — returning mock deal ID', { email: lead.email, mockDealId });
      return { status: 'skipped', dealId: mockDealId, mock: true };
    }

    // Ensure contact exists in HubSpot
    if (!lead.crm_id) {
      const result = await this.upsertContact(lead);
      if (result.crmId) lead = { ...lead, crm_id: result.crmId };
    }

    try {
      const dealRes = await fetch(`${HS_API}/crm/v3/objects/deals`, {
        method:  'POST',
        headers: this.headers,
        body:    JSON.stringify({
          properties: {
            dealname:  dealName || `${lead.company || lead.email} — Organic Inbound`,
            amount:    String(amount || config.business.avgDealSizeUsd),
            dealstage: stage,
            pipeline:  'default',
            closedate: new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0],
          },
        }),
      });

      if (!dealRes.ok) {
        const errText = await dealRes.text();
        throw new Error(`HubSpot deal create ${dealRes.status}: ${errText}`);
      }

      const deal = await dealRes.json();

      // Associate deal ↔ contact
      if (lead.crm_id) {
        await fetch(
          `${HS_API}/crm/v3/objects/deals/${deal.id}/associations/contacts/${lead.crm_id}/deal_to_contact`,
          { method: 'PUT', headers: this.headers }
        ).catch(err => log.debug('Deal association failed', { err: err.message }));
      }

      log.info('HubSpot deal created', { dealId: deal.id, email: lead.email, stage });
      return { status: 'created', dealId: deal.id };

    } catch (err) {
      log.error('HubSpot deal creation failed', { email: lead.email, err: err.message });
      return { status: 'failed', error: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // Update deal stage
  // ─────────────────────────────────────────────

  /**
   * Move a HubSpot deal to a new pipeline stage.
   *
   * @param {string} dealId
   * @param {string} stage   — HubSpot deal stage ID (e.g. 'closedwon', 'contractsent')
   * @returns {{ status: string }}
   */
  async updateDealStage(dealId, stage) {
    if (!this.isConfigured) {
      log.info('HubSpot not configured — deal stage update skipped', { dealId, stage });
      return { status: 'skipped', mock: true };
    }

    try {
      const res = await fetch(`${HS_API}/crm/v3/objects/deals/${dealId}`, {
        method:  'PATCH',
        headers: this.headers,
        body:    JSON.stringify({ properties: { dealstage: stage } }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HubSpot deal update ${res.status}: ${errText}`);
      }

      log.info('HubSpot deal stage updated', { dealId, stage });
      return { status: 'updated' };

    } catch (err) {
      log.error('HubSpot deal stage update failed', { dealId, stage, err: err.message });
      return { status: 'failed', error: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // Add note to contact
  // ─────────────────────────────────────────────

  /**
   * Add a note (engagement) to a HubSpot contact.
   *
   * @param {string} contactId  — HubSpot contact ID
   * @param {string} note       — Note body text
   * @returns {{ status: string, noteId?: string }}
   */
  async addNote(contactId, note) {
    if (!this.isConfigured) {
      log.info('HubSpot not configured — note skipped', { contactId });
      return { status: 'skipped', mock: true };
    }

    try {
      const res = await fetch(`${HS_API}/crm/v3/objects/notes`, {
        method:  'POST',
        headers: this.headers,
        body:    JSON.stringify({
          properties: {
            hs_note_body:      note,
            hs_timestamp:      Date.now(),
          },
          associations: [{
            to:    { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
          }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HubSpot note create ${res.status}: ${errText}`);
      }

      const data = await res.json();
      log.info('HubSpot note added', { contactId, noteId: data.id });
      return { status: 'created', noteId: data.id };

    } catch (err) {
      log.error('HubSpot add note failed', { contactId, err: err.message });
      return { status: 'failed', error: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // Bulk sync
  // ─────────────────────────────────────────────

  /**
   * Sync multiple leads to HubSpot (staggered to respect rate limits).
   * If leads array not supplied, queries DB for out-of-sync leads.
   *
   * @param {Array} [leads]  — Array of lead rows; if omitted, fetches from DB
   * @returns {{ synced: number, failed: number, total: number }}
   */
  async bulkSync(leads) {
    if (!leads) {
      leads = await queryAll(
        `SELECT * FROM leads
         WHERE crm_synced_at IS NULL
            OR crm_synced_at < NOW() - INTERVAL '24 hours'
         ORDER BY composite_score DESC
         LIMIT 100`
      );
    }

    let synced = 0, failed = 0;

    for (const lead of leads) {
      const result = await this.upsertContact(lead);
      result.status !== 'failed' ? synced++ : failed++;
      // Respect HubSpot rate limit: ~10 req/sec for free tier
      await new Promise(r => setTimeout(r, 110));
    }

    log.info('HubSpot bulk sync complete', { total: leads.length, synced, failed });
    return { synced, failed, total: leads.length };
  }

  // ─────────────────────────────────────────────
  // Get contact by email
  // ─────────────────────────────────────────────

  /**
   * Look up a HubSpot contact by email address.
   *
   * @param {string} email
   * @returns {object|null}  — HubSpot contact object or null
   */
  async getContactByEmail(email) {
    if (!this.isConfigured) {
      return { id: `hs_mock_${Date.now()}`, properties: { email }, mock: true };
    }
    return this._getContactByEmail(email);
  }

  // ─────────────────────────────────────────────
  // Inbound webhook handler
  // ─────────────────────────────────────────────

  /**
   * Handle inbound HubSpot webhook events (bi-directional sync).
   *
   * Supported event types:
   *   contact.propertyChange (lifecyclestage) → update LSC lead.stage
   *   deal.propertyChange    (dealstage)      → closedwon→customer, closedlost→churned
   *
   * @param {Array} events — Array of HubSpot webhook event objects
   */
  async handleWebhook(events) {
    if (!Array.isArray(events) || !events.length) return { processed: 0 };

    let processed = 0;
    for (const event of events) {
      try {
        const { subscriptionType, objectId, propertyName, propertyValue } = event;

        // ── Contact lifecycle change ─────────────────
        if (subscriptionType === 'contact.propertyChange' && propertyName === 'lifecyclestage') {
          const lscStage = REVERSE_STAGE_MAP[propertyValue];
          if (!lscStage) continue;

          const lead = await queryOne(
            `SELECT id, stage FROM leads WHERE crm_id = $1 AND crm_provider = 'hubspot'`,
            [String(objectId)]
          );
          if (!lead || lead.stage === lscStage) continue;

          await query(
            `UPDATE leads SET stage = $1::lead_stage, updated_at = NOW() WHERE id = $2`,
            [lscStage, lead.id]
          );
          await query(
            `INSERT INTO pipeline_events (lead_id, event_type, channel, metadata)
             VALUES ($1, 'stage_changed', 'direct', $2)`,
            [lead.id, JSON.stringify({ source: 'hubspot_webhook', from: lead.stage, to: lscStage, hubspot_object_id: objectId })]
          );
          await eventBus.emit('lead.stage_changed', { leadId: lead.id, oldStage: lead.stage, newStage: lscStage });
          log.info('HubSpot→LSC stage sync', { leadId: lead.id, from: lead.stage, to: lscStage });
          processed++;
        }

        // ── Deal stage change ─────────────────────────
        if (subscriptionType === 'deal.propertyChange' && propertyName === 'dealstage') {
          const lscStage = DEAL_STAGE_MAP[propertyValue];
          if (!lscStage) continue;

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
          await eventBus.emit('lead.stage_changed', { leadId: lead.id, oldStage: lead.stage, newStage: lscStage });
          log.info('HubSpot deal→LSC stage sync', { leadId: lead.id, dealStage: propertyValue, lscStage });
          processed++;
        }
      } catch (err) {
        log.error('HubSpot webhook event error', { event, err: err.message });
      }
    }

    return { processed };
  }

  // ─────────────────────────────────────────────
  // Contact enrichment
  // ─────────────────────────────────────────────

  /**
   * Enrich a lead by fetching their HubSpot contact record.
   * @param {string} email
   */
  async enrichContact(email) {
    if (!this.isConfigured) {
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

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  async _getContactByEmail(email) {
    const res = await fetch(`${HS_API}/crm/v3/objects/contacts/search`, {
      method:  'POST',
      headers: this.headers,
      body:    JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
        properties:   ['email', 'firstname', 'lastname', 'company', 'jobtitle', 'phone', 'lifecyclestage', 'hs_linkedin_handle'],
        limit:        1,
      }),
    });
    const data = await res.json();
    return data.results?.[0] || null;
  }
}

export const hubspotClient = new HubSpotClient();
