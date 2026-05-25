CREATE TABLE IF NOT EXISTS hotel_enrichment (
  hotel_id UUID PRIMARY KEY REFERENCES hotels(id) ON DELETE CASCADE,
  public_rating NUMERIC(3,2),
  review_count INTEGER,
  rating_source TEXT,
  review_source TEXT,
  has_chatbot BOOLEAN,
  chatbot_provider TEXT,
  ota_channels JSONB,
  rating_last_checked_at TIMESTAMPTZ,
  review_last_checked_at TIMESTAMPTZ,
  chatbot_detected_at TIMESTAMPTZ,
  ota_presence_last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hotel_enrichment_review_count_check
    CHECK (review_count IS NULL OR review_count >= 0),
  CONSTRAINT hotel_enrichment_public_rating_check
    CHECK (public_rating IS NULL OR (public_rating >= 0 AND public_rating <= 9.99)),
  CONSTRAINT hotel_enrichment_ota_channels_object_check
    CHECK (ota_channels IS NULL OR jsonb_typeof(ota_channels) IN ('array', 'object'))
);
