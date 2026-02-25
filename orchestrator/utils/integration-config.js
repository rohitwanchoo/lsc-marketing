/**
 * Integration Config Utility
 * Reads from integrations_config table, falls back to env vars
 */

import { queryOne } from './db.js';

const ENV_FALLBACKS = {
  linkedin:      () => process.env.LINKEDIN_ACCESS_TOKEN,
  hubspot:       () => process.env.HUBSPOT_API_KEY,
  slack:         () => process.env.SLACK_WEBHOOK_URL,
  ga4:           () => process.env.GA4_API_KEY,
  gsc:           () => process.env.GSC_API_KEY,
  sendgrid:      () => process.env.SENDGRID_API_KEY,
  ahrefs:        () => process.env.AHREFS_API_KEY,
  alert_webhook: () => process.env.ALERT_WEBHOOK_URL,
};

/**
 * Get integration config by name.
 * Prefers DB row; falls back to env var.
 * @param {string} name - integration name
 * @returns {{ api_key: string|null, config_json: object, enabled: boolean }}
 */
export async function getIntegrationConfig(name) {
  try {
    const row = await queryOne(
      `SELECT api_key, config_json, enabled FROM integrations_config WHERE integration_name = $1`,
      [name]
    );
    if (row) {
      return {
        api_key:     row.api_key || ENV_FALLBACKS[name]?.() || null,
        config_json: row.config_json || {},
        enabled:     row.enabled,
      };
    }
  } catch { /* DB may not be ready on first boot */ }

  return {
    api_key:     ENV_FALLBACKS[name]?.() || null,
    config_json: {},
    enabled:     false,
  };
}
