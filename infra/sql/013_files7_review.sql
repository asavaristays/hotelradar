-- files-7 review corrections: OPP legacy codes, exception cleanup, status/domain sync

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS legacy_opp_code TEXT;

-- Expand ops status CHECK to include canonical domain names (status-map)
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_status_check;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_status_check CHECK (
  status IN (
    'draft',
    'verification_pending',
    'verifying',
    'verified',
    'qualified',
    'routed',
    'hotel_notified',
    'offer_received',
    'offer_sent',
    'offers_live',
    'traveller_accepted',
    'converted',
    'hotel_confirmed',
    'stay_completed',
    'commission_due',
    'settled',
    'no_offers',
    'abandoned',
    'expired',
    'more_details_needed',
    'hotel_declined',
    'offer_expired',
    'cancelled',
    'issue_review',
    'connector_failed'
  )
);

-- Map drifted statuses → canonical (keep readable ops aliases where still used)
UPDATE opportunities SET status = 'verifying' WHERE status = 'verification_pending';
UPDATE opportunities SET status = 'offers_live' WHERE status = 'offer_sent';
UPDATE opportunities SET status = 'converted' WHERE status = 'traveller_accepted';

UPDATE opportunities
SET domain_opp_status = CASE status
  WHEN 'verifying' THEN 'verifying'
  WHEN 'verified' THEN 'verified'
  WHEN 'qualified' THEN 'verified'
  WHEN 'routed' THEN 'routed'
  WHEN 'hotel_notified' THEN 'routed'
  WHEN 'offer_received' THEN 'offers_live'
  WHEN 'offers_live' THEN 'offers_live'
  WHEN 'converted' THEN 'converted'
  WHEN 'hotel_confirmed' THEN 'converted'
  WHEN 'stay_completed' THEN 'converted'
  WHEN 'commission_due' THEN 'converted'
  WHEN 'settled' THEN 'converted'
  WHEN 'no_offers' THEN 'no_offers'
  WHEN 'cancelled' THEN 'abandoned'
  WHEN 'offer_expired' THEN 'expired'
  ELSE COALESCE(domain_opp_status, 'created')
END
WHERE domain_opp_status IS NULL
   OR domain_opp_status NOT IN (
     'created','verifying','verified','routed','offers_live',
     'converted','no_offers','abandoned','expired'
   );

-- Happy-path rows were misfiled as exceptions — resolve them (keep audit trail)
UPDATE desk_exceptions
SET status = 'resolved',
    resolved_at = COALESCE(resolved_at, NOW()),
    details = COALESCE(details, '{}'::jsonb) || jsonb_build_object(
      'migrated_from_exception', true,
      'reason', 'happy_path_not_exception'
    )
WHERE exception_type IN ('offer_accepted_handoff', 'verified_awaiting_route')
  AND status IN ('open', 'in_progress');

-- Also write an opportunity_event for each so the log still has them
INSERT INTO opportunity_events (
  opportunity_id, event_type, actor_type, source_system,
  previous_status, new_status, idempotency_key, payload
)
SELECT
  e.opportunity_id,
  'exception.raised',
  'system',
  'direct',
  NULL,
  NULL,
  'files7:exception→event:' || e.id::text,
  jsonb_build_object(
    'migratedFrom', 'desk_exceptions',
    'exception_type', e.exception_type,
    'summary', e.summary,
    'note', 'Happy-path progress; not an open exception'
  )
FROM desk_exceptions e
WHERE e.exception_type IN ('offer_accepted_handoff', 'verified_awaiting_route')
  AND e.opportunity_id IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;
-- (only rows with an opportunity_id — orphan exceptions stay resolved only)

