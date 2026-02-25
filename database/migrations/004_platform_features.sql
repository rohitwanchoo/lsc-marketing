-- ============================================================
-- Migration 004: Platform Features
-- Multi-user auth, integrations config, lead timeline,
-- SERP history, agent schedules, notifications
-- ============================================================

-- ─────────────────────────────────────────────
-- Multi-user auth
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','editor','viewer')),
  password_hash TEXT,
  provider      TEXT DEFAULT 'credentials',
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─────────────────────────────────────────────
-- Integration API key storage
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrations_config (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_name  TEXT UNIQUE NOT NULL,
  api_key           TEXT,
  config_json       JSONB DEFAULT '{}',
  enabled           BOOLEAN DEFAULT FALSE,
  updated_at        TIMESTAMP DEFAULT NOW()
);
INSERT INTO integrations_config (integration_name) VALUES
  ('linkedin'),('hubspot'),('slack'),('ga4'),('gsc'),('sendgrid'),('ahrefs'),('alert_webhook')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- Lead activity timeline
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_timeline (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN
                ('email_sent','page_visit','form_submit','stage_change','call','note','enriched')),
  event_data  JSONB DEFAULT '{}',
  source      TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_timeline_lead ON lead_timeline(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_timeline_time ON lead_timeline(created_at DESC);

-- ─────────────────────────────────────────────
-- SERP position history for sparklines
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS keyword_serp_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id    UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  position      NUMERIC(5,1),
  search_volume INTEGER,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  source        TEXT DEFAULT 'gsc',
  created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_serp_history_keyword ON keyword_serp_history(keyword_id);
CREATE INDEX IF NOT EXISTS idx_serp_history_date    ON keyword_serp_history(date DESC);

-- ─────────────────────────────────────────────
-- Agent cron schedules (editable from UI)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_name      agent_name NOT NULL,
  job_type        TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  enabled         BOOLEAN DEFAULT TRUE,
  max_daily_cost  NUMERIC(8,4),
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_name, job_type)
);
INSERT INTO agent_schedules (agent_name, job_type, cron_expression) VALUES
  ('revenue_orchestrator', 'daily_dispatch',       '0 6 * * *'),
  ('revenue_orchestrator', 'weekly_review',        '0 5 * * 1'),
  ('seo_demand_capture',   'technical_audit',      '0 7 * * *'),
  ('seo_demand_capture',   'keyword_discovery',    '0 10 * * 3'),
  ('authority_content',    'linkedin_strategy',    '0 9 * * 2'),
  ('inbound_conversion',   'follow_up_queue',      '0 9 * * *'),
  ('social_distribution',  'analyze_engagement',   '0 18 * * *'),
  ('revenue_analytics',    'weekly_intelligence',  '0 8 * * 1'),
  ('compounding_growth',   'extract_patterns',     '0 14 * * 4'),
  ('compounding_growth',   '90_day_roadmap',       '0 6 1 * *')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- Notifications
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT,
  read_at    TIMESTAMP,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- ─────────────────────────────────────────────
-- ALTER TABLE: content approval workflow
-- ─────────────────────────────────────────────
ALTER TABLE content_assets
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('draft','pending_review','approved','published'));
UPDATE content_assets SET approval_status = 'published' WHERE status = 'published';

-- ─────────────────────────────────────────────
-- ALTER TABLE: keyword clustering
-- ─────────────────────────────────────────────
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS cluster_name TEXT;
CREATE INDEX IF NOT EXISTS idx_keywords_cluster ON keywords(cluster_name);

-- ─────────────────────────────────────────────
-- ALTER TABLE: lead owner assignment
-- ─────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- ─────────────────────────────────────────────
-- Seed: default admin user (password: changeme — bcrypt hash)
-- ─────────────────────────────────────────────
INSERT INTO users (email, name, role, password_hash, provider)
VALUES ('admin@lsc.local', 'Admin', 'admin',
        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- 'password'
        'credentials')
ON CONFLICT (email) DO NOTHING;
