-- ============================================================
-- Migration 002: Dynamic Lead Scoring Models
-- Run: psql $DATABASE_URL -f migrations/002_scoring_models.sql
-- ============================================================

-- Stores calibrated scoring weights produced by the Python analytics API.
-- One active row at a time; previous rows kept for audit trail.
CREATE TABLE IF NOT EXISTS scoring_models (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  -- Weights as returned by Python /scoring/enhance endpoint (sum to 100)
  weights       JSONB NOT NULL DEFAULT '{
    "job_title":    25,
    "company_size": 20,
    "page_intent":  20,
    "engagement":   20,
    "behavior":     15
  }',
  -- Performance of this model on the calibration sample
  win_rate      NUMERIC(6,4),   -- 0-1: fraction of leads that converted
  sample_size   INTEGER,        -- total leads used to calibrate
  won_sample    INTEGER,        -- customer leads used
  lost_sample   INTEGER,        -- churned/stalled leads used
  -- Python API full response for traceability
  raw_response  JSONB DEFAULT '{}',
  is_active     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scoring_models_active ON scoring_models(is_active);
CREATE INDEX IF NOT EXISTS idx_scoring_models_period ON scoring_models(period_start DESC);
