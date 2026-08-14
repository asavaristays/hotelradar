ALTER TABLE market_demand_snapshots
  DROP CONSTRAINT IF EXISTS market_demand_snapshots_pricing_action_check;

ALTER TABLE market_demand_snapshots
  ADD CONSTRAINT market_demand_snapshots_pricing_action_check
  CHECK (
    pricing_action IN (
      'Need More Data',
      'Hold',
      'Watch',
      'Increase Watch',
      'Reduce Watch',
      'Increase',
      'Reduce',
      'Close Discount',
      'Minimum Stay',
      'Close Out',
      'Strong Increase',
      'Review Only'
    )
  );
