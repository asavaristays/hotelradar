CREATE TABLE IF NOT EXISTS market_hotel_benchmarks (
  hotel_id UUID PRIMARY KEY REFERENCES market_hotels(id) ON DELETE CASCADE,
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
  nearby_hotel_count INTEGER NOT NULL DEFAULT 0 CHECK (nearby_hotel_count >= 0),
  avg_nearby_rating NUMERIC(6,3),
  avg_nearby_reviews NUMERIC(12,3),
  nearby_signal_count INTEGER NOT NULL DEFAULT 0 CHECK (nearby_signal_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_hotel_benchmarks_city
  ON market_hotel_benchmarks(city, nearby_hotel_count DESC, nearby_signal_count DESC);
