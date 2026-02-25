/**
 * Agent 2: SEO Demand Capture
 *
 * Purpose: Capture existing buying intent via organic search
 * Focus: BOFU/MOFU keywords → landing pages → leads → revenue
 * Rule: Every page must assist conversion, not just rank
 */

import { callAI, parseJSON } from '../utils/ai.js';
import { queryAll, queryOne, query } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { cmsClient } from '../integrations/cms.js';
import { eventBus } from '../events/event-bus.js';
import { seoDataClient } from '../integrations/ahrefs-mock.js';
import { v4 as uuidv4 } from 'uuid';

const log = agentLogger('seo_demand_capture');

const SYSTEM_PROMPT = `You are the SEO Demand Capture Agent for ${config.business.companyName}.

Your mission: Find high-intent keywords people use when they're READY TO BUY, then create
conversion-optimized pages that turn organic traffic into qualified leads.

ICP: ${config.business.icp}
Domain: ${config.business.domain}
Value prop: ${config.business.valueProposition}

PRIORITY KEYWORD TYPES (in order):
1. "alternative to [competitor]" — highest buying intent
2. "[product category] pricing" — price-comparison intent
3. "[product] reviews 2026" — bottom-of-funnel research
4. "[use case] software" — problem-aware buyers
5. "[competitor] vs [us]" — direct comparison

SEO QUALITY STANDARDS:
- EEAT: Experience, Expertise, Authoritativeness, Trustworthiness
- Semantic coverage: answer all related questions
- Conversion elements on every page: CTA, social proof, lead magnet
- Internal links to money pages
- Schema markup recommendations

Output structured JSON only. No fluff.`;

export class SEODemandCaptureAgent {
  constructor() {
    this.name = 'seo_demand_capture';
  }

  /**
   * Research and prioritize new BOFU/MOFU keywords
   */
  async discoverKeywords({ seedKeywords = [], competitors = [], productId = null, productContext = null } = {}) {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Starting keyword discovery', { runId, seedKeywords, productId });

    // Get existing keywords to avoid duplicates (scoped to product if provided)
    const existingKeywords = await queryAll(
      productId
        ? `SELECT keyword FROM keywords WHERE product_id = $1 ORDER BY priority_score DESC LIMIT 100`
        : `SELECT keyword FROM keywords ORDER BY priority_score DESC LIMIT 100`,
      productId ? [productId] : []
    );
    const existingSet = new Set(existingKeywords.map(k => k.keyword));

    // Build context from product profile when available
    const productSection = productContext ? `
PRODUCT CONTEXT:
- Product name: ${productContext.name || 'Unknown'}
- Description: ${productContext.description || ''}
- ICP: ${productContext.icp || config.business.icp}
- Value proposition: ${productContext.value_proposition || config.business.valueProposition}
- Features: ${(productContext.features || []).join(', ')}
- Competitors: ${[...(productContext.competitors || []), ...competitors].join(', ') || 'Derive from industry knowledge'}
- Pain points solved: ${(productContext.pain_points_solved || []).join(', ')}

CRITICAL INSTRUCTION — think like the SEARCHER, not the brand:
Generate keywords that a potential buyer types into Google BEFORE they know this product exists.
They are searching because they have a PROBLEM. They don't know the brand name yet.

Examples of the RIGHT approach (problem-first):
- "how to record sales calls automatically"
- "best call recording software for small business"
- "call analytics tool for sales teams"
- "improve sales call quality"

Examples of the WRONG approach (brand-first — DO NOT do this):
- "${productContext.name || 'product'} review"
- "${productContext.name || 'product'} pricing"
- "${productContext.name || 'product'} alternative"

Focus on: what problem does the ICP have? What do they search when frustrated with their current situation?
` : `
Business ICP: ${config.business.icp}
Value prop: ${config.business.valueProposition}
Competitors: ${competitors.join(', ') || 'Derive from industry knowledge'}

CRITICAL: Generate problem-first keywords — what does the ICP search when they have the problem, before knowing any solution brand.
`;

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'keyword_discovery',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Research and prioritize 15 high-intent keywords for organic lead generation. Keep each field concise (under 20 words).
${productSection}
Seed keywords: ${seedKeywords.join(', ') || 'None provided — derive from product context above'}
Already targeting: ${[...existingSet].slice(0, 20).join(', ')}

Focus on keywords where:
1. Search intent = buy or evaluate (BOFU/MOFU) — searcher has the PROBLEM, looking for a SOLUTION
2. The keyword reflects a pain, task, or goal — NOT a brand name or product name
3. We can realistically rank within 90 days (prefer difficulty < 50)
4. A landing page targeting this keyword can capture email or book a call
5. EXCLUDE any keyword containing the product/brand name — these are not organic discovery keywords

Return ONLY valid JSON (no markdown, no commentary):
{
  "keywords": [
    {
      "keyword": "string",
      "intent": "BOFU|MOFU|TOFU",
      "estimated_volume": 0,
      "difficulty": 0,
      "estimated_cpc": 0.0,
      "page_type": "landing_page|comparison|use_case|pricing",
      "conversion_angle": "string",
      "priority_score": 0,
      "why_revenue_positive": "string"
    }
  ],
  "competitor_gap_opportunities": [
    { "keyword": "string", "competitor_ranking": "string", "our_opportunity": "string" }
  ],
  "quick_wins": ["keyword1", "keyword2"],
  "strategic_plays": ["keyword1", "keyword2"]
}`,
      }],
      maxTokens: 8192,
    });

    const research = parseJSON(content);

    // Persist keywords to database (linked to product if provided)
    let inserted = 0;
    for (const kw of research.keywords || []) {
      if (existingSet.has(kw.keyword)) continue;
      await query(
        `INSERT INTO keywords (keyword, intent, search_volume, difficulty, cpc_usd, priority_score, product_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (keyword) DO UPDATE SET priority_score = EXCLUDED.priority_score, product_id = COALESCE(keywords.product_id, EXCLUDED.product_id)`,
        [kw.keyword, kw.intent, kw.estimated_volume, kw.difficulty, kw.estimated_cpc, kw.priority_score, productId]
      );
      inserted++;
    }

    await this._logRun(runId, 'keyword_discovery', 'success',
      { seedKeywords, productId }, research, inputTokens + outputTokens, costUsd, Date.now() - start);

    log.info('Keyword discovery complete', { runId, inserted, total: research.keywords?.length, productId });
    return research;
  }

  /**
   * Generate a conversion-optimized page for a target keyword
   */
  async generatePage({ keywordId, keyword, pageType, conversionAngle }) {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Generating SEO page', { runId, keyword, pageType });

    // Get related content for internal linking
    const relatedContent = await queryAll(
      `SELECT title, slug, published_url FROM content_assets
       WHERE status = 'published' AND content_type IN ('landing_page','comparison','use_case')
       LIMIT 10`
    );

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'page_generation',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Generate a complete, conversion-optimized SEO page.

Target keyword: "${keyword}"
Page type: ${pageType}
Conversion angle: ${conversionAngle}
Available internal links: ${JSON.stringify(relatedContent)}

REQUIREMENTS:
1. Hero section: Pain-first headline, not feature-first
2. Social proof section (3 testimonial placeholders with specifics)
3. Feature/benefit matrix vs alternatives
4. FAQ section answering searcher's real questions (use semantic keywords)
5. Multiple CTA placements (top, middle, bottom) — different copy each time
6. Lead magnet offer relevant to this keyword's intent
7. Schema markup (FAQ, Review, Product)

Return JSON:
{
  "meta_title": "...",
  "meta_description": "...",
  "slug": "...",
  "word_count": number,
  "hero": { "headline": "...", "subheadline": "...", "cta_primary": "...", "cta_secondary": "..." },
  "sections": [
    { "type": "problem|features|comparison|testimonials|faq|cta", "headline": "...", "content": "..." }
  ],
  "lead_magnet": { "title": "...", "description": "...", "type": "checklist|template|audit|guide" },
  "internal_links": [{ "anchor_text": "...", "target_url": "..." }],
  "schema_markup": "...",
  "seo_score": number,
  "eeat_elements": [...],
  "estimated_conversion_rate": number,
  "full_html": "complete HTML of the page"
}`,
      }],
      maxTokens: 8000,
    });

    const page = parseJSON(content);

    // Score EEAT independently from SEO score
    const eeatScore = await this._scoreEEAT({
      keyword,
      pageContent: page.full_html || '',
      eeatElements: page.eeat_elements || [],
      sections: page.sections || [],
    });

    // Save to database
    const contentId = uuidv4();
    await query(
      `INSERT INTO content_assets
         (id, title, slug, content_type, status, body_html, meta_title, meta_description,
          target_keywords, word_count, seo_score, eeat_score, generated_by, prompt_version, ai_model)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, 'seo_demand_capture', 'v1', $12)`,
      [
        contentId,
        page.meta_title || keyword,
        page.slug || keyword.toLowerCase().replace(/\s+/g, '-'),
        pageType || 'landing_page',
        page.full_html,
        page.meta_title,
        page.meta_description,
        keywordId ? `{${keywordId}}` : '{}',
        page.word_count || 0,
        page.seo_score || 0,
        eeatScore,
        config.openai.model,
      ]
    );

    // Auto-publish to CMS (degrades gracefully when not configured)
    const publishResult = await cmsClient.publishPage({
      id:               contentId,
      title:            page.meta_title || keyword,
      slug:             page.slug || keyword.toLowerCase().replace(/\s+/g, '-'),
      content_type:     pageType || 'landing_page',
      body_html:        page.full_html,
      body_markdown:    null,
      meta_title:       page.meta_title,
      meta_description: page.meta_description,
    });

    if (publishResult.published) {
      // Trigger downstream social repurposing + internal linking
      await eventBus.emit('content.published', {
        contentId,
        contentType: pageType || 'landing_page',
        title:       page.meta_title || keyword,
        slug:        page.slug,
        publishedUrl: publishResult.publishedUrl,
      });
      log.info('Page published to CMS', { runId, contentId, url: publishResult.publishedUrl });
    }

    await this._logRun(runId, 'page_generation', 'success',
      { keyword, pageType },
      { contentId, page: { slug: page.slug, seo_score: page.seo_score }, published: publishResult.published },
      inputTokens + outputTokens, costUsd, Date.now() - start);

    log.info('Page generated', { runId, contentId, slug: page.slug });
    return { contentId, page, publishResult };
  }

  /**
   * Technical SEO audit — find and fix issues on published pages
   */
  async technicalAudit() {
    const runId = uuidv4();
    const start = Date.now();

    const publishedPages = await queryAll(
      `SELECT id, title, slug, published_url, seo_score, leads_generated, conversion_rate
       FROM content_assets WHERE status = 'published'
       ORDER BY leads_generated ASC LIMIT 20`
    );

    if (!publishedPages.length) {
      log.info('No published pages to audit');
      return;
    }

    const { content, inputTokens, outputTokens, costUsd } = await callAI({
      agentName: this.name,
      jobType: 'technical_audit',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Audit these published pages and prioritize fixes by revenue impact.

Pages: ${JSON.stringify(publishedPages)}

For each underperforming page (low leads relative to pageviews), identify:
1. SEO issues (title, meta, headings, schema)
2. Conversion issues (weak CTA, poor lead magnet, no social proof)
3. Content gaps (missing semantic keywords, no FAQ, thin content)

Return JSON:
{
  "audit_results": [
    {
      "content_id": "...",
      "title": "...",
      "issues": [...],
      "priority_fixes": [...],
      "expected_uplift": "X% more leads if fixed",
      "action": "rewrite|optimize|kill"
    }
  ],
  "immediate_kills": ["content_id"],
  "quick_wins": ["content_id"],
  "total_revenue_at_stake": number
}`,
      }],
      maxTokens: 3000,
    });

    const audit = parseJSON(content);

    // Queue rewrites for underperformers
    for (const result of audit.audit_results || []) {
      if (result.action === 'rewrite') {
        await query(
          `UPDATE content_assets SET status = 'review' WHERE id = $1`,
          [result.content_id]
        );
      }
      if (result.action === 'kill') {
        await query(
          `UPDATE content_assets SET status = 'killed', killed_at = NOW(), kill_reason = 'Low conversion — SEO audit' WHERE id = $1`,
          [result.content_id]
        );
      }
    }

    await this._logRun(runId, 'technical_audit', 'success',
      { pagesAudited: publishedPages.length }, audit, inputTokens + outputTokens, costUsd, Date.now() - start);

    return audit;
  }

  /**
   * Programmatic SEO at scale — bulk page generation from a keyword cluster.
   *
   * Takes a cluster of related keywords and generates conversion-optimized pages
   * for all of them in parallel batches, then fires a technical audit to wire up
   * internal links across all newly generated pages.
   *
   * @param {Array}  keywordCluster  Array of { keyword, pageType?, conversionAngle?, keywordId? }
   * @param {number} batchSize       Parallel page generations per batch (default 5)
   * @param {string} productId       Optional product scope
   */
  async bulkGeneratePages({ keywordCluster = [], batchSize = 5, productId = null } = {}) {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Bulk page generation started', { runId, total: keywordCluster.length, batchSize });

    if (!keywordCluster.length) {
      log.warn('bulkGeneratePages called with empty cluster', { runId });
      return { generated: 0, failed: 0, contentIds: [] };
    }

    const contentIds = [];
    let failed = 0;

    // Process in parallel batches to avoid overwhelming the AI API
    for (let i = 0; i < keywordCluster.length; i += batchSize) {
      const batch = keywordCluster.slice(i, i + batchSize);
      log.info('Processing batch', { runId, batchIndex: Math.floor(i / batchSize), size: batch.length });

      const results = await Promise.allSettled(
        batch.map(kw => this.generatePage({
          keywordId:       kw.keywordId       || null,
          keyword:         kw.keyword,
          pageType:        kw.pageType        || 'landing_page',
          conversionAngle: kw.conversionAngle || 'Free trial — no credit card',
          productId:       kw.productId       || productId,
        }))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value?.contentId) {
          contentIds.push(result.value.contentId);
        } else if (result.status === 'rejected') {
          failed++;
          log.error('Batch page generation failed', { runId, err: result.reason?.message });
        }
      }
    }

    // After all pages are generated, trigger a technical audit to wire internal links
    // across the entire cluster (low priority — runs in background)
    if (contentIds.length > 1) {
      const { queues: q } = await import('../queues/index.js');
      await q.dispatch('seo_demand_capture', 'technical_audit', {
        reason: `Post-bulk-generation internal linking for ${contentIds.length} pages`,
      }, { priority: 8 }).catch(err => {
        log.warn('Could not queue post-bulk audit', { err: err.message });
      });
    }

    await this._logRun(runId, 'bulk_generate_pages', 'success',
      { total: keywordCluster.length, batchSize, productId },
      { generated: contentIds.length, failed, contentIds },
      0, 0, Date.now() - start);

    log.info('Bulk page generation complete', {
      runId, generated: contentIds.length, failed, total: keywordCluster.length,
    });

    return { generated: contentIds.length, failed, contentIds };
  }

  /**
   * Weekly competitor keyword monitoring.
   * For each known competitor:
   *   - Fetches their top organic keywords
   *   - Identifies threats (they rank ≤10 on keywords we also target)
   *   - Identifies gaps (they rank ≤10 on keywords we haven't captured yet)
   *   - Emits keyword.ranking_drop for serious threats
   *   - Auto-queues new gap keywords for discovery
   */
  async monitorCompetitors() {
    const runId = uuidv4();
    const start = Date.now();
    log.info('Monitoring competitors', { runId });

    // Collect competitor domains from products table + config
    const products = await queryAll(
      `SELECT competitors FROM products WHERE status = 'active' AND competitors IS NOT NULL`
    );
    const competitorDomains = new Set();
    for (const p of products) {
      const comps = Array.isArray(p.competitors) ? p.competitors : [];
      for (const c of comps) {
        const domain = typeof c === 'string' ? c : c.domain || c.url || '';
        if (domain) competitorDomains.add(domain.replace(/^https?:\/\//, '').replace(/\/.*/, ''));
      }
    }
    // Always include any known competitors from business context
    if (!competitorDomains.size) {
      ['hubspot.com', 'activecampaign.com', 'marketo.com'].forEach(d => competitorDomains.add(d));
    }

    // Our tracked keyword set
    const ourKeywords = await queryAll(
      `SELECT id, keyword, serp_position, priority_score FROM keywords ORDER BY priority_score DESC LIMIT 500`
    );
    const ourKeywordMap = new Map(ourKeywords.map(k => [k.keyword.toLowerCase(), k]));

    const threats   = [];
    const gaps      = [];
    const processed = [];

    for (const domain of competitorDomains) {
      try {
        const competitorKws = await seoDataClient.getCompetitorKeywords({ domain, limit: 100 });

        for (const ckw of competitorKws) {
          const kw = ckw.keyword.toLowerCase();

          if (ourKeywordMap.has(kw)) {
            // Threat: they rank ≤10 on a keyword we already target
            const ours = ourKeywordMap.get(kw);
            const theirPos = ckw.position || 99;
            const ourPos   = parseFloat(ours.serp_position) || 99;

            if (theirPos <= 10 && ourPos > theirPos + 3) {
              threats.push({
                keyword:       kw,
                our_position:  ourPos,
                their_position: theirPos,
                competitor:    domain,
                keyword_id:    ours.id,
                gap:           ourPos - theirPos,
              });
            }
          } else if ((ckw.position || 99) <= 10 && (ckw.volume || 0) >= 100) {
            // Gap: they rank well on a keyword we haven't targeted yet
            gaps.push({
              keyword:       kw,
              volume:        ckw.volume,
              difficulty:    ckw.difficulty,
              their_position: ckw.position,
              competitor:    domain,
            });
          }
        }
        processed.push(domain);
      } catch (err) {
        log.error('Competitor fetch failed', { domain, err: err.message });
      }
    }

    // Sort threats by severity (largest position gap first)
    threats.sort((a, b) => b.gap - a.gap);

    // Emit ranking drop events for top 5 most severe threats
    for (const threat of threats.slice(0, 5)) {
      await eventBus.emit('keyword.ranking_drop', {
        keyword:      threat.keyword,
        dropPositions: threat.gap,
        currentPosition: threat.our_position,
      });
      log.warn('Competitor threat detected', threat);
    }

    // Queue the top 10 gap keywords for discovery/page generation
    const topGaps = gaps
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 10);

    if (topGaps.length) {
      const { queues } = await import('../queues/index.js');
      await queues.dispatch('seo_demand_capture', 'keyword_discovery', {
        seedKeywords: topGaps.map(g => g.keyword),
        competitors:  [...competitorDomains],
        source:       'competitor_gap',
      }, { priority: 3 });
    }

    await this._logRun(runId, 'monitor_competitors', 'success',
      { competitors: [...competitorDomains] },
      { threats: threats.length, gaps: gaps.length, top_threats: threats.slice(0, 5), top_gaps: topGaps },
      0, 0, Date.now() - start);

    log.info('Competitor monitoring complete', {
      runId, competitors: processed.length, threats: threats.length, gaps: gaps.length,
    });
    return { threats, gaps: topGaps, processed };
  }

  /**
   * Score EEAT (Experience, Expertise, Authoritativeness, Trustworthiness)
   * independently from the technical SEO score.
   *
   * Returns a numeric score 0-100 derived from a dedicated AI evaluation.
   */
  async _scoreEEAT({ keyword, pageContent, eeatElements, sections }) {
    const sectionSummary = sections
      .map(s => `${s.type}: ${(s.headline || '').slice(0, 60)}`)
      .join(', ');

    const { content } = await callAI({
      agentName: this.name,
      jobType: 'eeat_scoring',
      system: `You are an EEAT auditor evaluating content quality for Google's quality rater guidelines.
Score each dimension 0-25. Return ONLY valid JSON — no markdown, no commentary.`,
      messages: [{
        role: 'user',
        content: `Score this page's EEAT for the keyword: "${keyword}"

Page sections: ${sectionSummary}
EEAT elements present: ${JSON.stringify(eeatElements)}
Content snippet (first 1000 chars): ${pageContent.slice(0, 1000)}

Score each dimension:
- Experience (0-25): Does content show first-hand use, examples, real data?
- Expertise (0-25): Does content demonstrate deep subject-matter knowledge?
- Authoritativeness (0-25): Are there author credentials, citations, references to authority sources?
- Trustworthiness (0-25): Is there social proof, transparency, clear methodology?

Return JSON:
{
  "experience": number,
  "expertise": number,
  "authoritativeness": number,
  "trustworthiness": number,
  "total": number,
  "top_gap": "biggest missing EEAT element in one sentence"
}`,
      }],
      maxTokens: 300,
    });

    const result = parseJSON(content);
    // Clamp to 0-100
    return Math.min(100, Math.max(0, result.total ?? (result.experience + result.expertise + result.authoritativeness + result.trustworthiness) ?? 0));
  }

  async _logRun(id, jobType, status, input, output, tokens, costUsd, durationMs, error = null) {
    await query(
      `INSERT INTO agent_runs (id, agent, job_type, status, input, output, tokens_used, cost_usd, duration_ms, error, completed_at, triggered_by)
       VALUES ($1, 'seo_demand_capture', $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'scheduler')`,
      [id, jobType, status, JSON.stringify(input), JSON.stringify(output), tokens, costUsd, durationMs, error]
    );
  }
}
