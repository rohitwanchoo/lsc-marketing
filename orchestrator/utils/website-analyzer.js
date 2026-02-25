/**
 * Website Analyzer
 * Fetches a product/service website, strips HTML, and uses GPT-4o-mini
 * to extract a structured product profile for use across all agents.
 */

import { callAI } from './ai.js';
import { logger } from './logger.js';

/**
 * Strip HTML tags and collapse whitespace
 */
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Fetch a URL and return plain text content (max 5000 chars)
 */
async function fetchPageText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LSC-MarketingBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

    const html = await res.text();
    const text = stripHtml(html);

    // Return first 5000 chars — enough to understand the product
    return text.substring(0, 5000);
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Failed to fetch ${url}: ${err.message}`);
  }
}

/**
 * Analyze a product website and return a structured profile
 */
export async function analyzeWebsite(websiteUrl) {
  logger.info('Analyzing website', { url: websiteUrl });

  const pageText = await fetchPageText(websiteUrl);

  const { content } = await callAI({
    agentName: 'website_analyzer',
    jobType: 'analyze_website',
    system: `You are a product marketing analyst. Given raw website text, extract a structured product/service profile.
Return ONLY valid JSON — no markdown, no commentary, no explanation.`,
    messages: [{
      role: 'user',
      content: `Analyze this product/service website and extract its marketing profile.

Website URL: ${websiteUrl}
Website text (first 5000 chars):
---
${pageText}
---

Return ONLY this JSON structure (all fields required, use null if not found):
{
  "name": "Product/company name",
  "tagline": "One-line value prop or slogan from the site",
  "description": "2-3 sentence description of what the product does",
  "icp": "Ideal customer profile — who is this built for? Be specific: role, company size, industry",
  "value_proposition": "Core value delivered to the customer — the main reason they buy",
  "features": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
  "pricing_model": "free|freemium|subscription|one-time|usage-based|enterprise|unknown",
  "target_market": "B2B|B2C|B2B2C|marketplace",
  "competitors": ["Competitor 1", "Competitor 2", "Competitor 3"],
  "brand_tone": "professional|casual|technical|friendly|bold|minimal",
  "pain_points_solved": ["Pain 1", "Pain 2", "Pain 3"],
  "unique_differentiator": "What makes this product different from alternatives"
}`,
    }],
    maxTokens: 1024,
    temperature: 0.1,
  });

  // Parse the JSON response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('GPT did not return valid JSON');
  return JSON.parse(jsonMatch[0]);
}
