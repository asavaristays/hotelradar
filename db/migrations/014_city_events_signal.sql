CREATE TABLE IF NOT EXISTS city_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  event_name TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  scale TEXT NOT NULL DEFAULT 'medium',
  estimated_attendance INTEGER,
  radius_impact_km INTEGER NOT NULL DEFAULT 15,
  source TEXT NOT NULL DEFAULT 'manual',
  confidence TEXT NOT NULL DEFAULT 'confirmed',
  venue_lat NUMERIC(9,6),
  venue_lng NUMERIC(9,6),
  event_url TEXT,
  impact_score NUMERIC(8,2) NOT NULL DEFAULT 8,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date),
  CHECK (scale IN ('small', 'medium', 'large')),
  CHECK (confidence IN ('confirmed', 'tentative', 'rumor')),
  CHECK (radius_impact_km BETWEEN 1 AND 200),
  CHECK (impact_score BETWEEN 0 AND 40)
);

ALTER TABLE city_events ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS scale TEXT;
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS estimated_attendance INTEGER;
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS radius_impact_km INTEGER;
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS confidence TEXT;
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS venue_lat NUMERIC(9,6);
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS venue_lng NUMERIC(9,6);
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS event_url TEXT;
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS impact_score NUMERIC(8,2);
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ;
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE city_events
SET
  venue = COALESCE(venue, ''),
  category = COALESCE(NULLIF(category, ''), 'general'),
  scale = COALESCE(NULLIF(scale, ''), 'medium'),
  radius_impact_km = COALESCE(radius_impact_km, 15),
  source = COALESCE(NULLIF(source, ''), 'manual'),
  confidence = COALESCE(NULLIF(confidence, ''), 'confirmed'),
  impact_score = COALESCE(impact_score, 8),
  scraped_at = COALESCE(scraped_at, NOW()),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

ALTER TABLE city_events ALTER COLUMN venue SET DEFAULT '';
ALTER TABLE city_events ALTER COLUMN category SET DEFAULT 'general';
ALTER TABLE city_events ALTER COLUMN scale SET DEFAULT 'medium';
ALTER TABLE city_events ALTER COLUMN radius_impact_km SET DEFAULT 15;
ALTER TABLE city_events ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE city_events ALTER COLUMN confidence SET DEFAULT 'confirmed';
ALTER TABLE city_events ALTER COLUMN impact_score SET DEFAULT 8;
ALTER TABLE city_events ALTER COLUMN scraped_at SET DEFAULT NOW();
ALTER TABLE city_events ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE city_events ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE city_events ALTER COLUMN venue SET NOT NULL;
ALTER TABLE city_events ALTER COLUMN category SET NOT NULL;
ALTER TABLE city_events ALTER COLUMN scale SET NOT NULL;
ALTER TABLE city_events ALTER COLUMN radius_impact_km SET NOT NULL;
ALTER TABLE city_events ALTER COLUMN source SET NOT NULL;
ALTER TABLE city_events ALTER COLUMN confidence SET NOT NULL;
ALTER TABLE city_events ALTER COLUMN impact_score SET NOT NULL;
ALTER TABLE city_events ALTER COLUMN scraped_at SET NOT NULL;
ALTER TABLE city_events ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE city_events ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'city_events_end_date_check'
  ) THEN
    ALTER TABLE city_events
    ADD CONSTRAINT city_events_end_date_check CHECK (end_date >= start_date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'city_events_scale_check'
  ) THEN
    ALTER TABLE city_events
    ADD CONSTRAINT city_events_scale_check CHECK (scale IN ('small', 'medium', 'large'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'city_events_confidence_check'
  ) THEN
    ALTER TABLE city_events
    ADD CONSTRAINT city_events_confidence_check CHECK (confidence IN ('confirmed', 'tentative', 'rumor'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'city_events_radius_check'
  ) THEN
    ALTER TABLE city_events
    ADD CONSTRAINT city_events_radius_check CHECK (radius_impact_km BETWEEN 1 AND 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'city_events_impact_check'
  ) THEN
    ALTER TABLE city_events
    ADD CONSTRAINT city_events_impact_check CHECK (impact_score BETWEEN 0 AND 40);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_city_events_dedupe
  ON city_events (city, event_name, start_date, venue, source);

CREATE INDEX IF NOT EXISTS idx_city_events_city_window
  ON city_events (city, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_city_events_scraped_desc
  ON city_events (city, scraped_at DESC);
