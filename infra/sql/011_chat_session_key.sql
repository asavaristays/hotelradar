-- session-scoped chat for OpenAI playground without an OPP

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS session_key TEXT;

CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
  ON chat_messages (session_key, created_at)
  WHERE session_key IS NOT NULL;
