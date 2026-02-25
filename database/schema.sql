-- ============================================================
-- LSC Marketing Automation — Organic Revenue Platform
-- Schema: content → lead → pipeline → revenue attribution
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE keyword_intent AS ENUM ('BOFU', 'MOFU', 'TOFU', 'navigational');
CREATE TYPE content_type   AS ENUM ('landing_page', 'comparison', 'case_study', 'blog', 'email', 'social_post', 'lead_magnet', 'use_case');
CREATE TYPE content_status AS ENUM ('draft', 'review', 'published', 'archived', 'killed');
CREATE TYPE lead_stage     AS ENUM ('visitor', 'prospect', 'mql', 'sql', 'opportunity', 'customer', 'churned');
CREATE TYPE channel_type   AS ENUM ('organic_search', 'linkedin', 'email', 'direct', 'referral', 'whatsapp');
CREATE TYPE experiment_status AS ENUM ('running', 'winner_found', 'inconclusive', 'killed');
CREATE TYPE agent_name     AS ENUM (
  'revenue_orchestrator',
  'seo_demand_capture',
  'authority_content',
  'social_distribution',
  'inbound_conversion',
  'revenue_analytics',
  'compounding_growth'
);

-- ============================================================
-- 1. KEYWORDS — SEO Demand Capture foundation
-- ============================================================

CREATE TABLE keywords (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword         TEXT NOT NULL UNIQUE,
  intent          keyword_intent NOT NULL,
  search_volume   INTEGER DEFAULT 0,
  difficulty      NUMERIC(4,1),               -- 0-100
  cpc_usd         NUMERIC(8,2),
  serp_position   NUMERIC(5,1),               -- current rank
  target_position INTEGER DEFAULT 10,
  competitor_urls JSONB DEFAULT '[]',
  revenue_attr    NUMERIC(12,2) DEFAULT 0,    -- $ revenue attributed
  leads_attr      INTEGER DEFAULT 0,
  priority_score  NUMERIC(6,2),               -- computed by analytics agent
  gsc_data        JSONB DEFAULT '{}',         -- Google Search Console raw
  last_audited_at TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_keywords_intent    ON keywords(intent);
CREATE INDEX idx_keywords_priority  ON keywords(priority_score DESC);
CREATE INDEX idx_keywords_revenue   ON keywords(revenue_attr DESC);

-- ============================================================
-- 2. CONTENT ASSETS — Every piece of content tracked to revenue
-- ============================================================

CREATE TABLE content_assets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  slug            TEXT UNIQUE,
  content_type    content_type NOT NULL,
  status          content_status DEFAULT 'draft',
  channel         channel_type,
  body_html       TEXT,
  body_markdown   TEXT,
  meta_title      TEXT,
  meta_description TEXT,
  target_keywords UUID[] DEFAULT '{}',        -- FK refs to keywords
  internal_links  UUID[] DEFAULT '{}',        -- other content_assets
  word_count      INTEGER,
  readability_score NUMERIC(4,1),
  seo_score       NUMERIC(4,1),               -- 0-100
  eeat_score      NUMERIC(4,1),               -- 0-100
  published_url   TEXT,
  published_at    TIMESTAMP,
  -- Revenue attribution
  pageviews       INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  revenue_attr    NUMERIC(12,2) DEFAULT 0,
  conversion_rate NUMERIC(6,4) DEFAULT 0,
  -- AI metadata
  generated_by    agent_name,
  prompt_version  TEXT,
  ai_model        TEXT,
  generation_time_ms INTEGER,
  -- Lifecycle
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  killed_at       TIMESTAMP,
  kill_reason     TEXT
);

CREATE INDEX idx_content_status   ON content_assets(status);
CREATE INDEX idx_content_type     ON content_assets(content_type);
CREATE INDEX idx_content_revenue  ON content_assets(revenue_attr DESC);
CREATE INDEX idx_content_leads    ON content_assets(leads_generated DESC);

-- ============================================================
-- 3. LEADS — Full lifecycle from visitor to customer
-- ============================================================

CREATE TABLE leads (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             TEXT UNIQUE NOT NULL,
  full_name         TEXT,
  company           TEXT,
  job_title         TEXT,
  linkedin_url      TEXT,
  phone             TEXT,
  whatsapp          TEXT,
  -- Attribution
  first_touch_channel  channel_type,
  first_touch_keyword  UUID REFERENCES keywords(id),
  first_touch_content  UUID REFERENCES content_assets(id),
  first_touch_url      TEXT,
  last_touch_channel   channel_type,
  last_touch_content   UUID REFERENCES content_assets(id),
  utm_source           TEXT,
  utm_medium           TEXT,
  utm_campaign         TEXT,
  referrer             TEXT,
  -- Scoring
  stage                lead_stage DEFAULT 'prospect',
  intent_score         NUMERIC(4,1) DEFAULT 0,    -- 0-100
  engagement_score     NUMERIC(4,1) DEFAULT 0,
  fit_score            NUMERIC(4,1) DEFAULT 0,
  composite_score      NUMERIC(4,1) DEFAULT 0,    -- weighted avg
  -- Behavioral signals
  pages_visited        JSONB DEFAULT '[]',
  content_consumed     UUID[] DEFAULT '{}',
  email_opens          INTEGER DEFAULT 0,
  email_clicks         INTEGER DEFAULT 0,
  social_interactions  JSONB DEFAULT '{}',
  calendar_visits      INTEGER DEFAULT 0,
  -- CRM sync
  crm_id               TEXT,
  crm_provider         TEXT,
  crm_synced_at        TIMESTAMP,
  -- Nurture state
  nurture_sequence     TEXT,
  nurture_step         INTEGER DEFAULT 0,
  next_follow_up_at    TIMESTAMP,
  do_not_contact       BOOLEAN DEFAULT FALSE,
  -- Timestamps
  created_at           TIMESTAMP DEFAULT NOW(),
  qualified_at         TIMESTAMP,
  converted_at         TIMESTAMP,
  churned_at           TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_leads_stage        ON leads(stage);
CREATE INDEX idx_leads_score        ON leads(composite_score DESC);
CREATE INDEX idx_leads_follow_up    ON leads(next_follow_up_at);
CREATE INDEX idx_leads_email        ON leads(email);

-- ============================================================
-- 4. PIPELINE EVENTS — Every touchpoint in the buyer journey
-- ============================================================

CREATE TABLE pipeline_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,    -- 'page_view','form_submit','email_open','booked_call','deal_won'
  channel       channel_type,
  content_id    UUID REFERENCES content_assets(id),
  keyword_id    UUID REFERENCES keywords(id),
  metadata      JSONB DEFAULT '{}',
  session_id    TEXT,
  ip_address    INET,
  user_agent    TEXT,
  occurred_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pipeline_lead     ON pipeline_events(lead_id);
CREATE INDEX idx_pipeline_event    ON pipeline_events(event_type);
CREATE INDEX idx_pipeline_time     ON pipeline_events(occurred_at DESC);

-- ============================================================
-- 5. REVENUE EVENTS — Actual money, attributed to sources
-- ============================================================

CREATE TABLE revenue_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id         UUID NOT NULL REFERENCES leads(id),
  type            TEXT NOT NULL,        -- 'new_mrr','expansion','churn','refund'
  amount_usd      NUMERIC(12,2) NOT NULL,
  mrr_delta       NUMERIC(12,2),
  -- Multi-touch attribution
  attribution     JSONB DEFAULT '{}',   -- {keyword_id, content_id, channel, weight}
  first_touch_content  UUID REFERENCES content_assets(id),
  last_touch_content   UUID REFERENCES content_assets(id),
  first_touch_keyword  UUID REFERENCES keywords(id),
  -- Metadata
  product         TEXT,
  plan            TEXT,
  invoice_id      TEXT,
  notes           TEXT,
  occurred_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_revenue_lead     ON revenue_events(lead_id);
CREATE INDEX idx_revenue_time     ON revenue_events(occurred_at DESC);
CREATE INDEX idx_revenue_amount   ON revenue_events(amount_usd DESC);

-- ============================================================
-- 6. EXPERIMENTS — A/B tests managed by AI
-- ============================================================

CREATE TABLE experiments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  hypothesis      TEXT NOT NULL,
  element         TEXT,               -- 'headline','cta','layout','copy'
  content_a       UUID REFERENCES content_assets(id),
  content_b       UUID REFERENCES content_assets(id),
  traffic_split   NUMERIC(4,2) DEFAULT 0.50,
  status          experiment_status DEFAULT 'running',
  -- Results
  visitors_a      INTEGER DEFAULT 0,
  visitors_b      INTEGER DEFAULT 0,
  conversions_a   INTEGER DEFAULT 0,
  conversions_b   INTEGER DEFAULT 0,
  revenue_a       NUMERIC(12,2) DEFAULT 0,
  revenue_b       NUMERIC(12,2) DEFAULT 0,
  confidence      NUMERIC(5,2),       -- statistical confidence %
  winner          TEXT,               -- 'a','b', or NULL
  winner_uplift   NUMERIC(6,4),       -- % improvement
  -- Lifecycle
  started_at      TIMESTAMP DEFAULT NOW(),
  ended_at        TIMESTAMP,
  agent_decision  TEXT,               -- why agent killed/scaled
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 7. PLAYBOOKS — Learned growth patterns
-- ============================================================

CREATE TABLE playbooks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,      -- 'keyword_strategy','content_pattern','nurture_sequence'
  description     TEXT,
  trigger_conditions JSONB,           -- when to apply this playbook
  action_steps    JSONB,              -- ordered steps to execute
  performance     JSONB DEFAULT '{}', -- tracked results when applied
  times_applied   INTEGER DEFAULT 0,
  avg_roi         NUMERIC(8,2),
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      agent_name,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 8. AGENT RUNS — Full audit trail of every agent action
-- ============================================================

CREATE TABLE agent_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent           agent_name NOT NULL,
  job_type        TEXT NOT NULL,
  status          TEXT DEFAULT 'running',  -- 'running','success','failed','partial'
  input           JSONB DEFAULT '{}',
  output          JSONB DEFAULT '{}',
  actions_taken   JSONB DEFAULT '[]',
  tokens_used     INTEGER,
  cost_usd        NUMERIC(8,4),
  duration_ms     INTEGER,
  error           TEXT,
  triggered_by    TEXT,               -- 'scheduler','orchestrator','webhook','manual'
  started_at      TIMESTAMP DEFAULT NOW(),
  completed_at    TIMESTAMP
);

CREATE INDEX idx_agent_runs_agent  ON agent_runs(agent);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_runs_time   ON agent_runs(started_at DESC);

-- ============================================================
-- 9. GROWTH GOALS — Orchestrator sets weekly/monthly targets
-- ============================================================

CREATE TABLE growth_goals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period          TEXT NOT NULL,        -- 'weekly','monthly'
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  -- Targets
  target_leads    INTEGER,
  target_mrr_usd  NUMERIC(12,2),
  target_organic_traffic INTEGER,
  target_cac_usd  NUMERIC(8,2),
  target_keyword_positions JSONB DEFAULT '{}',
  -- Actuals
  actual_leads    INTEGER DEFAULT 0,
  actual_mrr_usd  NUMERIC(12,2) DEFAULT 0,
  actual_organic_traffic INTEGER DEFAULT 0,
  actual_cac_usd  NUMERIC(8,2),
  -- Status
  status          TEXT DEFAULT 'active', -- 'active','achieved','missed','revised'
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 10. SOCIAL POSTS — Social distribution tracking
-- ============================================================

CREATE TABLE social_posts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_asset_id UUID REFERENCES content_assets(id),
  platform        TEXT NOT NULL,       -- 'linkedin','twitter','instagram','facebook'
  post_body       TEXT NOT NULL,
  hashtags        TEXT[],
  media_urls      TEXT[],
  scheduled_at    TIMESTAMP,
  published_at    TIMESTAMP,
  platform_post_id TEXT,
  -- Engagement
  impressions     INTEGER DEFAULT 0,
  engagements     INTEGER DEFAULT 0,
  clicks          INTEGER DEFAULT 0,
  profile_visits  INTEGER DEFAULT 0,
  dm_intents      INTEGER DEFAULT 0,   -- high-intent DMs detected
  leads_generated INTEGER DEFAULT 0,
  -- AB variant
  variant         TEXT,                -- 'a','b'
  experiment_id   UUID REFERENCES experiments(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_social_platform  ON social_posts(platform);
CREATE INDEX idx_social_leads     ON social_posts(leads_generated DESC);

-- ============================================================
-- 11. NURTURE SEQUENCES — Email/WhatsApp drip campaigns
-- ============================================================

CREATE TABLE nurture_sequences (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  trigger_stage   lead_stage,
  trigger_score   NUMERIC(4,1),         -- min score to enter
  steps           JSONB NOT NULL,        -- [{day, channel, template_id, subject, body}]
  is_active       BOOLEAN DEFAULT TRUE,
  total_enrolled  INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0,
  conversion_rate NUMERIC(6,4),
  created_by      agent_name,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- VIEWS — Pre-built analytics
-- ============================================================

CREATE VIEW v_revenue_by_keyword AS
SELECT
  k.keyword,
  k.intent,
  k.serp_position,
  COUNT(DISTINCT l.id)        AS total_leads,
  SUM(re.amount_usd)          AS total_revenue,
  AVG(re.amount_usd)          AS avg_deal_size,
  SUM(re.amount_usd) / NULLIF(COUNT(DISTINCT l.id), 0) AS revenue_per_lead
FROM keywords k
LEFT JOIN leads l ON l.first_touch_keyword = k.id
LEFT JOIN revenue_events re ON re.first_touch_keyword = k.id
GROUP BY k.id, k.keyword, k.intent, k.serp_position
ORDER BY total_revenue DESC NULLS LAST;

CREATE VIEW v_revenue_by_content AS
SELECT
  ca.title,
  ca.content_type,
  ca.slug,
  ca.pageviews,
  ca.leads_generated,
  ca.conversion_rate,
  ca.revenue_attr,
  ca.revenue_attr / NULLIF(ca.pageviews, 0) AS revenue_per_visitor,
  ca.status,
  ca.published_at
FROM content_assets ca
ORDER BY ca.revenue_attr DESC NULLS LAST;

CREATE VIEW v_pipeline_velocity AS
SELECT
  DATE_TRUNC('week', l.created_at)  AS week,
  COUNT(*)                           AS new_leads,
  COUNT(*) FILTER (WHERE l.stage IN ('sql','opportunity','customer')) AS qualified,
  COUNT(*) FILTER (WHERE l.stage = 'customer')  AS customers,
  AVG(EXTRACT(EPOCH FROM (l.qualified_at - l.created_at))/86400) AS days_to_qualify,
  AVG(EXTRACT(EPOCH FROM (l.converted_at - l.created_at))/86400) AS days_to_convert
FROM leads l
GROUP BY week
ORDER BY week DESC;

CREATE VIEW v_organic_kpis AS
SELECT
  (SELECT COUNT(*) FROM leads WHERE created_at >= NOW() - INTERVAL '30 days') AS leads_30d,
  (SELECT COUNT(*) FROM leads WHERE created_at >= NOW() - INTERVAL '7 days')  AS leads_7d,
  (SELECT COALESCE(SUM(amount_usd),0) FROM revenue_events WHERE occurred_at >= NOW() - INTERVAL '30 days') AS revenue_30d,
  (SELECT COUNT(*) FROM content_assets WHERE status = 'published') AS published_assets,
  (SELECT COUNT(*) FROM keywords WHERE serp_position <= 10)        AS keywords_page1,
  (SELECT COUNT(*) FROM experiments WHERE status = 'running')      AS active_experiments,
  (SELECT COUNT(*) FROM agent_runs WHERE started_at >= NOW() - INTERVAL '24 hours') AS agent_runs_24h;
