CREATE TABLE IF NOT EXISTS market_ranked_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
  hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  score NUMERIC(12,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_ranked_opportunities_city_score
  ON market_ranked_opportunities(city, score DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_ranked_opportunities_hotel
  ON market_ranked_opportunities(hotel_id, created_at DESC);
