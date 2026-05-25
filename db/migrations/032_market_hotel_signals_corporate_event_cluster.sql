ALTER TABLE market_hotel_signals
  DROP CONSTRAINT IF EXISTS market_hotel_signals_signal_type_check;

ALTER TABLE market_hotel_signals
  ADD CONSTRAINT market_hotel_signals_signal_type_check
  CHECK (
    signal_type IN (
      'HIGH_REVIEW_ACTIVITY',
      'REPUTATION_WEAKNESS',
      'CHATBOT_GAP',
      'OTA_DEPENDENCE',
      'DEMAND_SURGE_CLUSTER',
      'PRICE_PRESSURE',
      'EVENT_DEMAND_ZONE',
      'WEDDING_DEMAND_ZONE',
      'CORPORATE_EVENT_CLUSTER'
    )
  );
