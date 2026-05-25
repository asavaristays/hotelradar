CREATE TABLE IF NOT EXISTS market_live_signals (
  id BIGSERIAL PRIMARY KEY,
  external_key TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur', 'Delhi', 'Gurugram')),
  signal_type TEXT NOT NULL CHECK (
    signal_type IN (
      'HIGH_REVIEW_ACTIVITY',
      'REPUTATION_WEAKNESS',
      'CHATBOT_GAP',
      'OTA_DEPENDENCE',
      'DEMAND_SURGE_CLUSTER',
      'PRICE_PRESSURE',
      'EVENT_DEMAND_ZONE',
      'WEDDING_DEMAND_ZONE',
      'CORPORATE_EVENT_CLUSTER',
      'TOURISM_SPIKE',
      'AIRPORT_DEMAND',
      'WEEKEND_COMPRESSION',
      'FESTIVAL_DEMAND'
    )
  ),
  source TEXT NOT NULL,
  source_ref TEXT,
  title TEXT NOT NULL,
  description TEXT,
  recommended_action TEXT,
  impact_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  confidence_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('raw', 'staged', 'released', 'expired', 'rejected')),
  observed_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  fresh_until TIMESTAMPTZ NOT NULL,
  expired_at TIMESTAMPTZ,
  validation_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_live_signals_city_status_fresh
  ON market_live_signals(city, status, fresh_until DESC);

CREATE INDEX IF NOT EXISTS idx_market_live_signals_source
  ON market_live_signals(source, signal_type, observed_at DESC);
