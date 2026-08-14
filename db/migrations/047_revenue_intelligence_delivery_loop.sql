CREATE TABLE IF NOT EXISTS revenue_intelligence_brief_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  stay_date DATE,
  channel TEXT NOT NULL DEFAULT 'manual' CHECK (channel IN ('manual', 'whatsapp', 'email', 'dashboard', 'api')),
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'queued', 'sent', 'failed', 'reviewed')),
  pricing_action TEXT,
  confidence_score NUMERIC(5,2),
  trust_status TEXT,
  brief_text TEXT NOT NULL DEFAULT '',
  model_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  delivery_error TEXT,
  feedback_status TEXT CHECK (feedback_status IN ('accepted', 'rejected', 'needs_followup', 'client_question', 'not_reviewed')),
  feedback_note TEXT,
  feedback_by UUID REFERENCES users(id) ON DELETE SET NULL,
  feedback_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_revenue_brief_deliveries_hotel_generated
  ON revenue_intelligence_brief_deliveries(hotel_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_brief_deliveries_status
  ON revenue_intelligence_brief_deliveries(status, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_brief_deliveries_feedback
  ON revenue_intelligence_brief_deliveries(feedback_status, feedback_at DESC);
