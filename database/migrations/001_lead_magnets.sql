-- ============================================================
-- Migration 001: Lead Magnet Delivery System
-- Run: psql $DATABASE_URL -f migrations/001_lead_magnets.sql
-- ============================================================

-- Dedicated table for downloadable lead magnets
-- (content_type='lead_magnet' rows in content_assets are the parent)
CREATE TABLE IF NOT EXISTS lead_magnets (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_asset_id UUID REFERENCES content_assets(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  file_url         TEXT NOT NULL,           -- S3/GCS/CDN link to PDF, template, etc.
  type             TEXT NOT NULL            -- 'checklist','template','audit','guide','report','video'
                     CHECK (type IN ('checklist','template','audit','guide','report','video')),
  download_count   INTEGER DEFAULT 0,
  leads_captured   INTEGER DEFAULT 0,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_magnets_asset ON lead_magnets(content_asset_id);
CREATE INDEX IF NOT EXISTS idx_lead_magnets_active ON lead_magnets(is_active);

-- Signed, time-limited download tokens
-- Generated when a visitor submits the lead capture form on a page
CREATE TABLE IF NOT EXISTS lead_magnet_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token           TEXT UNIQUE NOT NULL,         -- HMAC-SHA256 signed, URL-safe
  lead_magnet_id  UUID NOT NULL REFERENCES lead_magnets(id) ON DELETE CASCADE,
  lead_id         UUID REFERENCES leads(id),    -- populated on first download
  email           TEXT,                         -- pre-populated from form, used to create lead
  full_name       TEXT,
  company         TEXT,
  source_page     TEXT,                         -- which page generated this token
  expires_at      TIMESTAMP NOT NULL,
  downloaded_at   TIMESTAMP,                    -- NULL until redeemed
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lmt_token         ON lead_magnet_tokens(token);
CREATE INDEX IF NOT EXISTS idx_lmt_lead_magnet   ON lead_magnet_tokens(lead_magnet_id);
CREATE INDEX IF NOT EXISTS idx_lmt_lead          ON lead_magnet_tokens(lead_id);
CREATE INDEX IF NOT EXISTS idx_lmt_expires       ON lead_magnet_tokens(expires_at);
