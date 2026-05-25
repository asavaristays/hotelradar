CREATE TABLE IF NOT EXISTS market_hotel_neighbors (
  hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  neighbor_hotel_id UUID NOT NULL REFERENCES market_hotels(id) ON DELETE CASCADE,
  distance_km NUMERIC(8,3) NOT NULL CHECK (distance_km >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hotel_id, neighbor_hotel_id),
  CONSTRAINT market_hotel_neighbors_not_self
    CHECK (hotel_id <> neighbor_hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_market_hotel_neighbors_hotel_id
  ON market_hotel_neighbors(hotel_id, distance_km);

CREATE INDEX IF NOT EXISTS idx_market_hotel_neighbors_neighbor_hotel_id
  ON market_hotel_neighbors(neighbor_hotel_id);
