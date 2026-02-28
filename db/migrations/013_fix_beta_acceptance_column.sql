ALTER TABLE users
ADD COLUMN IF NOT EXISTS beta_accepted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_beta_accepted_at
ON users (beta_accepted_at);
