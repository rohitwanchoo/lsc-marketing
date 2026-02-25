/**
 * CMS Integration — Publish content to WordPress, Ghost, Webflow, or mock mode
 *
 * Supported CMS types (set CMS_TYPE env var):
 *   wordpress  — REST API + Application Passwords
 *   ghost      — Admin API (JWT HS256)
 *   webflow    — Data API v2
 *   mock       — Stores in content_assets table as if published (default)
 *
 * Methods:
 *   publishPage(page)              → publishes a page/post to the CMS
 *   updatePage(pageId, updates)    → updates existing page content
 *   getPageBySlug(slug)            → retrieves page by slug
 *   unpublishPage(pageId)          → unpublishes / reverts to draft
 *   getPublishedPages()            → lists all published pages from DB
 */

import { createHmac } from 'crypto';
import { createSign } from 'crypto';
import { config } from '../config.js';
import { query, queryAll, queryOne } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';

const log = agentLogger('cms');

class CMSClient {
  constructor() {
    this.type         = (config.integrations.cms.type || process.env.CMS_TYPE || 'mock').toLowerCase();
    this.url          = (config.integrations.cms.url  || process.env.CMS_BASE_URL || '').replace(/\/$/, '');
    this.isConfigured = Boolean(this.url && this.type && this.type !== 'mock');
  }

  // ─────────────────────────────────────────────
  // Publish a page
  // ─────────────────────────────────────────────

  /**
   * Publish a content_asset record to the configured CMS.
   * Updates content_assets.status → 'published', sets published_url and published_at.
   *
   * @param {object} contentAsset  — Full row from content_assets table (or a compatible object)
   * @returns {{ published: boolean, publishedUrl?: string, externalId?: string, reason?: string }}
   */
  async publishPage(contentAsset) {
    log.info(`[CMS] Publishing via "${this.type}"`, { slug: contentAsset.slug, id: contentAsset.id });

    switch (this.type) {
      case 'wordpress': return this._publishWordPress(contentAsset);
      case 'ghost':     return this._publishGhost(contentAsset);
      case 'webflow':   return this._publishWebflow(contentAsset);
      case 'mock':
      default:          return this._publishMock(contentAsset);
    }
  }

  // ─────────────────────────────────────────────
  // Update a page
  // ─────────────────────────────────────────────

  /**
   * Update an existing CMS page with new content.
   *
   * @param {string} pageId   — Our internal content_asset UUID
   * @param {object} updates  — Partial content_asset fields to update
   * @returns {{ updated: boolean, publishedUrl?: string }}
   */
  async updatePage(pageId, updates) {
    // Fetch the current asset from our DB
    const asset = await queryOne(`SELECT * FROM content_assets WHERE id = $1`, [pageId]);
    if (!asset) {
      log.warn('[CMS] updatePage: asset not found', { pageId });
      return { updated: false, reason: 'asset_not_found' };
    }

    const merged = { ...asset, ...updates };

    // Update our local DB first
    await query(
      `UPDATE content_assets
       SET title            = $1,
           body_html        = $2,
           body_markdown    = $3,
           meta_title       = $4,
           meta_description = $5,
           updated_at       = NOW()
       WHERE id = $6`,
      [merged.title, merged.body_html, merged.body_markdown, merged.meta_title, merged.meta_description, pageId]
    );

    // If the page is already published externally, push the update
    if (asset.status === 'published') {
      const result = await this.publishPage(merged);
      return { updated: result.published, publishedUrl: result.publishedUrl };
    }

    return { updated: true };
  }

  // ─────────────────────────────────────────────
  // Get page by slug
  // ─────────────────────────────────────────────

  /**
   * Retrieve a content_asset by its URL slug.
   * Queries the local database; for a live CMS fetch, also hits the CMS API.
   *
   * @param {string} slug
   * @returns {object|null}  — content_asset row or null
   */
  async getPageBySlug(slug) {
    const asset = await queryOne(
      `SELECT * FROM content_assets WHERE slug = $1`,
      [slug]
    );

    if (!asset || !this.isConfigured) return asset;

    // Optionally enrich with live CMS data
    try {
      switch (this.type) {
        case 'wordpress': {
          const auth    = this._wpAuth();
          const postType = this._wpPostType(asset.content_type);
          const res = await fetch(
            `${this.url}/wp-json/wp/v2/${postType}?slug=${encodeURIComponent(slug)}&status=any`,
            { headers: auth }
          );
          if (res.ok) {
            const [wp] = await res.json();
            if (wp) asset._cms_data = { id: wp.id, link: wp.link, status: wp.status };
          }
          break;
        }
        case 'ghost': {
          const token = this._ghostAdminToken();
          const res = await fetch(
            `${this.url}/ghost/api/admin/posts/?filter=slug:${slug}&fields=id,url,status`,
            { headers: { Authorization: `Ghost ${token}` } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.posts?.[0]) asset._cms_data = data.posts[0];
          }
          break;
        }
      }
    } catch (err) {
      log.debug('[CMS] getPageBySlug CMS fetch failed', { slug, err: err.message });
    }

    return asset;
  }

  // ─────────────────────────────────────────────
  // Unpublish a page
  // ─────────────────────────────────────────────

  /**
   * Unpublish a page (revert to draft) in both the CMS and our DB.
   *
   * @param {string} pageId  — Our internal content_asset UUID
   * @returns {{ unpublished: boolean, reason?: string }}
   */
  async unpublishPage(pageId) {
    const asset = await queryOne(`SELECT * FROM content_assets WHERE id = $1`, [pageId]);
    if (!asset) return { unpublished: false, reason: 'asset_not_found' };

    // Update local DB
    await query(
      `UPDATE content_assets SET status = 'draft', published_at = NULL, updated_at = NOW() WHERE id = $1`,
      [pageId]
    );

    if (!this.isConfigured || !asset._cms_data?.id) {
      log.info('[CMS] Page unpublished locally', { pageId });
      return { unpublished: true, note: 'local_only' };
    }

    try {
      switch (this.type) {
        case 'wordpress': {
          const auth     = this._wpAuth();
          const postType = this._wpPostType(asset.content_type);
          const cmsId    = asset._cms_data?.id;
          if (cmsId) {
            await fetch(`${this.url}/wp-json/wp/v2/${postType}/${cmsId}`, {
              method:  'POST',
              headers: { ...auth, 'Content-Type': 'application/json' },
              body:    JSON.stringify({ status: 'draft' }),
            });
          }
          break;
        }
        case 'ghost': {
          const token = this._ghostAdminToken();
          const cmsId = asset._cms_data?.id;
          if (cmsId) {
            await fetch(`${this.url}/ghost/api/admin/posts/${cmsId}/`, {
              method:  'PUT',
              headers: { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' },
              body:    JSON.stringify({ posts: [{ status: 'draft', updated_at: new Date().toISOString() }] }),
            });
          }
          break;
        }
      }
    } catch (err) {
      log.warn('[CMS] Remote unpublish failed, DB updated only', { pageId, err: err.message });
    }

    log.info('[CMS] Page unpublished', { pageId, type: this.type });
    return { unpublished: true };
  }

  // ─────────────────────────────────────────────
  // Get published pages
  // ─────────────────────────────────────────────

  /**
   * Return all published content_assets from the database.
   *
   * @param {object} [opts]  — { limit, contentType, orderBy }
   * @returns {Array}
   */
  async getPublishedPages(opts = {}) {
    const { limit = 100, contentType, orderBy = 'published_at DESC' } = opts;
    const conditions = [`status = 'published'`];
    const params     = [];

    if (contentType) {
      params.push(contentType);
      conditions.push(`content_type = $${params.length}`);
    }

    params.push(limit);
    const sql = `SELECT * FROM content_assets WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy} LIMIT $${params.length}`;

    return queryAll(sql, params);
  }

  // ─────────────────────────────────────────────
  // WordPress
  // ─────────────────────────────────────────────

  async _publishWordPress(asset) {
    const { username, appPassword } = config.integrations.cms;
    if (!username || !appPassword) {
      log.warn('[CMS] WordPress credentials missing (CMS_USERNAME / CMS_APP_PASSWORD)');
      return this._publishMock(asset);
    }

    const auth     = this._wpAuth();
    const postType = this._wpPostType(asset.content_type);

    const payload = {
      title:   asset.meta_title  || asset.title,
      content: asset.body_html   || asset.body_markdown || '',
      slug:    asset.slug,
      status:  'publish',
      excerpt: asset.meta_description || '',
      meta: {
        _yoast_wpseo_title:    asset.meta_title        || '',
        _yoast_wpseo_metadesc: asset.meta_description  || '',
      },
    };

    try {
      // Check if slug already exists
      const searchRes = await fetch(
        `${this.url}/wp-json/wp/v2/${postType}?slug=${encodeURIComponent(asset.slug)}&status=any`,
        { headers: auth }
      );
      const existing = await searchRes.json();

      let wpResult;
      if (Array.isArray(existing) && existing.length > 0) {
        // Update existing post
        const res = await fetch(
          `${this.url}/wp-json/wp/v2/${postType}/${existing[0].id}`,
          { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
        if (!res.ok) throw new Error(`WP update ${res.status}: ${await res.text()}`);
        wpResult = await res.json();
        log.info('[CMS] WordPress page updated', { slug: asset.slug, wpId: wpResult.id });
      } else {
        // Create new post
        const res = await fetch(
          `${this.url}/wp-json/wp/v2/${postType}`,
          { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
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

  _wpAuth() {
    const { username, appPassword } = config.integrations.cms;
    const encoded = Buffer.from(`${username}:${appPassword}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }

  _wpPostType(contentType) {
    return ['landing_page', 'comparison', 'use_case'].includes(contentType) ? 'pages' : 'posts';
  }

  // ─────────────────────────────────────────────
  // Ghost
  // ─────────────────────────────────────────────

  async _publishGhost(asset) {
    const { adminApiKey } = config.integrations.cms;
    if (!adminApiKey) {
      log.warn('[CMS] Ghost Admin API key missing (GHOST_ADMIN_KEY)');
      return this._publishMock(asset);
    }

    try {
      const token = this._ghostAdminToken();
      const res   = await fetch(`${this.url}/ghost/api/admin/posts/`, {
        method:  'POST',
        headers: { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
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
      log.error('[CMS] Ghost publish failed', { slug: asset.slug, err: err.message });
      return { published: false, reason: err.message };
    }
  }

  _ghostAdminToken() {
    const { adminApiKey } = config.integrations.cms;
    const [keyId, secret] = adminApiKey.split(':');
    const now     = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: keyId })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
    const sig     = createHmac('sha256', Buffer.from(secret, 'hex'))
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `${header}.${payload}.${sig}`;
  }

  // ─────────────────────────────────────────────
  // Webflow
  // ─────────────────────────────────────────────

  async _publishWebflow(asset) {
    const { apiToken, collectionId } = config.integrations.cms;
    if (!apiToken || !collectionId) {
      log.warn('[CMS] Webflow config missing (WEBFLOW_API_TOKEN / WEBFLOW_COLLECTION_ID)');
      return this._publishMock(asset);
    }

    try {
      const res = await fetch(
        `https://api.webflow.com/v2/collections/${collectionId}/items/live`,
        {
          method:  'POST',
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
      const data         = await res.json();
      const publishedUrl = `${this.url}/${asset.slug}`;

      await this._markPublished(asset.id, publishedUrl);
      log.info('[CMS] Webflow item published', { slug: asset.slug, itemId: data.id });
      return { published: true, publishedUrl, externalId: data.id, type: 'webflow' };

    } catch (err) {
      log.error('[CMS] Webflow publish failed', { slug: asset.slug, err: err.message });
      return { published: false, reason: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // Mock mode
  // ─────────────────────────────────────────────

  /**
   * Mock publish — marks the asset as published in our DB with a fake URL.
   * Used when CMS_TYPE=mock or no CMS credentials are configured.
   */
  async _publishMock(asset) {
    const publishedUrl = asset.id
      ? `https://${config.business.domain}/content/${asset.slug || asset.id}`
      : `https://${config.business.domain}/content/${Date.now()}`;

    await this._markPublished(asset.id, publishedUrl);
    log.info('[CMS] Mock publish — content marked as published in DB', { slug: asset.slug });
    return { published: true, publishedUrl, externalId: `mock_${Date.now()}`, type: 'mock' };
  }

  // ─────────────────────────────────────────────
  // Shared helpers
  // ─────────────────────────────────────────────

  async _markPublished(contentId, publishedUrl) {
    if (!contentId) return;
    await query(
      `UPDATE content_assets
       SET status       = 'published',
           published_at = NOW(),
           published_url = $1,
           updated_at   = NOW()
       WHERE id = $2`,
      [publishedUrl, contentId]
    );
  }
}

export const cmsClient = new CMSClient();
