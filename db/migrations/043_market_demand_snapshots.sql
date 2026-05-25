CREATE TABLE IF NOT EXISTS market_demand_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
  stay_date DATE NOT NULL,
  demand_score NUMERIC(5,2) NOT NULL CHECK (demand_score >= 0 AND demand_score <= 100),
  confidence_score NUMERIC(5,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  demand_level TEXT NOT NULL CHECK (demand_level IN ('Low', 'Normal', 'Rising', 'High', 'Compression')),
  pricing_action TEXT NOT NULL CHECK (pricing_action IN ('Reduce', 'Hold', 'Watch', 'Increase', 'Strong Increase', 'Review Only')),
  price_adjustment_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  trust_status TEXT NOT NULL CHECK (trust_status IN ('actionable', 'review_only', 'stale', 'insufficient_data')),
  top_drivers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  freshness_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (city, stay_date)
);

CREATE INDEX IF NOT EXISTS idx_market_demand_snapshots_city_stay_date
  ON market_demand_snapshots(city, stay_date);

CREATE INDEX IF NOT EXISTS idx_market_demand_snapshots_computed_at
  ON market_demand_snapshots(computed_at DESC);
