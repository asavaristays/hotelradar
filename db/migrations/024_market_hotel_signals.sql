CREATE TABLE IF NOT EXISTS market_hotel_signals (
  hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('HIGH_REVIEW_ACTIVITY')),
  signal_strength NUMERIC(10,4) NOT NULL CHECK (signal_strength >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hotel_id, signal_type)
);

CREATE INDEX IF NOT EXISTS idx_market_hotel_signals_signal_type
  ON market_hotel_signals(signal_type, signal_strength DESC);
