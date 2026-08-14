ALTER TABLE revenue_intelligence_brief_deliveries
  ADD COLUMN IF NOT EXISTS recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_response JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_revenue_brief_deliveries_recipient
  ON revenue_intelligence_brief_deliveries(lower(recipient_email), generated_at DESC)
  WHERE recipient_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_brief_deliveries_channel_status
  ON revenue_intelligence_brief_deliveries(channel, status, generated_at DESC);
