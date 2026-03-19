-- Add token_version to tbl_users for stateless remember-me cookie validation.
-- Incrementing this field immediately invalidates all remember-me sessions for the user.
ALTER TABLE tbl_users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- Remove the remember-me token table (replaced by token_version approach).
DROP TABLE IF EXISTS tbl_remember_me_tokens;
