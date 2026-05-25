CREATE TABLE IF NOT EXISTS market_hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_name TEXT NOT NULL,
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  google_rating NUMERIC(3,2),
  review_count INTEGER,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_hotels_google_rating_check
    CHECK (google_rating IS NULL OR (google_rating >= 0 AND google_rating <= 5.00)),
  CONSTRAINT market_hotels_review_count_check
    CHECK (review_count IS NULL OR review_count >= 0),
  CONSTRAINT market_hotels_hotel_name_city_unique
    UNIQUE (hotel_name, city)
);

CREATE INDEX IF NOT EXISTS idx_market_hotels_city_hotel_name
  ON market_hotels(city, hotel_name);
