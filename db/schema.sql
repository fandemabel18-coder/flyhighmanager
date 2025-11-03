-- FlyHighManager — Social module schema (Postgres)
-- schema: social
CREATE SCHEMA IF NOT EXISTS social;

CREATE TABLE IF NOT EXISTS social.players (
  id UUID PRIMARY KEY,
  nickname TEXT NOT NULL,
  pass_hash TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social.scores (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES social.players(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  value NUMERIC NOT NULL CHECK (value >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scores_game_value ON social.scores (game_id, value DESC);
CREATE INDEX IF NOT EXISTS idx_scores_game_time  ON social.scores (game_id, created_at);
