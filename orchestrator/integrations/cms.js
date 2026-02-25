/**
 * CMS Integration — Publish content to WordPress, Ghost, or Webflow
 *
 * Supported CMS types (set CMS_TYPE env var):
 *   wordpress  — REST API + Application Passwords
 *   ghost      — Admin API (JWT)
 *   webflow    — Data API v2
 *
 * Falls back gracefully when not configured — content stays as draft.
 */

import { createHmac } from 'crypto';
import { config } from '../config.js';
import { query } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';

const log = agentLogger('cms');

class CMSClient {
  constructor() {
    this.type        = config.integrations.cms.type;       // 'wordpress'|'ghost'|'webflow'
    this.url         = config.integrations.cms.url;        // base URL, no trailing slash
    this.isConfigured = Boolean(this.url && this.type);
  }

  /**
   * Publish a content_asset record to the configured CMS.
   * Updates content_assets.status → 'published', sets published_url, published_at.
   * Emits content.published event on success.
   *
   * @param {object} contentAsset  - Full row from content_assets table
   * @returns {{ published: boolean, publishedUrl?: string, externalId?: string, reason?: string }}
   */
  async publishPage(contentAsset) {
    if (!this.isConfigured) {
      log.info('[CMS] Not configured — content remains draft', { slug: contentAsset.slug });
      return { published: false, reason: 'cms_not_configured' };
    }

    log.info(`[CMS] Publishing via ${this.type}`, { slug: contentAsset.slug, id: contentAsset.id });

    switch (this.type) {
      case 'wordpress': return this._publishWordPress(contentAsset);
      case 'ghost':     return this._publishGhost(contentAsset);
      case 'webflow':   return this._publishWebflow(contentAsset);
      default:
        log.warn('[CMS] Unknown CMS type', { type: this.type });
        return { published: false, reason: `unknown_cms_type:${this.type}` };
    }
  }

  // ─────────────────────────────────────────────
  // WordPress REST API
  // ─────────────────────────────────────────────

  async _publishWordPress(asset) {
    const { username, appPassword } = config.integrations.cms;
    if (!username || !appPassword) {
      return { published: false, reason: 'wordpress_credentials_missing' };
    }

    const auth    = Buffer.from(`${username}:${appPassword}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };

    // Landing pages and comparisons → WP Pages; everything else → WP Posts
    const postType = ['landing_page', 'comparison', 'use_case'].includes(asset.content_type)
      ? 'pages'
      : 'posts';

    const payload = {
      title:   asset.meta_title || asset.title,
      content: asset.body_html  || asset.body_markdown || '',
      slug:    asset.slug,
      status:  'publish',
      excerpt: asset.meta_description || '',
      meta: {
        _yoast_wpseo_title:    asset.meta_title     || '',
        _yoast_wpseo_metadesc: asset.meta_description || '',
      },
    };

    try {
      // Check if a page with this slug already exists
      const searchRes  = await fetch(
        `${this.url}/wp-json/wp/v2/${postType}?slug=${encodeURIComponent(asset.slug)}&status=any`,
        { headers }
      );
      const existing = await searchRes.json();

      let wpResult;
      if (Array.isArray(existing) && existing.length > 0) {
        const res = await fetch(
          `${this.url}/wp-json/wp/v2/${postType}/${existing[0].id}`,
          { method: 'POST', headers, body: JSON.stringify(payload) }
        );
        if (!res.ok) throw new Error(`WP update ${res.status}: ${await res.text()}`);
        wpResult = await res.json();
        log.info('[CMS] WordPress page updated', { slug: asset.slug, wpId: wpResult.id });
      } else {
        const res = await fetch(
          `${this.url}/wp-json/wp/v2/${postType}`,
          { method: 'POST', headers, body: JSON.stringify(payload) }
        );
        if (!res.ok) throw new Error(`WP create ${res.status}: ${await res.text()}`);
        wpResult = await res.json();
        log.info('[CMS] WordPress page created', { slug: asset.slug, wpId: wpResult.id });
      }

      await this._markPublished(asset.id, wpResult.link);
      return { published: true, publishedUrl: wpResult.link, externalId: String(wpResult.id), type: 'wordpress' };

    } catch (err) {
      log.error('[CMS] WordPress publish failed', { slug: asset.slug, err: err.message });
      return { published: false, reason: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // Ghost Admin API
  // ─────────────────────────────────────────────

  async _publishGhost(asset) {
    const { adminApiKey } = config.integrations.cms;
    if (!adminApiKey) return { published: false, reason: 'ghost_admin_api_key_missing' };

    // Ghost Admin API key format: "id:secret"
    const [keyId, secret] = adminApiKey.split(':');
    const now    = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: keyId })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
    const sig     = createHmac('sha256', Buffer.from(secret, 'hex'))
      .update(`${header}.${payload}`)
      .digest('base64url');
    const token = `${header}.${payload}.${sig}`;

    try {
      const res = await fetch(`${this.url}/ghost/api/admin/posts/`, {
        method: 'POST',
        headers: { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posts: [{
            title:          asset.meta_title || asset.title,
            slug:           asset.slug,
            html:           asset.body_html || '',
            custom_excerpt: asset.meta_description || '',
            status:         'published',
          }],
        }),
      });

      if (!res.ok) throw new Error(`Ghost ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const post = data.posts[0];

      await this._markPublished(asset.id, post.url);
      log.info('[CMS] Ghost post published', { slug: asset.slug, url: post.url });
      return { published: true, publishedUrl: post.url, externalId: post.id, type: 'ghost' };

    } catch (err) {
      log.error('[CMS] Ghost publish failed', { err: err.message });
      return { published: false, reason: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // Webflow Data API v2
  // ─────────────────────────────────────────────

  async _publishWebflow(asset) {
    const { apiToken, collectionId } = config.integrations.cms;
    if (!apiToken || !collectionId) return { published: false, reason: 'webflow_config_missing' };

    try {
      const res = await fetch(
        `https://api.webflow.com/v2/collections/${collectionId}/items/live`,
        {
          method: 'POST',
          headers: {
            Authorization:    `Bearer ${apiToken}`,
            'Content-Type':   'application/json',
            'accept-version': '1.0.0',
          },
          body: JSON.stringify({
            isArchived: false,
            isDraft:    false,
            fieldData: {
              name:               asset.meta_title || asset.title,
              slug:               asset.slug,
              'post-body':        asset.body_html || '',
              'meta-title':       asset.meta_title || '',
              'meta-description': asset.meta_description || '',
            },
          }),
        }
      );

      if (!res.ok) throw new Error(`Webflow ${res.status}: ${await res.text()}`);
      const data        = await res.json();
      const publishedUrl = `${this.url}/${asset.slug}`;

      await this._markPublished(asset.id, publishedUrl);
      log.info('[CMS] Webflow item published', { slug: asset.slug, itemId: data.id });
      return { published: true, publishedUrl, externalId: data.id, type: 'webflow' };

    } catch (err) {
      log.error('[CMS] Webflow publish failed', { err: err.message });
      return { published: false, reason: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // Shared helpers
  // ─────────────────────────────────────────────

  async _markPublished(contentId, publishedUrl) {
    await query(
      `UPDATE content_assets
         SET status = 'published', published_at = NOW(), published_url = $1, updated_at = NOW()
       WHERE id = $2`,
      [publishedUrl, contentId]
    );
  }
}

export const cmsClient = new CMSClient();
