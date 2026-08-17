-- chat transcript + hotel coordinates for travel tools

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS attested_by_contact_id UUID NULL REFERENCES hotel_contacts (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  guest_id UUID NULL REFERENCES guests (id) ON DELETE SET NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  tokens_in INT NULL,
  tokens_out INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_messages_role_check CHECK (role IN ('user', 'assistant', 'tool'))
);

CREATE INDEX IF NOT EXISTS chat_messages_opp_created_idx
  ON chat_messages (opportunity_id, created_at);
