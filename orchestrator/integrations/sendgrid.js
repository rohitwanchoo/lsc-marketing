/**
 * SendGrid Email Integration
 *
 * Handles: transactional emails, nurture sequences, follow-ups
 * Fallback: logs to console/DB when API key not configured
 *
 * Methods:
 *   sendEmail(to, subject, htmlBody, textBody, metadata)
 *   sendNurtureEmail(lead, step)
 *   executeNurtureStep(lead, step)
 *   runNurtureQueue()
 *   _logEmail(leadId, email, subject, templateName, messageId)
 *   _textToHtml(text)
 *   handleWebhook(events)
 *   getEmailStats(leadId)
 */

import { config } from '../config.js';
import { query, queryOne, queryAll } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';
import { broadcast } from '../utils/sse-broadcaster.js';

const log = agentLogger('sendgrid');

const SENDGRID_API = 'https://api.sendgrid.com/v3';

// ─────────────────────────────────────────────
// Nurture sequence templates
// ─────────────────────────────────────────────

const NURTURE_STEPS = [
  {
    step: 1,
    dayOffset: 0,
    subject: 'Welcome — here\'s how we drive organic revenue without paid ads',
    templateName: 'welcome_value_prop',
    buildBody: (lead, companyName, valueProp) => `Hi ${lead.full_name?.split(' ')[0] || 'there'},

Thanks for connecting with ${companyName}.

Most B2B companies burn $10-50k/month on paid ads to hit $50k MRR. We built something different: ${valueProp}.

In the next few weeks I'll share exactly how our system works — including the SEO and content playbooks that drive compounding organic leads month after month.

Quick question to tailor these emails: what's your biggest growth challenge right now?
a) Not enough inbound leads
b) Leads aren't converting to demos
c) Content takes too long to produce
d) Hard to know what's actually working

Just reply with a letter — takes 5 seconds.

Talk soon,
The ${companyName} Growth Team

P.S. — Our free Organic Revenue Audit shows your biggest SEO gaps in 2 minutes: https://${config.business.domain}/audit`,
  },
  {
    step: 2,
    dayOffset: 3,
    subject: 'How [Company] went from 0 to 847 organic leads in 6 months',
    templateName: 'case_study_social_proof',
    buildBody: (lead, companyName) => `Hi ${lead.full_name?.split(' ')[0] || 'there'},

When Northmark SaaS came to us, their organic traffic was flat and CAC was climbing month over month.

Six months later:
- 847 organic leads (up from 34/month)
- CAC dropped from $1,200 → $380
- $0 spent on paid ads the entire time

How? Three compounding levers:

1. BOFU keyword ownership — ranking for "best [category] software" type searches
2. Authority content — in-depth comparisons their prospects were already searching for
3. Automated nurture — their AI scored and routed leads before a human touched them

The full case study (with keyword list and content map): https://${config.business.domain}/case-studies/northmark

Is this the kind of growth you're working toward?

${companyName} Growth Team`,
  },
  {
    step: 3,
    dayOffset: 7,
    subject: 'The 7 agents running your growth 24/7 (feature deep-dive)',
    templateName: 'feature_deep_dive',
    buildBody: (lead, companyName) => `Hi ${lead.full_name?.split(' ')[0] || 'there'},

Our platform runs 7 autonomous AI agents around the clock:

🔍 SEO Demand Capture — finds keywords your ideal buyers are searching RIGHT NOW
✍️ Authority Content — writes EEAT-optimised posts that rank and convert
📣 Social Distribution — adapts and schedules content across LinkedIn
🎯 Inbound Conversion — scores every lead 0-100 using intent + fit + engagement
📊 Revenue Analytics — attributes every dollar back to the keyword or post that started it
🔄 Compounding Growth — runs A/B tests and doubles down on what's working
🎬 Revenue Orchestrator — coordinates everything and keeps you on track to MRR targets

Together they replace a 3-person marketing team and run without daily input.

See the live platform dashboard: https://${config.business.domain}/demo

${companyName} Growth Team`,
  },
  {
    step: 4,
    dayOffset: 14,
    subject: 'Your organic revenue ROI calculator (fill in 3 numbers)',
    templateName: 'roi_calculator_demo_offer',
    buildBody: (lead, companyName) => `Hi ${lead.full_name?.split(' ')[0] || 'there'},

I built a quick calculator that shows your potential organic revenue upside.

You need three numbers:
1. Your current monthly organic traffic (Google Search Console → Performance)
2. Your average deal size ($)
3. Your target MRR ($)

Plug them in here: https://${config.business.domain}/roi-calculator

Most companies discover they're leaving $15-40k/month in organic revenue on the table.

If your numbers look interesting, I'd love to show you the exact playbook on a 20-minute call. I'll audit your top 3 keyword opportunities live — no prep needed on your end.

Book a slot: https://${config.business.domain}/demo

${companyName} Growth Team

P.S. — The call is free and I won't pitch you unless the numbers actually make sense for your business.`,
  },
  {
    step: 5,
    dayOffset: 21,
    subject: 'Last email — one question before I go',
    templateName: 'final_cta',
    buildBody: (lead, companyName) => `Hi ${lead.full_name?.split(' ')[0] || 'there'},

This is my last email in this sequence — I don't want to clog your inbox.

Before I go, one honest question: is organic revenue growth actually a priority for you in the next 90 days?

If yes — let's talk. 20 minutes, I'll show you exactly where your biggest opportunities are:
https://${config.business.domain}/demo

If not — no worries. You can reach me any time at ${config.business.domain} when the timing is right.

Either way, thanks for reading.

${companyName} Growth Team

P.S. — If you're already working with someone on this, I'd love to know what's working. Just reply — I read every response.`,
  },
];

class SendGridClient {
  constructor() {
    this.apiKey       = config.integrations.sendgrid.apiKey;
    this.isConfigured = Boolean(this.apiKey);
    this.fromEmail    = process.env.FROM_EMAIL    || 'growth@example.com';
    this.fromName     = process.env.FROM_NAME     || 'Growth Team';
    this.dashboardUrl = `https://${config.business.domain}`;
    this.companyName  = config.business.companyName;
    this.valueProp    = config.business.valueProposition;
  }

  // ─────────────────────────────────────────────
  // Core send method
  // ─────────────────────────────────────────────

  /**
   * Send a single transactional email.
   * @param {string} to
   * @param {string} subject
   * @param {string} htmlBody
   * @param {string} [textBody]
   * @param {object} [metadata]  — { leadId, category, toName, templateName, sequenceStep }
   * @returns {{ messageId: string, status: string }}
   */
  async sendEmail(to, subject, htmlBody, textBody, metadata = {}) {
    const { leadId, category, toName, templateName, sequenceStep } = metadata;

    if (!this.isConfigured) {
      log.warn('SendGrid not configured — email logged only', { to, subject });
      const mockId = `sim_${Date.now()}`;
      await this._logEmail(leadId, to, subject, templateName || 'unknown', mockId, 'simulated', sequenceStep);
      return { messageId: mockId, status: 'simulated' };
    }

    const payload = {
      personalizations: [{
        to: [{ email: to, name: toName || to }],
      }],
      from:    { email: this.fromEmail, name: this.fromName },
      subject,
      content: [
        { type: 'text/html',  value: htmlBody || this._textToHtml(textBody || '') },
        { type: 'text/plain', value: textBody || this._htmlToText(htmlBody || '') },
      ],
      categories:        [category || 'nurture'],
      tracking_settings: {
        click_tracking: { enable: true },
        open_tracking:  { enable: true },
      },
      custom_args: leadId ? { lead_id: String(leadId) } : {},
    };

    try {
      const response = await fetch(`${SENDGRID_API}/mail/send`, {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`SendGrid ${response.status}: ${errText}`);
      }

      const messageId = response.headers.get('x-message-id') || `sg_${Date.now()}`;
      await this._logEmail(leadId, to, subject, templateName || category || 'transactional', messageId, 'sent', sequenceStep);
      log.info('Email sent', { to, subject, messageId });
      return { messageId, status: 'sent' };

    } catch (err) {
      log.error('Email send failed', { to, subject, err: err.message });
      await this._logEmail(leadId, to, subject, templateName || 'unknown', null, 'failed', sequenceStep);
      throw err;
    }
  }

  // ─────────────────────────────────────────────
  // Legacy compatibility wrapper (used by agents that call .send())
  // ─────────────────────────────────────────────

  async send({ to, toName, subject, htmlBody, textBody, category, leadId, templateName, sequenceStep }) {
    return this.sendEmail(to, subject, htmlBody, textBody, {
      leadId, category, toName, templateName, sequenceStep,
    });
  }

  // ─────────────────────────────────────────────
  // Nurture email (template-driven)
  // ─────────────────────────────────────────────

  /**
   * Send the nurture email for a specific step definition.
   * @param {object} lead     — Lead row from DB
   * @param {object} step     — Step object with { subject, templateName, buildBody }
   */
  async sendNurtureEmail(lead, step) {
    const textBody = step.buildBody
      ? step.buildBody(lead, this.companyName, this.valueProp)
      : step.body || '';

    const htmlBody = this._textToHtml(textBody);

    return this.sendEmail(
      lead.email,
      step.subject,
      htmlBody,
      textBody,
      {
        leadId:       lead.id,
        toName:       lead.full_name,
        category:     'nurture',
        templateName: step.templateName || `nurture_step_${step.step}`,
        sequenceStep: step.step,
      }
    );
  }

  // ─────────────────────────────────────────────
  // Execute one nurture step
  // ─────────────────────────────────────────────

  /**
   * Execute the next nurture step for a lead using our built-in sequence.
   * Falls back to DB-stored nurture_sequences if available.
   *
   * Sequence:
   *   Step 1 (day 0):  Welcome + value prop
   *   Step 2 (day 3):  Case study / social proof
   *   Step 3 (day 7):  Feature deep-dive
   *   Step 4 (day 14): ROI calculator + demo offer
   *   Step 5 (day 21): Final CTA
   *   After step 5: mark 'nurture_complete', move to 'qualified' if score > 60
   *
   * @param {object} lead  — Can be just { leadId } or a full lead row
   * @param {object} [stepOverride]  — Optional step object to use instead of sequence
   */
  async executeNurtureStep(lead, stepOverride = null) {
    // Resolve full lead if only id provided
    let fullLead = lead;
    if (lead.leadId && !lead.email) {
      fullLead = await queryOne(`SELECT * FROM leads WHERE id = $1`, [lead.leadId]);
    }
    if (!fullLead) {
      log.debug('Lead not found for nurture step', { input: lead });
      return null;
    }
    if (fullLead.do_not_contact) {
      log.debug('Lead opted out of contact, skipping nurture', { leadId: fullLead.id });
      return null;
    }

    // Try DB-stored nurture sequence first
    const dbSequence = await queryOne(
      `SELECT ns.steps, ns.name as sequence_name
       FROM nurture_sequences ns
       WHERE ns.trigger_stage = $1 AND ns.is_active = TRUE
       ORDER BY ns.trigger_score DESC NULLS LAST
       LIMIT 1`,
      [fullLead.stage]
    );

    let step;
    let usingDbSequence = false;

    if (stepOverride) {
      step = stepOverride;
    } else if (dbSequence?.steps) {
      const steps    = Array.isArray(dbSequence.steps) ? dbSequence.steps : JSON.parse(dbSequence.steps);
      const stepData = steps[fullLead.nurture_step];
      if (stepData) {
        step = stepData;
        usingDbSequence = true;
      }
    }

    // Fall back to built-in sequence
    if (!step) {
      step = NURTURE_STEPS[fullLead.nurture_step];
    }

    if (!step) {
      log.info('Lead completed nurture sequence', { leadId: fullLead.id, step: fullLead.nurture_step });
      // Mark complete and potentially qualify
      await query(
        `UPDATE leads
         SET nurture_sequence = 'nurture_complete',
             next_follow_up_at = NULL,
             stage = CASE
               WHEN composite_score > 60 AND stage = 'prospect' THEN 'mql'::lead_stage
               ELSE stage
             END,
             updated_at = NOW()
         WHERE id = $1`,
        [fullLead.id]
      );
      return { status: 'sequence_complete', leadId: fullLead.id };
    }

    // Build the email
    const textBody = step.buildBody
      ? step.buildBody(fullLead, this.companyName, this.valueProp)
      : step.body || '';
    const htmlBody = step.html_body || this._textToHtml(textBody);

    const result = await this.sendEmail(
      fullLead.email,
      step.subject,
      htmlBody,
      textBody,
      {
        leadId:       fullLead.id,
        toName:       fullLead.full_name,
        category:     'nurture',
        templateName: step.templateName || step.template_id || `nurture_step_${fullLead.nurture_step + 1}`,
        sequenceStep: fullLead.nurture_step + 1,
      }
    );

    // Advance step and schedule next follow-up
    const nextStepIndex = fullLead.nurture_step + 1;
    const nextStep      = usingDbSequence
      ? (Array.isArray(dbSequence.steps) ? dbSequence.steps : JSON.parse(dbSequence.steps))[nextStepIndex]
      : NURTURE_STEPS[nextStepIndex];

    let nextFollowUpAt = null;
    if (nextStep) {
      const dayOffset    = nextStep.day || nextStep.dayOffset || 3;
      nextFollowUpAt     = new Date(Date.now() + dayOffset * 86_400_000);
    }

    await query(
      `UPDATE leads
       SET nurture_step      = nurture_step + 1,
           next_follow_up_at = $1,
           updated_at        = NOW()
       WHERE id = $2`,
      [nextFollowUpAt, fullLead.id]
    );

    log.info('Nurture step executed', {
      leadId:   fullLead.id,
      step:     fullLead.nurture_step + 1,
      template: step.templateName || step.template_id,
      nextAt:   nextFollowUpAt,
    });

    return result;
  }

  // ─────────────────────────────────────────────
  // Batch nurture queue
  // ─────────────────────────────────────────────

  /**
   * Process all leads due for their next nurture step.
   * Called by the scheduler (cron).
   * @returns {{ sent: number, failed: number, total: number }}
   */
  async runNurtureQueue() {
    const dueLeads = await queryAll(
      `SELECT * FROM leads
       WHERE next_follow_up_at <= NOW()
         AND stage NOT IN ('customer','churned')
         AND do_not_contact = FALSE
         AND nurture_step < 10
       ORDER BY composite_score DESC
       LIMIT 100`
    );

    let sent = 0, failed = 0;

    for (const lead of dueLeads) {
      try {
        const result = await this.executeNurtureStep(lead);
        if (result) sent++;
      } catch (err) {
        failed++;
        log.error('Nurture step failed', { leadId: lead.id, err: err.message });
      }
    }

    log.info('Nurture queue processed', { sent, failed, total: dueLeads.length });
    return { sent, failed, total: dueLeads.length };
  }

  // ─────────────────────────────────────────────
  // Email logging
  // ─────────────────────────────────────────────

  /**
   * Log a sent email to the emails_sent table.
   * @param {string|null} leadId
   * @param {string}      email
   * @param {string}      subject
   * @param {string}      templateName
   * @param {string|null} messageId
   * @param {string}      [status='sent']
   * @param {number}      [sequenceStep]
   */
  async _logEmail(leadId, email, subject, templateName, messageId, status = 'sent', sequenceStep = null) {
    try {
      await query(
        `INSERT INTO emails_sent
           (lead_id, email_address, subject, template_name, sendgrid_message_id, status, sequence_step, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT DO NOTHING`,
        [leadId || null, email, subject, templateName || null, messageId || null, status, sequenceStep || null]
      );
    } catch (err) {
      log.debug('_logEmail insert failed (non-fatal)', { err: err.message });
    }

    // Also write pipeline event when we have a lead
    if (leadId) {
      await query(
        `INSERT INTO pipeline_events (lead_id, event_type, channel, metadata)
         VALUES ($1, 'email_sent', 'email', $2)`,
        [leadId, JSON.stringify({ to: email, subject, status, templateName, messageId })]
      ).catch(() => {});
    }
  }

  // ─────────────────────────────────────────────
  // Webhook handler
  // ─────────────────────────────────────────────

  /**
   * Handle SendGrid inbound webhook events (open, click, bounce, unsubscribe, etc.)
   * @param {Array} events  — Array of SendGrid event objects
   */
  async handleWebhook(events) {
    if (!Array.isArray(events)) events = [events];

    for (const event of events) {
      try {
        const leadId    = event.lead_id   || event.custom_args?.lead_id;
        const messageId = event.sg_message_id;
        const eventType = event.event;

        // Update emails_sent record
        if (messageId) {
          if (eventType === 'delivered') {
            await query(
              `UPDATE emails_sent SET status = 'delivered', delivered_at = NOW() WHERE sendgrid_message_id = $1`,
              [messageId]
            ).catch(() => {});
          }
          if (eventType === 'open') {
            await query(
              `UPDATE emails_sent
               SET status = 'opened', opens = opens + 1,
                   first_opened_at = COALESCE(first_opened_at, NOW())
               WHERE sendgrid_message_id = $1`,
              [messageId]
            ).catch(() => {});
          }
          if (eventType === 'click') {
            await query(
              `UPDATE emails_sent
               SET status = 'clicked', clicks = clicks + 1,
                   first_clicked_at = COALESCE(first_clicked_at, NOW())
               WHERE sendgrid_message_id = $1`,
              [messageId]
            ).catch(() => {});
          }
          if (eventType === 'bounce' || eventType === 'dropped') {
            await query(
              `UPDATE emails_sent SET status = 'bounced', bounced_at = NOW() WHERE sendgrid_message_id = $1`,
              [messageId]
            ).catch(() => {});
          }
          if (eventType === 'spamreport') {
            await query(
              `UPDATE emails_sent SET status = 'spam' WHERE sendgrid_message_id = $1`,
              [messageId]
            ).catch(() => {});
          }
          if (eventType === 'unsubscribe' || eventType === 'group_unsubscribe') {
            await query(
              `UPDATE emails_sent SET status = 'unsubscribed' WHERE sendgrid_message_id = $1`,
              [messageId]
            ).catch(() => {});
          }
        }

        // Update lead engagement signals
        if (leadId) {
          if (eventType === 'open') {
            await query(
              `UPDATE leads SET email_opens = email_opens + 1, updated_at = NOW() WHERE id = $1`,
              [leadId]
            ).catch(() => {});
          }

          if (eventType === 'click') {
            await query(
              `UPDATE leads
               SET email_clicks  = email_clicks + 1,
                   intent_score  = LEAST(100, intent_score + 5),
                   updated_at    = NOW()
               WHERE id = $1`,
              [leadId]
            ).catch(() => {});

            // Broadcast intent spike if threshold crossed
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

          if (eventType === 'unsubscribe' || eventType === 'group_unsubscribe' || eventType === 'spamreport') {
            await query(
              `UPDATE leads SET do_not_contact = TRUE, updated_at = NOW() WHERE id = $1`,
              [leadId]
            ).catch(() => {});
            log.info('Lead opted out', { leadId, event: eventType });
          }
        }
      } catch (err) {
        log.error('Webhook event processing failed', { event, err: err.message });
      }
    }

    return { processed: events.length };
  }

  // ─────────────────────────────────────────────
  // Email stats
  // ─────────────────────────────────────────────

  /**
   * Return email engagement stats for a lead.
   * @param {string} leadId
   * @returns {{ totalSent, totalOpened, totalClicked, openRate, clickRate, lastSentAt, history }}
   */
  async getEmailStats(leadId) {
    const rows = await queryAll(
      `SELECT status, opens, clicks, template_name, subject, sent_at, first_opened_at, first_clicked_at
       FROM emails_sent
       WHERE lead_id = $1
       ORDER BY sent_at DESC`,
      [leadId]
    );

    const totalSent    = rows.length;
    const totalOpened  = rows.filter(r => r.opens > 0).length;
    const totalClicked = rows.filter(r => r.clicks > 0).length;
    const lastSentAt   = rows[0]?.sent_at || null;

    return {
      totalSent,
      totalOpened,
      totalClicked,
      openRate:  totalSent > 0 ? (totalOpened / totalSent) : 0,
      clickRate: totalSent > 0 ? (totalClicked / totalSent) : 0,
      lastSentAt,
      history: rows.map(r => ({
        subject:      r.subject,
        template:     r.template_name,
        status:       r.status,
        opens:        r.opens,
        clicks:       r.clicks,
        sentAt:       r.sent_at,
        firstOpened:  r.first_opened_at,
        firstClicked: r.first_clicked_at,
      })),
    };
  }

  // ─────────────────────────────────────────────
  // Enroll in sequence (compatibility)
  // ─────────────────────────────────────────────

  async enrollInSequence(email, sequenceId) {
    log.info('Enrolling lead in nurture sequence', { email, sequenceId });
    // Mark lead for immediate first nurture step
    await query(
      `UPDATE leads
       SET nurture_sequence = $1, nurture_step = 0, next_follow_up_at = NOW()
       WHERE email = $2 AND do_not_contact = FALSE`,
      [sequenceId || 'default', email]
    ).catch(() => {});
    return { ok: true };
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  /**
   * Convert plain text to a simple, readable HTML email body.
   */
  _textToHtml(text) {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const paragraphs = escaped
      .split('\n\n')
      .map(block => {
        const lines = block.split('\n').map(l => l.trimEnd()).join('<br>');
        return `<p style="margin:0 0 16px 0;line-height:1.6">${lines}</p>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:#222;background:#fff;margin:0;padding:0">
  <div style="max-width:600px;margin:40px auto;padding:0 24px 40px">
    ${paragraphs}
    <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
    <p style="font-size:12px;color:#999;margin:0">
      You're receiving this because you signed up at ${this.dashboardUrl}.
      <a href="${this.dashboardUrl}/unsubscribe?email={{email}}" style="color:#999">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;
  }

  _htmlToText(html) {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

export const emailClient = new SendGridClient();
