/**
 * Twilio SMS Integration — Real-time sales alerts + lead outreach
 *
 * Configure:
 *   TWILIO_ACCOUNT_SID   — from console.twilio.com
 *   TWILIO_AUTH_TOKEN    — from console.twilio.com
 *   TWILIO_FROM_NUMBER   — your Twilio phone number (+1xxxxxxxxxx)
 *   SALES_PHONE_NUMBER   — sales rep's phone to receive SQL alerts
 *
 * Falls back to console log (info level) when not configured.
 *
 * Methods:
 *   sendSMS(to, message)            → sends SMS via Twilio REST API
 *   sendSQLAlert(lead, salesPhone)  → sends SQL lead alert to sales team
 *   sendOTP(phone, code)            → sends OTP code for verification
 */

import { config } from '../config.js';
import { agentLogger } from '../utils/logger.js';

const log = agentLogger('twilio');

const TWILIO_API = 'https://api.twilio.com/2010-04-01';

class TwilioClient {
  constructor() {
    this.accountSid  = config.integrations.twilio.accountSid;
    this.authToken   = config.integrations.twilio.authToken;
    this.fromNumber  = config.integrations.twilio.fromNumber;
    this.salesNumber = config.integrations.twilio.salesNumber;
    this.isConfigured = Boolean(this.accountSid && this.authToken && this.fromNumber);
    this.dashboardUrl = `https://${config.business.domain}`;
  }

  // ─────────────────────────────────────────────
  // Core SMS send
  // ─────────────────────────────────────────────

  /**
   * Send an SMS message via Twilio REST API.
   *
   * @param {string} to      — E.164 phone number (+14155551234)
   * @param {string} message — SMS body (max 1600 chars; auto-truncated)
   * @returns {{ status: string, sid?: string, error?: string }}
   */
  async sendSMS(to, message) {
    // Support legacy object-style call: sendSMS({ to, body })
    if (typeof to === 'object') {
      const opts = to;
      to      = opts.to;
      message = opts.body || opts.message || '';
    }

    if (!this.isConfigured) {
      log.info('[Twilio] Not configured — SMS skipped', { to, preview: String(message).slice(0, 60) });
      return { status: 'skipped', mock: true, sid: `sim_sms_${Date.now()}` };
    }

    if (!to) {
      log.warn('[Twilio] No recipient number provided');
      return { status: 'skipped', reason: 'no_recipient' };
    }

    // Twilio has a 1600 char limit per SMS segment; truncate gracefully
    const body     = String(message).slice(0, 1600);
    const endpoint = `${TWILIO_API}/Accounts/${this.accountSid}/Messages.json`;
    const auth     = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const params   = new URLSearchParams({ To: to, From: this.fromNumber, Body: body });

    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: {
          Authorization:  `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = await res.json();

      if (!res.ok) {
        log.error('[Twilio] Send failed', { code: data.code, message: data.message, to });
        return { status: 'error', code: data.code, error: data.message };
      }

      log.info('[Twilio] SMS sent', { to, sid: data.sid, status: data.status });
      return { status: 'sent', sid: data.sid, twilioStatus: data.status };

    } catch (err) {
      log.error('[Twilio] Request error', { err: err.message });
      return { status: 'error', error: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // SQL lead alert
  // ─────────────────────────────────────────────

  /**
   * Send a hot SQL lead alert SMS to the sales team.
   *
   * Message format:
   * "🔥 New SQL: {name} from {company} | Score: {score}/100 | {phone} | View: {dashboardUrl}/leads/{id}"
   *
   * @param {object} lead        — Lead row from DB
   * @param {string} [salesPhone] — Override default sales phone number
   * @param {object} [scoring]   — Scoring result
   * @returns {{ status: string }}
   */
  async sendSQLAlert(lead, salesPhone, scoring) {
    // Support legacy call: sendSQLAlert({ lead, scoring })
    if (lead && lead.lead && !lead.email) {
      scoring   = lead.scoring;
      lead      = lead.lead;
    }

    const to = salesPhone || this.salesNumber;

    if (!to) {
      log.info('[Twilio] No sales phone number configured — SQL SMS skipped');
      return { status: 'skipped', reason: 'no_sales_number' };
    }

    const name    = lead.full_name  || lead.email;
    const company = lead.company    || 'Unknown company';
    const score   = scoring?.composite_score ?? lead?.composite_score ?? '?';
    const phone   = lead.phone ? `| ${lead.phone} ` : '';

    const message = [
      `🔥 New SQL: ${name} from ${company}`,
      `Score: ${score}/100`,
      phone ? `Phone: ${lead.phone}` : null,
      `Email: ${lead.email}`,
      lead.job_title ? `Role: ${lead.job_title}` : null,
      `View: ${this.dashboardUrl}/leads/${lead.id}`,
    ].filter(Boolean).join('\n');

    return this.sendSMS(to, message);
  }

  // ─────────────────────────────────────────────
  // OTP / verification
  // ─────────────────────────────────────────────

  /**
   * Send a one-time passcode to a phone number.
   *
   * @param {string} phone  — E.164 phone number
   * @param {string} code   — 6-digit (or custom) OTP code
   * @returns {{ status: string }}
   */
  async sendOTP(phone, code) {
    const message = `${config.business.companyName} verification code: ${code}. Valid for 10 minutes. Do not share this code.`;
    return this.sendSMS(phone, message);
  }

  // ─────────────────────────────────────────────
  // Direct lead outreach (opt-in only)
  // ─────────────────────────────────────────────

  /**
   * Send a personalised outreach SMS to a lead.
   * ONLY use when explicit phone consent is known (GDPR/TCPA compliant use).
   *
   * @param {object} lead    — Lead row (must have phone or whatsapp)
   * @param {string} message — SMS body
   */
  async sendLeadOutreach(lead, message) {
    const to = lead.phone || lead.whatsapp;
    if (!to) return { status: 'skipped', reason: 'no_phone_number' };
    if (lead.do_not_contact) return { status: 'skipped', reason: 'do_not_contact' };
    return this.sendSMS(to, message);
  }
}

export const twilioClient = new TwilioClient();
