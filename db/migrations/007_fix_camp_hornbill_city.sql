-- Ensure Camp Hornbill is mapped to Corbett (idempotent data correction).
WITH corbett AS (
  SELECT id
  FROM cities
  WHERE LOWER(name) = 'corbett'
  LIMIT 1
)
UPDATE hotels h
SET
  city = 'Corbett',
  city_id = c.id
FROM corbett c
WHERE LOWER(COALESCE(h.hotel_name, h.name, '')) LIKE 'camp hornbill%'
  AND (h.city_id IS DISTINCT FROM c.id OR LOWER(COALESCE(h.city, '')) <> 'corbett');
