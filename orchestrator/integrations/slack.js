/**
 * Slack Integration — Real-time sales alerts via incoming webhooks
 *
 * Configure: SLACK_WEBHOOK_URL env var
 * Falls back to console log when not configured.
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';

class SlackClient {
  constructor() {
    this.webhookUrl = config.integrations.slack?.webhookUrl || '';
  }

  /**
   * Send a generic alert to Slack
   * @param {object} opts - { text, blocks }
   */
  async sendAlert({ text, blocks } = {}) {
    if (!this.webhookUrl) {
      logger.info('[Slack] No webhook URL configured — alert skipped', { text });
      return { status: 'skipped' };
    }

    const body = blocks ? { blocks } : { text };

    try {
      const resp = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        logger.error('[Slack] Webhook request failed', { httpStatus: resp.status });
        return { status: 'error', httpStatus: resp.status };
      }

      logger.info('[Slack] Alert sent', { text: text?.slice(0, 80) });
      return { status: 'sent' };
    } catch (err) {
      logger.error('[Slack] Webhook error', { err: err.message });
      return { status: 'error', err: err.message };
    }
  }

  /**
   * Send a hot SQL lead alert to the sales channel
   * Triggered when composite_score > 80
   */
  async sendSQLAlert({ lead, scoring }) {
    const score = scoring?.composite_score ?? lead?.composite_score ?? '?';
    const routing = scoring?.routing ?? 'immediate_personal';
    const action = scoring?.immediate_action;

    return this.sendAlert({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🔥 Hot SQL — Score ${score}/100`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Name:*\n${lead.full_name || 'Unknown'}` },
            { type: 'mrkdwn', text: `*Company:*\n${lead.company || 'Unknown'}` },
            { type: 'mrkdwn', text: `*Title:*\n${lead.job_title || 'Unknown'}` },
            { type: 'mrkdwn', text: `*Email:*\n${lead.email}` },
            { type: 'mrkdwn', text: `*Source:*\n${lead.first_touch_channel || 'organic'}` },
            { type: 'mrkdwn', text: `*Routing:*\n${routing}` },
          ],
        },
        action?.message
          ? {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Suggested opener:*\n_${action.message}_`,
              },
            }
          : null,
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Intent: ${scoring?.intent_score ?? '?'} | Fit: ${scoring?.fit_score ?? '?'} | Engagement: ${scoring?.engagement_score ?? '?'} | Est. LTV: $${scoring?.estimated_ltv ?? '?'}`,
            },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Lead', emoji: true },
              style: 'primary',
              url: `https://${config.business.domain}/leads/${lead.id}`,
            },
          ],
        },
      ].filter(Boolean),
    });
  }

  /**
   * Alert when an agent fails repeatedly
   */
  async sendAgentFailureAlert({ agent, jobType, errorMessage, consecutiveFailures }) {
    return this.sendAlert({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*⚠️ Agent Failure Alert*\n*Agent:* \`${agent}\` — \`${jobType}\`\n*Failures:* ${consecutiveFailures} consecutive\n*Error:* ${errorMessage?.slice(0, 200)}`,
          },
        },
      ],
    });
  }
}

export const slackClient = new SlackClient();
