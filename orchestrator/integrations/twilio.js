/**
 * Twilio SMS Integration — Real-time sales alerts + lead outreach
 *
 * Configure:
 *   TWILIO_ACCOUNT_SID   — from console.twilio.com
 *   TWILIO_AUTH_TOKEN    — from console.twilio.com
 *   TWILIO_FROM_NUMBER   — your Twilio phone number (+1xxxxxxxxxx)
 *   SALES_PHONE_NUMBER   — sales rep's phone to receive SQL alerts
 *
 * Falls back to console logging when not configured.
 */

import { config } from '../config.js';
import { agentLogger } from '../utils/logger.js';

const log = agentLogger('twilio');

class TwilioClient {
  constructor() {
    this.accountSid  = config.integrations.twilio.accountSid;
    this.authToken   = config.integrations.twilio.authToken;
    this.fromNumber  = config.integrations.twilio.fromNumber;
    this.salesNumber = config.integrations.twilio.salesNumber;
    this.isConfigured = Boolean(this.accountSid && this.authToken && this.fromNumber);
  }

  /**
   * Send an SMS message
   * @param {{ to: string, body: string }} opts
   */
  async sendSMS({ to, body }) {
    if (!this.isConfigured) {
      log.info('[Twilio] Not configured — SMS skipped', { to, body: body.slice(0, 60) });
      return { status: 'skipped' };
    }

    if (!to) {
      log.warn('[Twilio] No recipient number provided');
      return { status: 'skipped', reason: 'no_recipient' };
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth     = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    const params = new URLSearchParams({ To: to, From: this.fromNumber, Body: body });

    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    params.toString(),
      });

      if (!res.ok) {
        const err = await res.json();
        log.error('[Twilio] Send failed', { code: err.code, message: err.message });
        return { status: 'error', code: err.code, message: err.message };
      }

      const data = await res.json();
      log.info('[Twilio] SMS sent', { to, sid: data.sid });
      return { status: 'sent', sid: data.sid };
    } catch (err) {
      log.error('[Twilio] Request error', { err: err.message });
      return { status: 'error', err: err.message };
    }
  }

  /**
   * Send a hot SQL lead alert to the sales rep's phone
   */
  async sendSQLAlert({ lead, scoring }) {
    if (!this.salesNumber) {
      log.info('[Twilio] No sales phone number configured — SQL SMS skipped');
      return { status: 'skipped', reason: 'no_sales_number' };
    }

    const name    = lead.full_name  || lead.email;
    const company = lead.company    || 'Unknown company';
    const score   = scoring?.composite_score ?? lead?.composite_score ?? '?';
    const source  = lead.first_touch_channel || 'organic';

    const body = [
      `🔥 HOT SQL LEAD (${score}/100)`,
      `${name} @ ${company}`,
      `Source: ${source}`,
      lead.job_title ? `Role: ${lead.job_title}` : null,
      `Email: ${lead.email}`,
      `Action: ${scoring?.routing ?? 'immediate_personal'} follow-up now`,
    ].filter(Boolean).join('\n');

    return this.sendSMS({ to: this.salesNumber, body });
  }

  /**
   * Send a personalised outreach SMS directly to a lead (opt-in only)
   * Only use when lead.whatsapp or explicit phone consent is known
   */
  async sendLeadOutreach({ lead, message }) {
    const to = lead.phone || lead.whatsapp;
    if (!to) return { status: 'skipped', reason: 'no_phone_number' };
    return this.sendSMS({ to, body: message });
  }
}

export const twilioClient = new TwilioClient();
