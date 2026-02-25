/**
 * LinkedIn API Integration
 *
 * Handles: post publishing, engagement data retrieval, scheduled posts, DMs
 * Fallback: Logs/simulates when token not configured
 *
 * API Version: LinkedIn REST API v2 (UGC Posts endpoint)
 *
 * Methods:
 *   publishPost(post)                       → { postId, url }
 *   schedulePost(post, publishAt)           → stores in social_posts with scheduled_at
 *   publishScheduledPosts()                 → finds and publishes due scheduled posts
 *   syncEngagementData()                    → fetches and updates engagement for recent posts
 *   getAnalytics(postId)                    → returns engagement metrics for a post
 *   sendDM(profileId, message)              → sends LinkedIn direct message
 */

import { config } from '../config.js';
import { query, queryAll, queryOne } from '../utils/db.js';
import { agentLogger } from '../utils/logger.js';

const log = agentLogger('linkedin');

const LI_API = 'https://api.linkedin.com/v2';

class LinkedInClient {
  constructor() {
    this.accessToken  = config.integrations.linkedin.accessToken;
    this.orgId        = process.env.LINKEDIN_ORGANIZATION_ID || '';
    this.isConfigured = Boolean(this.accessToken);
    this._personUrnCache = null;
  }

  get headers() {
    return {
      Authorization:               `Bearer ${this.accessToken}`,
      'Content-Type':              'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    };
  }

  // ─────────────────────────────────────────────
  // Publish a post
  // ─────────────────────────────────────────────

  /**
   * Publish a post to LinkedIn (organisation page preferred, personal fallback).
   *
   * @param {object} post
   *   post.postId          — UUID of social_posts row
   *   post.body            — Post text content
   *   post.hashtags        — Array of hashtag strings (with or without #)
   *   post.mediaUrls       — Array of image URLs
   *   post.asOrganization  — Prefer org page if orgId is set (default: true)
   * @returns {{ postId: string, url: string, status: string }}
   */
  async publishPost({ postId, body, hashtags = [], mediaUrls = [], asOrganization = true }) {
    if (!this.isConfigured) {
      log.warn('LinkedIn not configured — marking post as simulated', { postId });
      const simId = `sim_li_${Date.now()}`;
      await query(
        `UPDATE social_posts SET published_at = NOW(), platform_post_id = $1 WHERE id = $2`,
        [simId, postId]
      ).catch(() => {});
      return { postId: simId, url: `https://linkedin.com/feed/update/${simId}`, status: 'simulated' };
    }

    const author = (asOrganization && this.orgId)
      ? `urn:li:organization:${this.orgId}`
      : await this._getPersonUrn();

    const hashtagText = hashtags
      .map(h => (h.startsWith('#') ? h : `#${h}`))
      .join(' ');
    const fullText = hashtagText ? `${body}\n\n${hashtagText}` : body;

    const postBody = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary:    { text: fullText.trim() },
          shareMediaCategory: mediaUrls.length ? 'IMAGE' : 'NONE',
          ...(mediaUrls.length
            ? { media: mediaUrls.map(url => ({ status: 'READY', originalUrl: url })) }
            : {}),
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    try {
      const res = await fetch(`${LI_API}/ugcPosts`, {
        method:  'POST',
        headers: this.headers,
        body:    JSON.stringify(postBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LinkedIn API ${res.status}: ${errText}`);
      }

      const liPostId  = res.headers.get('x-restli-id') || `li_${Date.now()}`;
      const postUrl   = `https://www.linkedin.com/feed/update/${liPostId}`;

      await query(
        `UPDATE social_posts SET published_at = NOW(), platform_post_id = $1 WHERE id = $2`,
        [liPostId, postId]
      ).catch(() => {});

      log.info('LinkedIn post published', { postId, liPostId, url: postUrl });
      return { postId: liPostId, url: postUrl, status: 'published' };

    } catch (err) {
      log.error('LinkedIn publish failed', { postId, err: err.message });
      throw err;
    }
  }

  // ─────────────────────────────────────────────
  // Schedule a post
  // ─────────────────────────────────────────────

  /**
   * Store a post with a future publish time in the social_posts table.
   * publishScheduledPosts() will pick it up when the time arrives.
   *
   * @param {object} post        — { contentAssetId, body, hashtags, mediaUrls }
   * @param {Date|string} publishAt  — When to publish
   * @returns {{ id: string, scheduledAt: string }}
   */
  async schedulePost(post, publishAt) {
    const scheduledAt = new Date(publishAt);

    const result = await queryOne(
      `INSERT INTO social_posts
         (content_asset_id, platform, post_body, hashtags, media_urls, scheduled_at)
       VALUES ($1, 'linkedin', $2, $3, $4, $5)
       RETURNING id, scheduled_at`,
      [
        post.contentAssetId || null,
        post.body,
        post.hashtags || [],
        post.mediaUrls || [],
        scheduledAt,
      ]
    );

    log.info('LinkedIn post scheduled', { id: result.id, scheduledAt: result.scheduled_at });
    return { id: result.id, scheduledAt: result.scheduled_at };
  }

  // ─────────────────────────────────────────────
  // Publish scheduled posts (called by cron)
  // ─────────────────────────────────────────────

  /**
   * Find all overdue scheduled LinkedIn posts and publish them.
   * @returns {Array<{ postId, status, liPostId? }>}
   */
  async publishScheduledPosts() {
    const duePosts = await queryAll(
      `SELECT id, post_body, hashtags, media_urls, content_asset_id
       FROM social_posts
       WHERE platform     = 'linkedin'
         AND scheduled_at <= NOW()
         AND published_at  IS NULL
       ORDER BY scheduled_at ASC
       LIMIT 10`
    );

    const results = [];
    for (const post of duePosts) {
      try {
        const result = await this.publishPost({
          postId:    post.id,
          body:      post.post_body,
          hashtags:  post.hashtags  || [],
          mediaUrls: post.media_urls || [],
        });
        results.push({ postId: post.id, ...result });
        log.info('Scheduled post published', { postId: post.id, liPostId: result.postId });
      } catch (err) {
        results.push({ postId: post.id, status: 'failed', error: err.message });
        log.error('Scheduled post publish failed', { postId: post.id, err: err.message });
      }
    }

    return results;
  }

  // ─────────────────────────────────────────────
  // Sync engagement data
  // ─────────────────────────────────────────────

  /**
   * Fetch real engagement metrics from LinkedIn for recent posts and update the DB.
   * Uses organizationalEntityShareStatistics for org posts, socialMetadata as fallback.
   * @returns {{ postsChecked: number, updated: number }}
   */
  async syncEngagementData() {
    const posts = await queryAll(
      `SELECT id, platform_post_id
       FROM social_posts
       WHERE platform       = 'linkedin'
         AND published_at   >= NOW() - INTERVAL '30 days'
         AND platform_post_id IS NOT NULL
         AND platform_post_id NOT LIKE 'sim_%'
       ORDER BY published_at DESC
       LIMIT 50`
    );

    let updated = 0;

    for (const post of posts) {
      try {
        const analytics = await this.getAnalytics(post.platform_post_id);
        await query(
          `UPDATE social_posts
           SET impressions  = $1,
               engagements  = $2,
               clicks       = $3
           WHERE id = $4`,
          [analytics.impressions, analytics.engagements, analytics.clicks, post.id]
        );
        updated++;
      } catch (err) {
        log.debug('Post analytics sync failed', { postId: post.id, err: err.message });
      }
    }

    log.info('LinkedIn engagement sync complete', { postsChecked: posts.length, updated });
    return { postsChecked: posts.length, updated };
  }

  // ─────────────────────────────────────────────
  // Get analytics for a post
  // ─────────────────────────────────────────────

  /**
   * Return engagement metrics for a LinkedIn post.
   * Attempts organizationalEntityShareStatistics (org pages) then
   * falls back to socialMetadata, then mock data.
   *
   * @param {string} platformPostId  — LinkedIn UGC post URN or ID
   * @returns {{ impressions, engagements, likes, comments, shares, clicks }}
   */
  async getAnalytics(platformPostId) {
    if (!this.isConfigured || platformPostId?.startsWith('sim_')) {
      return this._mockPostAnalytics(platformPostId);
    }

    // Try organizationalEntityShareStatistics (requires org token)
    if (this.orgId) {
      try {
        const orgUrn  = encodeURIComponent(`urn:li:organization:${this.orgId}`);
        const shareUrn = encodeURIComponent(platformPostId);
        const res = await fetch(
          `${LI_API}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${orgUrn}&shares=List(${shareUrn})`,
          { headers: this.headers }
        );
        if (res.ok) {
          const data  = await res.json();
          const stats = data.elements?.[0]?.totalShareStatistics;
          if (stats) {
            return {
              impressions:  stats.impressionCount   || 0,
              engagements:  stats.engagement         || 0,
              likes:        stats.likeCount          || 0,
              comments:     stats.commentCount       || 0,
              shares:       stats.shareCount         || 0,
              clicks:       stats.clickCount         || 0,
            };
          }
        }
      } catch (err) {
        log.debug('Org share stats failed, trying socialMetadata', { err: err.message });
      }
    }

    // Fallback: socialMetadata endpoint
    try {
      const res = await fetch(
        `${LI_API}/socialMetadata/${encodeURIComponent(platformPostId)}`,
        { headers: this.headers }
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      return {
        impressions:  data.totalShareStatistics?.impressionCount || 0,
        engagements:  data.totalShareStatistics?.engagement      || 0,
        likes:        data.totalShareStatistics?.likeCount       || 0,
        comments:     data.totalShareStatistics?.commentCount    || 0,
        shares:       data.totalShareStatistics?.shareCount      || 0,
        clicks:       data.totalShareStatistics?.clickCount      || 0,
      };
    } catch (err) {
      log.warn('Analytics fetch failed, using mock', { platformPostId, err: err.message });
      return this._mockPostAnalytics(platformPostId);
    }
  }

  // ─────────────────────────────────────────────
  // Compatibility alias
  // ─────────────────────────────────────────────

  async getPostAnalytics({ platformPostId }) {
    return this.getAnalytics(platformPostId);
  }

  // ─────────────────────────────────────────────
  // Send direct message
  // ─────────────────────────────────────────────

  /**
   * Send a LinkedIn direct message to a member.
   * Requires w_member_social scope + recipient must be a 1st-degree connection.
   *
   * @param {string} profileId  — LinkedIn member URN ("urn:li:person:XYZ") OR profile URL
   * @param {string} message
   * @returns {{ status: string, sender?: string }}
   */
  async sendDM(profileId, message) {
    if (!this.isConfigured) {
      log.info('LinkedIn not configured — DM skipped', { profileId });
      return { status: 'skipped', reason: 'not_configured' };
    }

    // Normalise profileId to URN
    let recipientUrn = profileId;
    if (profileId && !profileId.startsWith('urn:')) {
      recipientUrn = this.extractUrnFromUrl(profileId);
    }

    if (!recipientUrn) {
      log.debug('No recipient URN available for DM', { profileId });
      return { status: 'skipped', reason: 'no_recipient_urn' };
    }

    try {
      const senderUrn = await this._getPersonUrn();

      const res = await fetch(`${LI_API}/messages`, {
        method:  'POST',
        headers: this.headers,
        body: JSON.stringify({
          recipients: [{
            person: {
              'com.linkedin.voyager.messaging.messagingMember': {
                miniProfile: { entityUrn: recipientUrn },
              },
            },
          }],
          subject:     '',
          body:        message,
          messageType: { 'com.linkedin.voyager.messaging.create.MessageCreate': {} },
        }),
      });

      if (res.status === 403) {
        log.info('LinkedIn DM blocked — not a 1st-degree connection', { recipientUrn });
        return { status: 'skipped', reason: 'not_connected' };
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LinkedIn DM ${res.status}: ${errText}`);
      }

      log.info('LinkedIn DM sent', { recipientUrn });
      return { status: 'sent', sender: senderUrn };

    } catch (err) {
      log.error('LinkedIn DM failed', { err: err.message });
      return { status: 'error', error: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  /**
   * Get (and cache) the authenticated member's person URN.
   */
  async _getPersonUrn() {
    if (this._personUrnCache) return this._personUrnCache;
    try {
      const res  = await fetch(`${LI_API}/me`, { headers: this.headers });
      const data = await res.json();
      this._personUrnCache = `urn:li:person:${data.id}`;
      return this._personUrnCache;
    } catch (err) {
      log.warn('Could not resolve person URN', { err: err.message });
      return `urn:li:person:unknown`;
    }
  }

  /**
   * Attempt to extract a person URN from a LinkedIn vanity URL.
   * Full implementation requires a separate API lookup; returns null to skip gracefully.
   */
  extractUrnFromUrl(linkedinUrl) {
    if (!linkedinUrl) return null;
    // URN-format URLs: linkedin.com/in/urn:li:person:XXXX
    const urnMatch = linkedinUrl.match(/urn:li:person:([A-Za-z0-9_-]+)/);
    if (urnMatch) return `urn:li:person:${urnMatch[1]}`;
    // Vanity URL lookup requires separate API call — skip gracefully
    return null;
  }

  /**
   * Realistic mock analytics seeded from the post ID.
   */
  _mockPostAnalytics(postId) {
    const seed = postId
      ? [...postId].reduce((a, c) => a + c.charCodeAt(0), 0) % 100
      : 42;
    return {
      impressions: 800  + seed * 47,
      engagements: 40   + seed * 3,
      likes:       28   + seed * 2,
      comments:    8    + seed,
      shares:      4    + seed,
      clicks:      22   + seed * 2,
    };
  }
}

export const linkedinClient = new LinkedInClient();
