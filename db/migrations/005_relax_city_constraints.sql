-- Radar v3 geography-agnostic patch:
-- remove hardcoded city enum checks so new cities can be onboarded from admin UI.

ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_city_check;
ALTER TABLE airfare_data DROP CONSTRAINT IF EXISTS airfare_data_city_check;
ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_city_check;
ALTER TABLE city_weights DROP CONSTRAINT IF EXISTS city_weights_city_check;
