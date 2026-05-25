CREATE TABLE IF NOT EXISTS market_opportunity_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  opportunity_score NUMERIC(12,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  read_status BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_market_opportunity_notifications_hotel_created
  ON market_opportunity_notifications(hotel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_opportunity_notifications_signal
  ON market_opportunity_notifications(signal_type, opportunity_score DESC);
