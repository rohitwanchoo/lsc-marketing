-- ─────────────────────────────────────────────
-- Migration 003: AI Budget Guardrails
-- Monthly spend tracking with alert flags.
-- Agents check this before each AI call.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_budget (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  period           CHAR(7)       NOT NULL UNIQUE,  -- 'YYYY-MM'
  budget_usd       NUMERIC(10,2) NOT NULL DEFAULT 500.00,
  spent_usd        NUMERIC(12,4) NOT NULL DEFAULT 0,
  alert_80_sent    BOOLEAN       NOT NULL DEFAULT FALSE,
  alert_100_sent   BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_budget_period ON ai_budget (period);

-- Bootstrap current month with default $500 budget.
-- Set MONTHLY_AI_BUDGET_USD env var to override per-period after seeding.
INSERT INTO ai_budget (period, budget_usd)
VALUES (TO_CHAR(NOW(), 'YYYY-MM'), 500.00)
ON CONFLICT (period) DO NOTHING;
