-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Money Tracker Bot — Database Schema                        ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Profiles ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  telegram_id BIGINT PRIMARY KEY,
  first_name  TEXT NOT NULL DEFAULT 'Pengguna',
  budget_limit NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── User Categories ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_categories (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_categories_user_id 
  ON user_categories(user_id);

-- ─── Transactions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  item       TEXT NOT NULL,
  amount     NUMERIC NOT NULL CHECK (amount > 0),
  category   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id 
  ON transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at 
  ON transactions(user_id, created_at);

-- ─── Category Cache ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS category_cache (
  user_id  BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  keyword  TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, keyword)
);

-- ─── Row Level Security ──────────────────────────────────────────
-- Note: Service role key bypasses RLS.
-- These policies are for additional safety if anon/user keys are used.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_cache ENABLE ROW LEVEL SECURITY;

-- Service role has full access (default behavior)
-- No additional policies needed since bot uses service_role key
