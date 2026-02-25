-- ============================================================
-- Migration 005: Missing Tables & Columns
-- Fills all gaps identified across agents, utils, and schedulers.
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Run: psql $DATABASE_URL -f migrations/005_missing_tables.sql
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. PRODUCTS TABLE
-- Referenced by:
--   seo-demand-capture.js  → discoverKeywords({ productId })
--                            monitorCompetitors() → SELECT FROM products
--   authority-content.js   → generateLinkedInStrategy({ productId })
--                            INSERT INTO content_assets (..., product_id)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  description         TEXT,
  icp                 TEXT,
  value_proposition   TEXT,
  competitors         JSONB DEFAULT '[]',
  pain_points_solved  TEXT[] DEFAULT '{}',
  features            JSONB DEFAULT '[]',
  website_url         TEXT,
  -- seo-demand-capture.js queries: WHERE status = 'active'
  -- (stored as TEXT so no enum migration is needed)
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'archived')),
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_slug   ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(status) WHERE status = 'active';

-- ─────────────────────────────────────────────
-- 2. ADD product_id TO keywords
-- Referenced by:
--   seo-demand-capture.js line 62: WHERE product_id = $1
--   seo-demand-capture.js line 154: INSERT ... product_id = $7
--   authority-content.js  line 122: WHERE product_id = $1 ORDER BY priority_score DESC
-- ─────────────────────────────────────────────
ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_keywords_product ON keywords(product_id);

-- ─────────────────────────────────────────────
-- 3. ADD product_id TO content_assets
-- Referenced by:
--   authority-content.js line 209:
--     INSERT INTO content_assets (..., product_id) VALUES (..., $4)
-- ─────────────────────────────────────────────
ALTER TABLE content_assets
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_product ON content_assets(product_id);

-- ─────────────────────────────────────────────
-- 4. SCORING MODELS
-- Migration 002 already creates this table with a schema fully compatible
-- with inbound-conversion.js (period_start, period_end, weights, is_active).
-- This block is a safety net: creates the table if 002 was never applied,
-- and seeds a default active row so _getActiveWeights() always finds one.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scoring_models (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_start  DATE,
  period_end    DATE,
  weights       JSONB NOT NULL DEFAULT '{
    "job_title":    25,
    "company_size": 20,
    "page_intent":  20,
    "engagement":   20,
    "behavior":     15
  }',
  win_rate      NUMERIC(6,4),
  sample_size   INTEGER,
  won_sample    INTEGER,
  lost_sample   INTEGER,
  raw_response  JSONB DEFAULT '{}',
  is_active     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scoring_models_active ON scoring_models(is_active)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_scoring_models_period ON scoring_models(period_start DESC);

-- Seed a default active model so inbound-conversion.js always returns calibrated weights.
INSERT INTO scoring_models (period_start, period_end, weights, is_active)
VALUES (
  CURRENT_DATE - INTERVAL '90 days',
  CURRENT_DATE,
  '{"job_title":25,"company_size":20,"page_intent":20,"engagement":20,"behavior":15}',
  TRUE
)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 5. AI BUDGET
-- Migration 003 already creates this table.  The schema in 003 uses
-- alert_80_sent / alert_100_sent columns which exactly match ai.js.
-- This block is a safety net in case 003 was never applied.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_budget (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  period          CHAR(7)       NOT NULL UNIQUE,   -- 'YYYY-MM'
  budget_usd      NUMERIC(10,2) NOT NULL DEFAULT 500.00,
  spent_usd       NUMERIC(12,4) NOT NULL DEFAULT 0,
  alert_80_sent   BOOLEAN       NOT NULL DEFAULT FALSE,
  alert_100_sent  BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_budget_period ON ai_budget(period);

-- Seed current month so getBudget() in ai.js can always upsert cleanly.
INSERT INTO ai_budget (period, budget_usd)
VALUES (TO_CHAR(NOW(), 'YYYY-MM'), 500.00)
ON CONFLICT (period) DO NOTHING;

-- ─────────────────────────────────────────────
-- 6. INTEGRATIONS CONFIG
-- Migration 004 already creates this table (integration_name, api_key,
-- config_json, enabled).  worker-runner.js queries config_json — compatible.
-- This block is a safety net + adds missing integrations from MEMORY.md.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrations_config (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_name  TEXT UNIQUE NOT NULL,
  api_key           TEXT,
  config_json       JSONB DEFAULT '{}',
  enabled           BOOLEAN DEFAULT FALSE,
  webhook_url       TEXT,
  webhook_secret    TEXT,
  last_sync_at      TIMESTAMPTZ,
  last_error        TEXT,
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- Add columns that may be absent if only 004 was applied.
ALTER TABLE integrations_config
  ADD COLUMN IF NOT EXISTS webhook_url    TEXT;
ALTER TABLE integrations_config
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
ALTER TABLE integrations_config
  ADD COLUMN IF NOT EXISTS last_sync_at   TIMESTAMPTZ;
ALTER TABLE integrations_config
  ADD COLUMN IF NOT EXISTS last_error     TEXT;

-- Seed all integrations referenced in the codebase.
INSERT INTO integrations_config (integration_name) VALUES
  ('sendgrid'),
  ('hubspot'),
  ('linkedin'),
  ('twilio'),
  ('slack'),
  ('google_search_console'),
  ('ahrefs'),
  ('ga4'),
  ('gsc'),
  ('alert_webhook')
ON CONFLICT (integration_name) DO NOTHING;

-- ─────────────────────────────────────────────
-- 7. NOTIFICATIONS — add missing columns
-- Migration 004 creates: id, type, title, message, read_at, metadata, created_at
-- worker-runner.js INSERT only uses (type, title, message, metadata) — already
-- compatible.  We add severity and is_read for richer dashboard filtering.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT,
  severity   TEXT NOT NULL DEFAULT 'info'
               CHECK (severity IN ('info', 'warning', 'critical')),
  is_read    BOOLEAN DEFAULT FALSE,
  read_at    TIMESTAMP,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add columns that may be absent if only 004 was applied.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS is_read  BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON notifications(is_read, created_at DESC)
  WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created  ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_severity ON notifications(severity);

-- ─────────────────────────────────────────────
-- 8. AGENT SCHEDULES
-- Migration 004 already creates this table.  autonomous-loop.js queries:
--   SELECT * FROM agent_schedules WHERE enabled = TRUE
-- The 004 schema is fully compatible.  This block is a safety net and seeds
-- the schedules referenced in autonomous-loop.js that are not in 004.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_name      agent_name NOT NULL,
  job_type        TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  enabled         BOOLEAN DEFAULT TRUE,
  max_daily_cost  NUMERIC(8,4),
  run_count       INTEGER DEFAULT 0,
  failure_count   INTEGER DEFAULT 0,
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  payload         JSONB DEFAULT '{}',
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_name, job_type)
);

-- Add columns that may be absent if only 004 was applied.
ALTER TABLE agent_schedules
  ADD COLUMN IF NOT EXISTS run_count    INTEGER DEFAULT 0;
ALTER TABLE agent_schedules
  ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0;
ALTER TABLE agent_schedules
  ADD COLUMN IF NOT EXISTS last_run_at  TIMESTAMPTZ;
ALTER TABLE agent_schedules
  ADD COLUMN IF NOT EXISTS next_run_at  TIMESTAMPTZ;
ALTER TABLE agent_schedules
  ADD COLUMN IF NOT EXISTS payload      JSONB DEFAULT '{}';

-- Seed schedules from autonomous-loop.js that are missing from 004's seed.
INSERT INTO agent_schedules (agent_name, job_type, cron_expression, enabled) VALUES
  ('seo_demand_capture',   'monitor_competitors',  '0 10 * * 5', true),
  ('authority_content',    'decay_remediation',    '0 11 * * 3', true),
  ('inbound_conversion',   'recalibrate_scoring',  '0 8 * * 1',  true)
ON CONFLICT (agent_name, job_type) DO NOTHING;

-- ─────────────────────────────────────────────
-- 9. EMAILS SENT
-- Tracks every email dispatched via SendGrid.
-- Referenced conceptually by integrations/sendgrid.js nurture queue.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emails_sent (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id             UUID REFERENCES leads(id) ON DELETE SET NULL,
  email_address       TEXT NOT NULL,
  subject             TEXT NOT NULL,
  template_name       TEXT,
  sendgrid_message_id TEXT,
  status              TEXT DEFAULT 'sent'
                        CHECK (status IN ('sent','delivered','opened','clicked','bounced','spam','unsubscribed')),
  opens               INTEGER DEFAULT 0,
  clicks              INTEGER DEFAULT 0,
  sequence_step       INTEGER,
  campaign_id         TEXT,
  metadata            JSONB DEFAULT '{}',
  sent_at             TIMESTAMPTZ DEFAULT NOW(),
  delivered_at        TIMESTAMPTZ,
  first_opened_at     TIMESTAMPTZ,
  first_clicked_at    TIMESTAMPTZ,
  bounced_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_emails_sent_lead   ON emails_sent(lead_id);
CREATE INDEX IF NOT EXISTS idx_emails_sent_status ON emails_sent(status);
CREATE INDEX IF NOT EXISTS idx_emails_sent_date   ON emails_sent(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_sent_msgid  ON emails_sent(sendgrid_message_id);

-- ─────────────────────────────────────────────
-- 10. ADDITIONAL INDEXES ON EXISTING TABLES
-- Improve query performance for dashboard API endpoints and agent queries.
-- ─────────────────────────────────────────────

-- agent_runs
CREATE INDEX IF NOT EXISTS idx_agent_runs_completed      ON agent_runs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_status   ON agent_runs(agent, status);

-- pipeline_events
CREATE INDEX IF NOT EXISTS idx_pipeline_events_lead      ON pipeline_events(lead_id, occurred_at DESC);

-- revenue_events
CREATE INDEX IF NOT EXISTS idx_revenue_events_lead       ON revenue_events(lead_id, occurred_at DESC);

-- content_assets
CREATE INDEX IF NOT EXISTS idx_content_assets_published  ON content_assets(published_at DESC)
  WHERE status = 'published';

-- leads
CREATE INDEX IF NOT EXISTS idx_leads_stage               ON leads(stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_composite_score     ON leads(composite_score DESC NULLS LAST);

-- keywords
CREATE INDEX IF NOT EXISTS idx_keywords_priority_nulls   ON keywords(priority_score DESC NULLS LAST);

-- ─────────────────────────────────────────────
-- 11. AUDIT LOGS
-- Compliance trail for all user and system actions.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       TEXT,
  user_email    TEXT,
  action        TEXT NOT NULL,   -- 'login', 'lead_updated', 'experiment_created', etc.
  resource_type TEXT,
  resource_id   TEXT,
  changes       JSONB DEFAULT '{}',
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user     ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created  ON audit_logs(created_at DESC);

-- ─────────────────────────────────────────────
-- 12. LEAD TAGS
-- Flexible tagging for lead segmentation and nurture routing.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id  UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  added_by TEXT DEFAULT 'system',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (lead_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_tag ON lead_tags(tag);

-- ─────────────────────────────────────────────
-- 13. WEBSITE ANALYTICS
-- Aggregated visitor data per page/date/source for SEO and conversion tracking.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS website_analytics (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_path   TEXT NOT NULL,
  source      TEXT,
  medium      TEXT,
  campaign    TEXT,
  keyword     TEXT,
  sessions    INTEGER DEFAULT 0,
  pageviews   INTEGER DEFAULT 0,
  bounces     INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  period_date DATE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_path, period_date, source, medium)
);

CREATE INDEX IF NOT EXISTS idx_website_analytics_date ON website_analytics(period_date DESC);
CREATE INDEX IF NOT EXISTS idx_website_analytics_path ON website_analytics(page_path, period_date DESC);

-- ─────────────────────────────────────────────
-- 14. USERS — add missing columns
-- Migration 004 creates: id, email, name, role, password_hash, provider,
--   created_at, updated_at.
-- The task specification adds: last_login_at, password_changed_at,
--   must_change_password, is_active.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                 TEXT NOT NULL UNIQUE,
  name                  TEXT,
  role                  TEXT NOT NULL DEFAULT 'viewer'
                          CHECK (role IN ('admin', 'manager', 'analyst', 'editor', 'viewer')),
  password_hash         TEXT,
  provider              TEXT DEFAULT 'credentials',
  is_active             BOOLEAN DEFAULT TRUE,
  last_login_at         TIMESTAMPTZ,
  password_changed_at   TIMESTAMPTZ,
  must_change_password  BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns that may be absent if only 004 was applied.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active            BOOLEAN DEFAULT TRUE;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at        TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at  TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
