/**
 * Slack Integration — Real-time alerts, digests, and agent monitoring
 *
 * Supports two delivery modes (in priority order):
 *   1. Bot Token (SLACK_BOT_TOKEN) — uses chat.postMessage API, richer control
 *   2. Incoming Webhook (SLACK_WEBHOOK_URL) — simpler setup, single channel
 *
 * Configure:
 *   SLACK_BOT_TOKEN        — xoxb-... from api.slack.com/apps
 *   SLACK_WEBHOOK_URL      — https://hooks.slack.com/services/... (fallback)
 *   SLACK_CHANNEL_ALERTS   — channel for SQL / agent alerts (default: #sales-alerts)
 *   SLACK_CHANNEL_DIGEST   — channel for weekly digest (default: #marketing)
 *
 * Falls back to console log (info level) when neither is configured.
 *
 * Methods:
 *   sendAlert(channel, title, message, severity) → sends message to Slack channel
 *   sendSQLAlert(lead)                           → SQL lead notification with details
 *   sendAgentFailureAlert(agentName, jobType, error) → agent failure alert
 *   sendWeeklyDigest(kpis)                       → weekly KPI summary
 *   sendBudgetAlert(spent, budget, pct)          → AI budget warning
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const SLACK_API = 'https://slack.com/api';

const DEFAULT_ALERTS_CHANNEL = process.env.SLACK_CHANNEL_ALERTS  || '#sales-alerts';
const DEFAULT_DIGEST_CHANNEL = process.env.SLACK_CHANNEL_DIGEST  || '#marketing';

const SEVERITY_EMOJI = {
  info:     'ℹ️',
  warning:  '⚠️',
  critical: '🚨',
};

const SEVERITY_COLOR = {
  info:     '#36a64f',
  warning:  '#ffb347',
  critical: '#e01e5a',
};

class SlackClient {
  constructor() {
    this.botToken   = process.env.SLACK_BOT_TOKEN  || '';
    this.webhookUrl = config.integrations.slack?.webhookUrl || process.env.SLACK_WEBHOOK_URL || '';
    this.useBot     = Boolean(this.botToken);
    this.useWebhook = Boolean(this.webhookUrl);
    this.configured = this.useBot || this.useWebhook;
  }

  // ─────────────────────────────────────────────
  // Core delivery
  // ─────────────────────────────────────────────

  /**
   * Send a structured alert to a Slack channel.
   *
   * @param {string}  channel   — Slack channel name or ID (e.g. '#sales-alerts', 'C0123456')
   * @param {string}  title     — Alert headline
   * @param {string}  message   — Alert body (supports mrkdwn)
   * @param {string}  [severity='info']  — 'info' | 'warning' | 'critical'
   * @param {Array}   [blocks]  — Optional raw Block Kit blocks (overrides title/message)
   * @returns {{ status: string }}
   */
  async sendAlert(channel, title, message, severity = 'info', blocks = null) {
    if (!this.configured) {
      logger.info('[Slack] Not configured — alert skipped', { channel, title });
      return { status: 'skipped' };
    }

    const emoji      = SEVERITY_EMOJI[severity] || 'ℹ️';
    const color      = SEVERITY_COLOR[severity]  || '#36a64f';
    const resolvedCh = channel || DEFAULT_ALERTS_CHANNEL;

    const payload = blocks
      ? { channel: resolvedCh, blocks }
      : {
          channel:     resolvedCh,
          text:        `${emoji} *${title}*`,
          attachments: [{
            color,
            text:       message,
            mrkdwn_in: ['text'],
            footer:     `LSC Platform • ${new Date().toUTCString()}`,
          }],
        };

    return this._deliver(payload, resolvedCh);
  }

  /**
   * Deliver a payload via Bot Token (preferred) or Incoming Webhook.
   */
  async _deliver(payload, channel) {
    if (this.useBot) {
      return this._postMessage({ ...payload, channel });
    }
    if (this.useWebhook) {
      return this._postWebhook(payload);
    }
    return { status: 'skipped' };
  }

  async _postMessage(payload) {
    try {
      const res = await fetch(`${SLACK_API}/chat.postMessage`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${this.botToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.ok) {
        logger.error('[Slack] chat.postMessage failed', { error: data.error, channel: payload.channel });
        return { status: 'error', error: data.error };
      }

      logger.info('[Slack] Message sent via Bot Token', { channel: payload.channel, ts: data.ts });
      return { status: 'sent', ts: data.ts };

    } catch (err) {
      logger.error('[Slack] Bot Token delivery error', { err: err.message });
      return { status: 'error', error: err.message };
    }
  }

  async _postWebhook(payload) {
    // Webhooks don't support `channel` override — strip it
    const { channel: _, ...webhookPayload } = payload;
    try {
      const res = await fetch(this.webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(webhookPayload),
      });

      if (!res.ok) {
        logger.error('[Slack] Webhook delivery failed', { status: res.status });
        return { status: 'error', httpStatus: res.status };
      }

      logger.info('[Slack] Message sent via Incoming Webhook');
      return { status: 'sent' };

    } catch (err) {
      logger.error('[Slack] Webhook error', { err: err.message });
      return { status: 'error', error: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // SQL lead alert
  // ─────────────────────────────────────────────

  /**
   * Send a hot SQL lead notification with lead details and a dashboard link.
   *
   * @param {object} lead     — Lead row from DB
   * @param {object} [scoring] — Scoring result with intent/fit/engagement scores
   * @param {string} [channel]
   */
  async sendSQLAlert(lead, scoring, channel) {
    const score   = scoring?.composite_score ?? lead?.composite_score ?? '?';
    const routing = scoring?.routing         ?? 'immediate_personal';
    const action  = scoring?.immediate_action;
    const dashUrl = `https://${config.business.domain}`;

    return this._deliver({
      channel: channel || DEFAULT_ALERTS_CHANNEL,
      text:    `🔥 Hot SQL — ${lead.full_name || lead.email} | Score ${score}/100`,
      blocks: [
        {
          type: 'header',
          text: {
            type:  'plain_text',
            text:  `🔥 New SQL Lead — Score ${score}/100`,
            emoji: true,
          },
        },
        {
          type:   'section',
          fields: [
            { type: 'mrkdwn', text: `*Name:*\n${lead.full_name   || 'Unknown'}` },
            { type: 'mrkdwn', text: `*Company:*\n${lead.company  || 'Unknown'}` },
            { type: 'mrkdwn', text: `*Title:*\n${lead.job_title  || 'Unknown'}` },
            { type: 'mrkdwn', text: `*Email:*\n${lead.email}` },
            { type: 'mrkdwn', text: `*Phone:*\n${lead.phone || 'Not provided'}` },
            { type: 'mrkdwn', text: `*Source:*\n${lead.first_touch_channel || 'organic'}` },
          ],
        },
        {
          type:   'section',
          fields: [
            { type: 'mrkdwn', text: `*Routing:*\n${routing}` },
            { type: 'mrkdwn', text: `*Lead ID:*\n\`${lead.id}\`` },
          ],
        },
        action?.message
          ? {
              type: 'section',
              text: { type: 'mrkdwn', text: `*Suggested opener:*\n_${action.message}_` },
            }
          : null,
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: [
              `Intent: *${scoring?.intent_score      ?? lead?.intent_score      ?? '?'}*`,
              `Fit: *${scoring?.fit_score            ?? lead?.fit_score         ?? '?'}*`,
              `Engagement: *${scoring?.engagement_score ?? lead?.engagement_score ?? '?'}*`,
              scoring?.estimated_ltv ? `Est. LTV: *$${scoring.estimated_ltv}*` : null,
            ].filter(Boolean).join('   |   '),
          }],
        },
        {
          type: 'actions',
          elements: [
            {
              type:  'button',
              text:  { type: 'plain_text', text: 'View Lead', emoji: true },
              style: 'primary',
              url:   `${dashUrl}/leads/${lead.id}`,
            },
            {
              type:  'button',
              text:  { type: 'plain_text', text: 'View Pipeline', emoji: true },
              url:   `${dashUrl}/leads`,
            },
          ],
        },
      ].filter(Boolean),
    }, channel || DEFAULT_ALERTS_CHANNEL);
  }

  // ─────────────────────────────────────────────
  // Agent failure alert
  // ─────────────────────────────────────────────

  /**
   * Send an alert when an agent job fails repeatedly.
   *
   * @param {string} agentName
   * @param {string} jobType
   * @param {string|Error} error
   * @param {object} [opts]  — { consecutiveFailures, runId }
   */
  async sendAgentFailureAlert(agentName, jobType, error, opts = {}) {
    const errMsg  = error?.message || String(error);
    const { consecutiveFailures = 1, runId } = opts;
    const dashUrl = `https://${config.business.domain}`;

    return this._deliver({
      channel: DEFAULT_ALERTS_CHANNEL,
      text:    `⚠️ Agent Failure: ${agentName} / ${jobType}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              `*⚠️ Agent Failure Alert*`,
              `*Agent:* \`${agentName}\` — \`${jobType}\``,
              consecutiveFailures > 1 ? `*Consecutive Failures:* ${consecutiveFailures}` : null,
              runId ? `*Run ID:* \`${runId}\`` : null,
              `*Error:*\n\`\`\`${errMsg.slice(0, 500)}\`\`\``,
            ].filter(Boolean).join('\n'),
          },
        },
        {
          type: 'actions',
          elements: [{
            type:  'button',
            text:  { type: 'plain_text', text: 'View Agent Logs', emoji: true },
            url:   `${dashUrl}/agents`,
          }],
        },
      ],
    }, DEFAULT_ALERTS_CHANNEL);
  }

  // ─────────────────────────────────────────────
  // Weekly KPI digest
  // ─────────────────────────────────────────────

  /**
   * Send a weekly KPI summary digest.
   *
   * @param {object} kpis — { leads7d, leads30d, revenue30d, publishedAssets, keywordsPage1, activeExperiments, agentRuns24h, mrrChange? }
   * @param {string} [channel]
   */
  async sendWeeklyDigest(kpis, channel) {
    const dashUrl   = `https://${config.business.domain}`;
    const mrrChange = kpis.mrrChange !== undefined
      ? (kpis.mrrChange >= 0 ? `▲ +$${kpis.mrrChange}` : `▼ -$${Math.abs(kpis.mrrChange)}`)
      : 'N/A';

    return this._deliver({
      channel: channel || DEFAULT_DIGEST_CHANNEL,
      text:    `📊 Weekly Growth Digest — ${new Date().toDateString()}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '📊 Weekly Organic Growth Digest', emoji: true },
        },
        {
          type:   'section',
          fields: [
            { type: 'mrkdwn', text: `*Leads (7d):*\n${kpis.leads7d ?? 'N/A'}` },
            { type: 'mrkdwn', text: `*Leads (30d):*\n${kpis.leads30d ?? 'N/A'}` },
            { type: 'mrkdwn', text: `*Revenue (30d):*\n$${Number(kpis.revenue30d || 0).toLocaleString()}` },
            { type: 'mrkdwn', text: `*MRR Change:*\n${mrrChange}` },
            { type: 'mrkdwn', text: `*Published Content:*\n${kpis.publishedAssets ?? 'N/A'}` },
            { type: 'mrkdwn', text: `*Keywords Page 1:*\n${kpis.keywordsPage1 ?? 'N/A'}` },
          ],
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Active A/B Tests:*\n${kpis.activeExperiments ?? 'N/A'}` },
            { type: 'mrkdwn', text: `*Agent Runs (24h):*\n${kpis.agentRuns24h ?? 'N/A'}` },
          ],
        },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [{
            type:  'button',
            text:  { type: 'plain_text', text: 'View Full Dashboard', emoji: true },
            style: 'primary',
            url:   dashUrl,
          }],
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Generated by LSC Platform • ${new Date().toUTCString()}` }],
        },
      ],
    }, channel || DEFAULT_DIGEST_CHANNEL);
  }

  // ─────────────────────────────────────────────
  // AI Budget alert
  // ─────────────────────────────────────────────

  /**
   * Send an AI budget warning when spend threshold is crossed.
   *
   * @param {number} spent   — Amount spent so far this month (USD)
   * @param {number} budget  — Monthly budget ceiling (USD)
   * @param {number} pct     — Percentage used (0-100)
   * @param {string} [channel]
   */
  async sendBudgetAlert(spent, budget, pct, channel) {
    const severity  = pct >= 100 ? 'critical' : pct >= 90 ? 'warning' : 'info';
    const emoji     = SEVERITY_EMOJI[severity];
    const dashUrl   = `https://${config.business.domain}`;

    return this._deliver({
      channel: channel || DEFAULT_ALERTS_CHANNEL,
      text:    `${emoji} AI Budget ${pct.toFixed(0)}% used — $${spent.toFixed(2)} of $${budget}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              `${emoji} *AI Budget Alert — ${pct.toFixed(0)}% Used*`,
              `*Spent this month:* $${spent.toFixed(2)}`,
              `*Monthly budget:* $${budget.toFixed(2)}`,
              `*Remaining:* $${Math.max(0, budget - spent).toFixed(2)}`,
              pct >= 100
                ? '\n:rotating_light: *Budget exhausted — AI actions paused until next period.*'
                : pct >= 90
                  ? '\n:warning: Approaching budget limit. Review agent schedules if needed.'
                  : '',
            ].filter(Boolean).join('\n'),
          },
        },
        {
          type: 'actions',
          elements: [{
            type: 'button',
            text: { type: 'plain_text', text: 'View Revenue Dashboard', emoji: true },
            url:  `${dashUrl}/revenue`,
          }],
        },
      ],
    }, channel || DEFAULT_ALERTS_CHANNEL);
  }

  // ─────────────────────────────────────────────
  // Legacy compatibility
  // ─────────────────────────────────────────────

  /**
   * Legacy method: accepts { text, blocks } or { lead, scoring } for SQL alerts.
   * Kept for backward compatibility with existing agent code.
   */
  async sendAlertLegacy({ text, blocks } = {}) {
    if (!this.configured) {
      logger.info('[Slack] No webhook URL configured — alert skipped', { text });
      return { status: 'skipped' };
    }

    return this._deliver(
      { channel: DEFAULT_ALERTS_CHANNEL, text, ...(blocks ? { blocks } : {}) },
      DEFAULT_ALERTS_CHANNEL
    );
  }

  async sendAgentFailureAlertLegacy({ agent, jobType, errorMessage, consecutiveFailures }) {
    return this.sendAgentFailureAlert(agent, jobType, errorMessage, { consecutiveFailures });
  }

  async sendSQLAlertLegacy({ lead, scoring }) {
    return this.sendSQLAlert(lead, scoring);
  }
}

export const slackClient = new SlackClient();
