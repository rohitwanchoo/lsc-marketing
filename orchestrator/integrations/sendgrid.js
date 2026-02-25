/**
 * SendGrid Email Integration
 *
 * Handles: transactional emails, nurture sequences, follow-ups
 * Fallback: logs to console/DB when API key not configured
 */

import { config } from '../config.js';
import { query, queryOne } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';
import { broadcast } from '../utils/sse-broadcaster.js';

const log = agentLogger('sendgrid');

const SENDGRID_API = 'https://api.sendgrid.com/v3';

class SendGridClient {
  constructor() {
    this.apiKey       = config.integrations.sendgrid.apiKey;
    this.isConfigured = Boolean(this.apiKey);
    this.fromEmail    = process.env.FROM_EMAIL    || 'growth@example.com';
    this.fromName     = process.env.FROM_NAME     || 'Growth Team';
  }

  /**
   * Send a single transactional email
   */
  async send({ to, toName, subject, htmlBody, textBody, category, leadId }) {
    const emailRecord = {
      to, toName, subject,
      category: category || 'transactional',
      leadId,
      sentAt: new Date().toISOString(),
    };

    if (!this.isConfigured) {
      log.warn('SendGrid not configured — email logged only', { to, subject });
      await this._logEmail({ ...emailRecord, status: 'simulated', provider_id: `sim_${Date.now()}` });
      return { status: 'simulated', id: `sim_${Date.now()}` };
    }

    try {
      const response = await fetch(`${SENDGRID_API}/mail/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: to, name: toName || to }],
          }],
          from:    { email: this.fromEmail, name: this.fromName },
          subject,
          content: [
            { type: 'text/html',  value: htmlBody  || this._textToHtml(textBody || '') },
            { type: 'text/plain', value: textBody  || this._htmlToText(htmlBody || '') },
          ],
          categories: [category || 'nurture'],
          tracking_settings: {
            click_tracking:  { enable: true },
            open_tracking:   { enable: true },
          },
          custom_args: leadId ? { lead_id: leadId } : {},
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`SendGrid ${response.status}: ${err}`);
      }

      const messageId = response.headers.get('x-message-id') || `sg_${Date.now()}`;
      await this._logEmail({ ...emailRecord, status: 'sent', provider_id: messageId });
      log.info('Email sent', { to, subject, messageId });
      return { status: 'sent', id: messageId };

    } catch (err) {
      log.error('Email send failed', { to, subject, err: err.message });
      await this._logEmail({ ...emailRecord, status: 'failed', error: err.message });
      throw err;
    }
  }

  /**
   * Execute the next step of a nurture sequence for a lead
   */
  async executeNurtureStep({ leadId }) {
    const lead = await queryOne(
      `SELECT l.*, ns.steps, ns.name as sequence_name
       FROM leads l
       JOIN nurture_sequences ns ON ns.trigger_stage = l.stage AND ns.is_active = TRUE
       WHERE l.id = $1 AND l.do_not_contact = FALSE`,
      [leadId]
    );

    if (!lead || !lead.steps) {
      log.debug('No active nurture sequence for lead', { leadId });
      return null;
    }

    const steps  = Array.isArray(lead.steps) ? lead.steps : JSON.parse(lead.steps);
    const step   = steps[lead.nurture_step];

    if (!step) {
      log.info('Lead completed nurture sequence', { leadId, sequence: lead.sequence_name });
      return null;
    }

    const result = await this.send({
      to:       lead.email,
      toName:   lead.full_name,
      subject:  step.subject,
      textBody: step.body,
      category: `nurture_${lead.sequence_name}`,
      leadId,
    });

    // Advance nurture step and schedule next
    const nextStep       = steps[lead.nurture_step + 1];
    const nextFollowUpAt = nextStep
      ? new Date(Date.now() + nextStep.day * 86400_000)
      : null;

    await query(
      `UPDATE leads
       SET nurture_step     = nurture_step + 1,
           next_follow_up_at = $1,
           email_opens       = email_opens   -- updated via webhook
       WHERE id = $2`,
      [nextFollowUpAt, leadId]
    );

    return result;
  }

  /**
   * Batch nurture execution — called by scheduler
   */
  async runNurtureQueue() {
    const due = await query(
      `SELECT id FROM leads
       WHERE next_follow_up_at <= NOW()
         AND stage NOT IN ('customer','churned')
         AND do_not_contact = FALSE
         AND nurture_step < 10
       ORDER BY composite_score DESC
       LIMIT 100`
    );

    let sent = 0, failed = 0;
    for (const row of due.rows) {
      try {
        await this.executeNurtureStep({ leadId: row.id });
        sent++;
      } catch {
        failed++;
      }
    }

    log.info('Nurture queue processed', { sent, failed, total: due.rowCount });
    return { sent, failed };
  }

  /**
   * Handle SendGrid event webhooks (opens, clicks, unsubscribes)
   */
  async handleWebhookEvent(events) {
    for (const event of events) {
      const leadId = event.lead_id;
      if (!leadId) continue;

      if (event.event === 'open') {
        await query(`UPDATE leads SET email_opens = email_opens + 1 WHERE id = $1`, [leadId]);
      }
      if (event.event === 'click') {
        await query(`UPDATE leads SET email_clicks = email_clicks + 1 WHERE id = $1`, [leadId]);
        // Intent spike — re-score
        await query(
          `UPDATE leads SET intent_score = LEAST(100, intent_score + 5) WHERE id = $1`,
          [leadId]
        );
        // Broadcast to SSE clients if intent crossed the hot-lead threshold (70)
        const updated = await queryOne(
          `SELECT id, email, company, intent_score, composite_score FROM leads WHERE id = $1`,
          [leadId]
        );
        if (updated && updated.intent_score >= 70) {
          broadcast('intent_spike', {
            leadId:         updated.id,
            email:          updated.email,
            company:        updated.company,
            intentScore:    updated.intent_score,
            compositeScore: updated.composite_score,
            trigger:        'email_click',
            ts:             new Date().toISOString(),
          });
        }
      }
      if (event.event === 'unsubscribe' || event.event === 'spamreport') {
        await query(`UPDATE leads SET do_not_contact = TRUE WHERE id = $1`, [leadId]);
        log.info('Lead unsubscribed', { leadId, event: event.event });
      }
    }
  }

  /**
   * Enroll an email into a nurture sequence
   */
  async enrollInSequence(email, sequenceId) {
    if (!this.isConfigured) {
      log.info('Mock: enrollInSequence', { email, sequenceId });
      return { ok: true, mock: true };
    }
    try {
      // SendGrid doesn't have "sequences" natively — enroll via marketing contacts
      // For now, tag the contact with the sequence for the nurture queue to pick up
      log.info('Enrolling in sequence', { email, sequenceId });
      return { ok: true };
    } catch (err) {
      log.error('enrollInSequence failed', { email, err: err.message });
      throw err;
    }
  }

  async _logEmail({ to, subject, status, category, leadId, provider_id, error }) {
    // Lightweight log in pipeline_events
    if (leadId) {
      await query(
        `INSERT INTO pipeline_events (lead_id, event_type, channel, metadata)
         VALUES ($1, 'email_sent', 'email', $2)`,
        [leadId, JSON.stringify({ to, subject, status, category, provider_id, error })]
      ).catch(() => {});
    }
  }

  _textToHtml(text) {
    return `<html><body style="font-family:sans-serif;line-height:1.6;max-width:600px;margin:auto;padding:20px">
      ${text.split('\n').map(l => `<p>${l}</p>`).join('')}
    </body></html>`;
  }

  _htmlToText(html) {
    return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
}

export const emailClient = new SendGridClient();
