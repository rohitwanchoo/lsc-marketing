/**
 * Agent 4: Social Distribution & Engagement Agent
 *
 * Purpose: Turn attention into inbound leads
 * Rule: Track intent signals, not vanity metrics
 * Output: Profile visits → DMs → CRM entries
 */

import { callAI, parseJSON } from '../utils/ai.js';
import { queryAll, queryOne, query } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { v4 as uuidv4 } from 'uuid';

const log = agentLogger('social_distribution');

const SYSTEM_PROMPT = `You are the Social Distribution Agent for ${config.business.companyName}.

Your job is to convert organic social attention into measurable pipeline.
You track what actually drives DMs, profile visits, and link clicks — not likes.

Platform strategy:
- LinkedIn: Thought leadership, case studies, insights (primary)
- Twitter/X: Threads, quick insights, engagement (secondary)
- Primary CTA: Book a call or download lead magnet — not "follow for more"

Intent signals that matter:
- Comment asking "how does this work?"
- DM starting with "we're struggling with..."
- Multiple profile visits from same company
- Saving/sharing the post

Output structured JSON only.`;

export class SocialDistributionAgent {
  constructor() {
    this.name = 'social_distribution';
  }

  /**
   * Repurpose a long-form content asset into platform-native posts
   */
  async repurposeContent({ contentAssetId, platforms = ['linkedin', 'twitter'] }) {
    const runId = uuidv4();
    const start = Date.now();

    const asset = await queryOne(
      `SELECT title, body_markdown, content_type FROM content_assets WHERE id = $1`,
      [contentAssetId]
    );

    if (!asset) {
      log.warn('Content asset not found', { contentAssetId });
      return null;
    }

    log.info('Repurposing content', { runId, title: asset.title, platforms });

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'content_repurpose',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Repurpose this content for social media platforms.

Original content:
Title: ${asset.title}
Type: ${asset.content_type}
Body: ${(asset.body_markdown || '').substring(0, 3000)}

Target platforms: ${platforms.join(', ')}

For each platform, create native-format content that:
1. Works WITHOUT clicking a link (standalone value)
2. Creates enough curiosity that they visit our profile
3. Has a subtle CTA to book a call or get the full piece

Return JSON:
{
  "repurposings": [
    {
      "platform": "linkedin|twitter|instagram",
      "format": "post|thread|carousel|story",
      "content": "...",
      "hashtags": [...],
      "cta": "...",
      "best_time_to_post": "HH:MM",
      "intent_signal_to_watch": "..."
    }
  ]
}`,
      }],
      maxTokens: 4000,
    });

    const repurposed = parseJSON(content);

    // Queue posts for scheduling
    for (const item of repurposed.repurposings || []) {
      const [hour, minute] = (item.best_time_to_post || '09:00').split(':').map(Number);
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 1);
      scheduledAt.setHours(hour, minute, 0, 0);

      await query(
        `INSERT INTO social_posts (content_asset_id, platform, post_body, hashtags, scheduled_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [contentAssetId, item.platform, item.content, item.hashtags, scheduledAt]
      );
    }

    await this._logRun(runId, 'content_repurpose', 'success',
      { contentAssetId }, repurposed, inputTokens + outputTokens, costUsd, Date.now() - start);

    return repurposed;
  }

  /**
   * Analyze engagement data and classify lead intent from social activity
   */
  async analyzeEngagementSignals({ platform = 'linkedin', engagementData }) {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Analyzing engagement signals', { runId, platform });

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'engagement_analysis',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analyze these social engagement signals and classify buyer intent.

Platform: ${platform}
Engagement data: ${JSON.stringify(engagementData)}

For each person who engaged, score their buying intent:
- HIGH (score 70-100): Ready to be contacted, showing clear buying signals
- MEDIUM (score 40-69): Interested, needs nurturing
- LOW (score 0-39): Casual engagement, no action needed

Return JSON:
{
  "high_intent_leads": [
    {
      "profile": "...",
      "signal": "...",
      "recommended_action": "send_dm|invite_to_call|add_to_nurture",
      "dm_template": "...",
      "intent_score": number
    }
  ],
  "medium_intent_leads": [...],
  "insights": "...",
  "top_performing_post": "...",
  "next_content_recommendation": "..."
}`,
      }],
      maxTokens: 3000,
    });

    const analysis = parseJSON(content);

    // Auto-create lead records for high-intent signals
    for (const lead of analysis.high_intent_leads || []) {
      if (lead.profile?.email) {
        await query(
          `INSERT INTO leads (email, full_name, linkedin_url, first_touch_channel, intent_score, stage)
           VALUES ($1, $2, $3, 'linkedin', $4, 'prospect')
           ON CONFLICT (email) DO UPDATE SET intent_score = GREATEST(leads.intent_score, EXCLUDED.intent_score)`,
          [lead.profile.email, lead.profile.name, lead.profile.url, lead.intent_score]
        ).catch(err => log.warn('Lead insert conflict', { err: err.message }));
      }
    }

    await this._logRun(runId, 'engagement_analysis', 'success',
      { platform }, analysis, inputTokens + outputTokens, costUsd, Date.now() - start);

    return analysis;
  }

  /**
   * Generate platform-specific A/B test variants for top posts
   */
  async generateABVariants({ postId, platform, originalPost }) {
    const runId = uuidv4();

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'ab_variant_generation',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Create 2 A/B test variants for this ${platform} post.

Original post:
${originalPost}

Create variants that test ONE variable at a time:
- Variant A: Different hook (first line)
- Variant B: Different CTA/ending

Keep the middle content the same to isolate the variable.

Return JSON:
{
  "test_variable": "hook|cta|format",
  "variant_a": { "content": "...", "hypothesis": "..." },
  "variant_b": { "content": "...", "hypothesis": "..." },
  "success_metric": "dm_count|link_clicks|profile_visits",
  "run_duration_days": number
}`,
      }],
      maxTokens: 2000,
    });

    const variants = parseJSON(content);

    // Create experiment record
    const experimentId = uuidv4();
    await query(
      `INSERT INTO experiments (id, name, hypothesis, element, status)
       VALUES ($1, $2, $3, $4, 'running')`,
      [
        experimentId,
        `${platform} post AB test — ${new Date().toISOString().split('T')[0]}`,
        `Testing ${variants.test_variable} variation on ${platform}`,
        variants.test_variable,
      ]
    );

    await this._logRun(runId, 'ab_variant_generation', 'success',
      { postId, platform }, variants, inputTokens + outputTokens, costUsd, Date.now() - start);

    return { experimentId, variants };
  }

  async _logRun(id, jobType, status, input, output, tokens, costUsd, durationMs, error = null) {
    await query(
      `INSERT INTO agent_runs (id, agent, job_type, status, input, output, tokens_used, cost_usd, duration_ms, error, completed_at, triggered_by)
       VALUES ($1, 'social_distribution', $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'scheduler')`,
      [id, jobType, status, JSON.stringify(input), JSON.stringify(output), tokens, costUsd, durationMs, error]
    );
  }
}
