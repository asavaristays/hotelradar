CREATE TABLE IF NOT EXISTS property_research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_name TEXT NOT NULL,
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
  area TEXT,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'review_required', 'completed', 'failed')),
  confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 100),
  confidence_label TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence_label IN ('low', 'medium', 'high')),
  summary TEXT,
  failure_reason TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS property_research_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES property_research_jobs(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('website', 'google', 'ota', 'competitor', 'operator')),
  source_url TEXT NOT NULL,
  final_url TEXT,
  page_title TEXT,
  raw_value TEXT,
  normalized_value TEXT,
  http_status INTEGER,
  reachable BOOLEAN NOT NULL DEFAULT FALSE,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  matched_hotel_name BOOLEAN NOT NULL DEFAULT FALSE,
  match_score NUMERIC(5,4) NOT NULL DEFAULT 0
    CHECK (match_score >= 0 AND match_score <= 1),
  rating_value NUMERIC(3,2),
  review_count INTEGER,
  booking_engine_url TEXT,
  contact_url TEXT,
  rooms_url TEXT,
  confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 100),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS property_research_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES property_research_jobs(id) ON DELETE CASCADE,
  market_hotel_id UUID REFERENCES market_hotels(id) ON DELETE SET NULL,
  hotel_name TEXT NOT NULL,
  city TEXT NOT NULL CHECK (city IN ('Goa', 'Mumbai', 'Jaipur')),
  distance_km NUMERIC(8,3),
  google_rating NUMERIC(3,2),
  review_count INTEGER,
  source TEXT NOT NULL DEFAULT 'market_index',
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (research_job_id, hotel_name, city)
);

CREATE INDEX IF NOT EXISTS idx_property_research_jobs_city_created
  ON property_research_jobs(city, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_property_research_evidence_job_source
  ON property_research_evidence(research_job_id, source_type);

CREATE INDEX IF NOT EXISTS idx_property_research_competitors_job
  ON property_research_competitors(research_job_id, distance_km NULLS LAST);
