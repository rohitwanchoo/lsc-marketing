/**
 * Agent 3: Authority & Trust Content Agent
 *
 * Purpose: Create credibility assets that close deals
 * Rule: If it doesn't build trust or remove buying friction → don't publish
 * Channels: LinkedIn (primary), Blog (secondary), Email (mandatory)
 */

import { callAI, parseJSON } from '../utils/ai.js';
import { queryAll, queryOne, query } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { eventBus } from '../events/event-bus.js';
import { v4 as uuidv4 } from 'uuid';

const log = agentLogger('authority_content');

const SYSTEM_PROMPT = `You are the Authority & Trust Content Agent for ${config.business.companyName}.

You create content that removes buying friction and builds the credibility needed to close deals.
You are NOT a content marketing machine. You are a trust-building, objection-handling, deal-closing content strategist.

ICP: ${config.business.icp}
Value proposition: ${config.business.valueProposition}

CONTENT PRINCIPLES:
1. Pain-first narrative — lead with the problem the reader faces
2. Specificity over generality — "27% increase in lead quality" beats "better leads"
3. Show the work — behind-the-scenes execution, not just results
4. Founder voice — human, direct, opinionated — not corporate
5. Objection handling embedded — address the top 3 reasons people don't buy
6. One clear CTA — book a call, not "learn more"

TRUST SIGNALS to weave in: specific results, named clients (or anonymous with metrics),
frameworks developed, mistakes made, time savings, cost savings.

Output structured JSON only.`;

export class AuthorityContentAgent {
  constructor() {
    this.name = 'authority_content';
  }

  /**
   * Generate a case study from customer results data
   */
  async generateCaseStudy({ customerData, results, industry }) {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Generating case study', { runId, industry });

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'case_study_generation',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Write a revenue-converting case study.

Customer data: ${JSON.stringify(customerData)}
Results achieved: ${JSON.stringify(results)}
Industry: ${industry}

STRUCTURE:
1. Headline: Specific result achieved (numbers required)
2. The Situation: What was broken before (their pain)
3. The Turning Point: What they decided and why
4. The Implementation: What we did (show the work)
5. The Outcome: Hard numbers only — no adjectives
6. What They Said: Realistic testimonial quote
7. Is This You?: Qualification questions + CTA

Return JSON:
{
  "headline": "...",
  "meta_description": "...",
  "slug": "...",
  "body_markdown": "full markdown content",
  "linkedin_post": "...",
  "email_version": { "subject": "...", "body": "..." },
  "key_metrics": ["metric1", "metric2"],
  "objections_handled": ["..."],
  "cta": "..."
}`,
      }],
      maxTokens: 5000,
    });

    const caseStudy = parseJSON(content);
    const contentId = uuidv4();

    await query(
      `INSERT INTO content_assets
         (id, title, slug, content_type, status, body_markdown, meta_title, meta_description, generated_by)
       VALUES ($1, $2, $3, 'case_study', 'review', $4, $2, $5, 'authority_content')`,
      [contentId, caseStudy.headline, caseStudy.slug, caseStudy.body_markdown, caseStudy.meta_description]
    );

    await this._logRun(runId, 'case_study_generation', 'success',
      { industry }, { contentId }, inputTokens + outputTokens, costUsd, Date.now() - start);

    return { contentId, caseStudy };
  }

  /**
   * Generate weekly founder LinkedIn content strategy
   */
  async generateLinkedInStrategy({ weekTheme, recentWins, icp, painPoints, productId = null, productContext = null }) {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Generating LinkedIn strategy', { runId, weekTheme, productId });

    // Get top-performing past posts for pattern learning
    const topPosts = await queryAll(
      `SELECT post_body, impressions, engagements, leads_generated
       FROM social_posts WHERE platform = 'linkedin'
       ORDER BY leads_generated DESC LIMIT 5`
    );

    // Fetch top keywords for this product (or globally if no product)
    const keywords = await queryAll(
      productId
        ? `SELECT keyword, intent FROM keywords WHERE product_id = $1 ORDER BY priority_score DESC LIMIT 15`
        : `SELECT keyword, intent FROM keywords ORDER BY priority_score DESC LIMIT 15`,
      productId ? [productId] : []
    );
    const keywordList = keywords.map(k => k.keyword);

    const productSection = productContext ? `
PRODUCT CONTEXT — every post must promote this product and address its buyers:
- Product: ${productContext.name || ''}
- ICP: ${productContext.icp || icp || config.business.icp}
- Value proposition: ${productContext.valueProposition || ''}
- Website: ${productContext.websiteUrl || ''}
- Competitors to position against: ${(productContext.competitors || []).join(', ')}
- Mention the product name naturally in at least 3 of the 5 posts
` : `
ICP: ${icp || config.business.icp}
`;

    const keywordSection = keywordList.length ? `
TARGET KEYWORDS — weave these naturally into post copy (don't force them, but use as many as fit):
${keywordList.join(', ')}
` : '';

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'linkedin_strategy',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Create a 5-post LinkedIn content strategy for this week.
${productSection}
${keywordSection}
Theme: ${weekTheme || 'solving the core ICP pain point'}
Recent wins to share: ${JSON.stringify(recentWins)}
Top performing past posts (learn from these): ${JSON.stringify(topPosts)}

For each post:
- Type: insight|story|framework|case_study|controversial_opinion
- Write from the perspective of a founder/expert who built ${productContext?.name || 'the product'} to solve this pain
- Must promote the product naturally — not a hard sell, but readers should know what we offer
- Hook must stop scroll in first line
- No buzzwords, no fluff
- Each post MUST end with a clear CTA (e.g. "DM me 'DEMO' to see it in action", "Comment below and I'll send you the framework", "Book a free call: [link]") — include the CTA as the final line of the body
- Embed 2-3 target keywords naturally in each post

Return JSON:
{
  "weekly_theme": "...",
  "posts": [
    {
      "day": "Monday|Tuesday|Wednesday|Thursday|Friday",
      "type": "...",
      "hook": "first line that stops scroll",
      "body": "full post text with line breaks — CTA must be the final line",
      "cta": "standalone CTA text repeated from the end of body",
      "keywords_used": ["kw1", "kw2"],
      "hashtags": [...],
      "expected_intent_signals": "...",
      "repurpose_to": ["email|blog|thread"]
    }
  ],
  "engagement_triggers": "what questions to reply to that signal buying intent",
  "dm_response_templates": [
    { "trigger": "...", "response": "..." }
  ]
}`,
      }],
      maxTokens: 5000,
    });

    const strategy = parseJSON(content);

    // Schedule posts
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);

    for (const post of strategy.posts || []) {
      // Guard against AI returning null/undefined for required fields
      const postDay  = post.day  || 'Monday';
      const postType = post.type || 'insight';

      const dayOffset = ['Monday','Tuesday','Wednesday','Thursday','Friday'].indexOf(postDay);
      const scheduledAt = new Date(weekStart);
      scheduledAt.setDate(scheduledAt.getDate() + Math.max(0, dayOffset));
      scheduledAt.setHours(9, 0, 0, 0); // 9 AM

      // Save as content asset — exclude product_id column when it is undefined/null
      // to avoid inserting a NULL into a NOT NULL column.
      const assetId = uuidv4();
      if (productId != null) {
        await query(
          `INSERT INTO content_assets
             (id, title, content_type, status, body_markdown, channel, generated_by, product_id)
           VALUES ($1, $2, 'social_post', 'draft', $3, 'linkedin', 'authority_content', $4)`,
          [assetId, `LinkedIn: ${postType} — ${postDay}`, post.body, productId]
        );
      } else {
        await query(
          `INSERT INTO content_assets
             (id, title, content_type, status, body_markdown, channel, generated_by)
           VALUES ($1, $2, 'social_post', 'draft', $3, 'linkedin', 'authority_content')`,
          [assetId, `LinkedIn: ${postType} — ${postDay}`, post.body]
        );
      }

      // Queue in social_posts table — body already contains CTA as final line
      const fullBody = `${post.hook || ''}\n\n${post.body || ''}`.trim();
      await query(
        `INSERT INTO social_posts (content_asset_id, platform, post_body, hashtags, scheduled_at)
         VALUES ($1, 'linkedin', $2, $3, $4)`,
        [assetId, fullBody, post.hashtags || [], scheduledAt]
      );

      // Mark the content asset as published now that it's queued for distribution
      await query(
        `UPDATE content_assets SET status = 'published', published_at = $1 WHERE id = $2`,
        [scheduledAt, assetId]
      );

      // Emit so the event bus can trigger repurposing to other channels
      await eventBus.emit('content.published', {
        contentId:   assetId,
        contentType: 'social_post',
        title:       `LinkedIn: ${postType} — ${postDay}`,
        slug:        null,
      }).catch(() => {}); // non-blocking
    }

    await this._logRun(runId, 'linkedin_strategy', 'success',
      { weekTheme }, strategy, inputTokens + outputTokens, costUsd, Date.now() - start);

    log.info('LinkedIn strategy created', { runId, posts: strategy.posts?.length });
    return strategy;
  }

  /**
   * Generate email nurture sequence for a specific lead stage
   */
  async generateNurtureSequence({ targetStage, painPoints, objections, productBenefits }) {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Generating nurture sequence', { runId, targetStage });

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'nurture_sequence',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Create a 7-email nurture sequence for leads at stage: ${targetStage}

Pain points: ${JSON.stringify(painPoints)}
Common objections: ${JSON.stringify(objections)}
Key product benefits: ${JSON.stringify(productBenefits)}

SEQUENCE STRUCTURE:
Email 1 (Day 0): Welcome + immediate value delivery
Email 2 (Day 2): Pain deepening — make the problem feel urgent
Email 3 (Day 4): Case study — show the transformation
Email 4 (Day 6): Objection crusher — tackle the #1 reason people don't buy
Email 5 (Day 9): Social proof + community
Email 6 (Day 12): Direct offer — book a call / start trial
Email 7 (Day 16): Last chance + future cost of inaction

Return JSON:
{
  "sequence_name": "...",
  "emails": [
    {
      "day": number,
      "subject": "...",
      "preview_text": "...",
      "body": "...",
      "cta": "...",
      "goal": "..."
    }
  ]
}`,
      }],
      maxTokens: 6000,
    });

    const sequence = parseJSON(content);

    await query(
      `INSERT INTO nurture_sequences (name, trigger_stage, steps, created_by)
       VALUES ($1, $2, $3, 'authority_content')`,
      [sequence.sequence_name, targetStage, JSON.stringify(sequence.emails)]
    );

    await this._logRun(runId, 'nurture_sequence', 'success',
      { targetStage }, { sequenceName: sequence.sequence_name, emailCount: sequence.emails?.length },
      inputTokens + outputTokens, costUsd, Date.now() - start);

    return sequence;
  }

  /**
   * Detect and remediate decaying or dead content using Python analytics API.
   *
   * DECAYING content (traffic dropping, conversion declining):
   *   → Mark for review, queue AI-powered refresh, update meta/CTAs
   *
   * DEAD content (no traffic, no leads for 60+ days after publication):
   *   → Auto-kill + extract best insights → repurpose as LinkedIn posts
   */
  async remediateDecayingContent() {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Running content decay remediation', { runId });

    // Fetch published content performance data
    const publishedContent = await queryAll(
      `SELECT id, title, slug, content_type, body_markdown, pageviews, leads_generated,
              conversion_rate, published_at, revenue_attr, word_count
       FROM content_assets
       WHERE status = 'published'
         AND published_at <= NOW() - INTERVAL '14 days'
       ORDER BY published_at ASC
       LIMIT 100`
    );

    if (!publishedContent.length) {
      log.info('No published content old enough to assess decay');
      return { assessed: 0, decaying: 0, dead: 0 };
    }

    // Call Python decay detection API
    let decayResults = null;
    try {
      const res = await fetch(`${config.pythonApiUrl}/content/decay-detection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: publishedContent.map(c => ({
            id:              c.id,
            title:           c.title,
            published_at:    c.published_at,
            pageviews:       c.pageviews       || 0,
            leads_generated: c.leads_generated || 0,
            conversion_rate: parseFloat(c.conversion_rate) || 0,
            revenue_attr:    parseFloat(c.revenue_attr)    || 0,
            days_published:  Math.floor((Date.now() - new Date(c.published_at).getTime()) / 86_400_000),
          })),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) decayResults = await res.json();
    } catch (err) {
      log.warn('Python decay API unavailable — using heuristics', { err: err.message });
    }

    // Fallback heuristics when Python API is down
    if (!decayResults?.content_analysis) {
      const now = Date.now();
      decayResults = {
        content_analysis: publishedContent.map(c => {
          const daysSincePublish = (now - new Date(c.published_at).getTime()) / 86_400_000;
          const leadsPerDay = (c.leads_generated || 0) / Math.max(daysSincePublish, 1);
          let status = 'HEALTHY';
          if (daysSincePublish > 60 && (c.leads_generated || 0) === 0) status = 'DEAD';
          else if (daysSincePublish > 30 && leadsPerDay < 0.01) status = 'DECAYING';
          return { id: c.id, status, recommended_action: status === 'DEAD' ? 'kill_and_repurpose' : 'refresh' };
        }),
      };
    }

    let decaying = 0, dead = 0;
    const actions = [];

    for (const result of decayResults.content_analysis || []) {
      const asset = publishedContent.find(c => c.id === result.id);
      if (!asset) continue;

      if (result.status === 'DEAD') {
        // Auto-kill the content
        await query(
          `UPDATE content_assets
             SET status = 'killed', killed_at = NOW(),
                 kill_reason = 'Auto-killed by decay agent: no leads/traffic in 60+ days'
           WHERE id = $1`,
          [asset.id]
        );

        // Repurpose best insights into a LinkedIn post
        if (asset.body_markdown || asset.title) {
          const { content: postContent, inputTokens, outputTokens, costUsd } = await callAI({
            agentName: this.name,
            jobType:   'decay_repurpose',
            system:    SYSTEM_PROMPT,
            messages: [{
              role:    'user',
              content: `This content piece failed to generate leads. Extract the 1-2 most valuable insights and rewrite them as a punchy LinkedIn post.

Title: ${asset.title}
${asset.body_markdown ? `Content excerpt: ${asset.body_markdown.slice(0, 800)}` : ''}

Requirements:
- Start with a strong hook (not the title)
- Share the insight as if you discovered it personally
- End with a question to drive comments
- Max 200 words
- No link in the post

Return JSON: { "hook": "...", "body": "...", "hashtags": [...] }`,
            }],
            maxTokens: 600,
          });

          const post = parseJSON(postContent);
          const assetId = uuidv4();

          await query(
            `INSERT INTO content_assets (id, title, content_type, status, body_markdown, channel, generated_by)
             VALUES ($1, $2, 'social_post', 'published', $3, 'linkedin', 'authority_content')`,
            [assetId, `Repurposed: ${asset.title}`, `${post.hook}\n\n${post.body}`]
          );

          const scheduledAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
          scheduledAt.setHours(9, 0, 0, 0);

          await query(
            `INSERT INTO social_posts (content_asset_id, platform, post_body, hashtags, scheduled_at)
             VALUES ($1, 'linkedin', $2, $3, $4)`,
            [assetId, `${post.hook}\n\n${post.body}`, post.hashtags || [], scheduledAt]
          );

          actions.push({ assetId: asset.id, action: 'killed_and_repurposed', newPostId: assetId });
        }

        dead++;

      } else if (result.status === 'DECAYING') {
        // Mark for review and queue an SEO audit
        await query(
          `UPDATE content_assets SET status = 'review', updated_at = NOW() WHERE id = $1`,
          [asset.id]
        );

        const { queues } = await import('../queues/index.js');
        await queues.dispatch('seo_demand_capture', 'technical_audit', {
          urgentContentId: asset.id,
        }, { priority: 2 });

        actions.push({ assetId: asset.id, action: 'marked_for_refresh', status: result.status });
        decaying++;
      }
    }

    await this._logRun(runId, 'decay_remediation', 'success',
      { assessed: publishedContent.length },
      { decaying, dead, actions },
      0, 0, Date.now() - start);

    log.info('Decay remediation complete', { runId, decaying, dead });
    return { assessed: publishedContent.length, decaying, dead, actions };
  }

  /**
   * Repurpose a content asset into platform-specific social posts
   */
  async repurposeContent({ contentAssetId, platforms = ['linkedin'] }) {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Repurposing content', { runId, contentAssetId, platforms });

    const asset = await queryOne(
      `SELECT id, title, body_markdown, content_type FROM content_assets WHERE id = $1`,
      [contentAssetId]
    );
    if (!asset) throw new Error(`Content asset ${contentAssetId} not found`);

    const PLATFORM_PROMPTS = {
      linkedin: `Write a LinkedIn post (max 1300 chars) based on this content. Lead with a hook, add 3-5 insights, end with a question. Include 3 relevant hashtags.`,
      twitter:  `Write a Twitter/X thread (5 tweets, each < 280 chars) based on this content. Number each tweet 1/5 etc.`,
      email:    `Write a brief email newsletter snippet (max 300 words) based on this content.`,
    };

    let totalTokens = 0, totalCost = 0;
    const created = [];

    for (const platform of platforms) {
      const prompt = PLATFORM_PROMPTS[platform] || PLATFORM_PROMPTS.linkedin;
      const { content, inputTokens, outputTokens, costUsd } = await callAI({
        agentName: this.name,
        jobType:   'repurpose_content',
        system:    SYSTEM_PROMPT,
        messages:  [{
          role: 'user',
          content: `${prompt}\n\nTitle: ${asset.title}\n\nContent:\n${(asset.body_markdown || '').slice(0, 4000)}`,
        }],
        maxTokens: 1000,
      });
      totalTokens += inputTokens + outputTokens;
      totalCost   += costUsd;

      const postId = uuidv4();
      await query(
        `INSERT INTO social_posts (id, platform, caption, post_body, status, content_asset_id)
         VALUES ($1, $2, $3, $3, 'draft', $4)`,
        [postId, platform, content, contentAssetId]
      );
      created.push({ postId, platform });
    }

    eventBus.emit('content.published', { contentAssetId, platforms, type: 'repurpose' }).catch(() => {});

    await this._logRun(runId, 'repurpose_content', 'success',
      { contentAssetId, platforms }, { created }, totalTokens, totalCost, Date.now() - start);

    log.info('Repurpose complete', { runId, created: created.length });
    return { created };
  }

  async _logRun(id, jobType, status, input, output, tokens, costUsd, durationMs, error = null) {
    await query(
      `INSERT INTO agent_runs (id, agent, job_type, status, input, output, tokens_used, cost_usd, duration_ms, error, completed_at, triggered_by)
       VALUES ($1, 'authority_content', $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'scheduler')`,
      [id, jobType, status, JSON.stringify(input), JSON.stringify(output), tokens, costUsd, durationMs, error]
    );
  }
}
