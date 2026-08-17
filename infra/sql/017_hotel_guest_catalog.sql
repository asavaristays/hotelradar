-- Guest-facing hotel catalog fields for HotelRADAR onboarding (independent of Asavari).

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS hotel_category TEXT NULL,
  ADD COLUMN IF NOT EXISTS amenities TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sea_facing BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guest_blurb TEXT NULL,
  ADD COLUMN IF NOT EXISTS photo_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS location_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS extras TEXT NULL,
  ADD COLUMN IF NOT EXISTS ota_reference_inr INT NULL,
  ADD COLUMN IF NOT EXISTS ota_as_of DATE NULL,
  ADD COLUMN IF NOT EXISTS direct_online_inr INT NULL,
  ADD COLUMN IF NOT EXISTS rooms_count INT NULL,
  ADD COLUMN IF NOT EXISTS tier TEXT NULL,
  ADD COLUMN IF NOT EXISTS show_in_guest_catalog BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS contact_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS contact_role TEXT NULL,
  ADD COLUMN IF NOT EXISTS night_desk_phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS on_ota BOOLEAN NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotels_hotel_category_check'
  ) THEN
    ALTER TABLE hotels ADD CONSTRAINT hotels_hotel_category_check
      CHECK (
        hotel_category IS NULL OR hotel_category IN (
          'villa', 'resort', 'boutique', 'hotel', 'homestay', 'guesthouse'
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotels_tier_check'
  ) THEN
    ALTER TABLE hotels ADD CONSTRAINT hotels_tier_check
      CHECK (tier IS NULL OR tier IN ('core', 'premium', 'breadth'));
  END IF;
END $$;

-- Allow flexible photo kinds from Excel / admin gallery URLs
ALTER TABLE hotel_media DROP CONSTRAINT IF EXISTS hotel_media_kind_check;
ALTER TABLE hotel_media ADD CONSTRAINT hotel_media_kind_check CHECK (
  kind IN (
    'room', 'bathroom', 'pool', 'exterior', 'breakfast', 'beach_path', 'view',
    'gallery', 'amenity', 'other'
  )
);

CREATE INDEX IF NOT EXISTS hotels_guest_catalog_idx
  ON hotels (show_in_guest_catalog, destination, status)
  WHERE show_in_guest_catalog = TRUE;
