-- Slovakia Visa Slot Alert — SQLite schema
-- Timestamps are stored as ISO-8601 UTC strings (see requirement #23).

CREATE TABLE IF NOT EXISTS monitor_checks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  provider        TEXT NOT NULL,
  status          TEXT NOT NULL,
  checked_at      TEXT NOT NULL,
  duration_ms     INTEGER NOT NULL,
  http_status     INTEGER,
  criteria_match  INTEGER NOT NULL DEFAULT 0,
  confidence      TEXT NOT NULL DEFAULT 'UNKNOWN',
  error_type      TEXT,
  details         TEXT
);

CREATE INDEX IF NOT EXISTS idx_monitor_checks_provider_time
  ON monitor_checks (provider, checked_at DESC);

CREATE TABLE IF NOT EXISTS slots (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  availability_key  TEXT NOT NULL UNIQUE,
  provider          TEXT NOT NULL,
  region            TEXT NOT NULL,
  category          TEXT NOT NULL,
  visa_type         TEXT NOT NULL,
  purpose           TEXT NOT NULL,
  slot_date         TEXT NOT NULL,
  slot_time         TEXT,
  first_seen_at     TEXT NOT NULL,
  last_seen_at      TEXT NOT NULL,
  active            INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_slots_active ON slots (active);

CREATE TABLE IF NOT EXISTS alerts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id      INTEGER REFERENCES slots(id),
  channel      TEXT NOT NULL,
  sent_at      TEXT NOT NULL,
  successful   INTEGER NOT NULL,
  error        TEXT,
  latency_ms   INTEGER
);

CREATE TABLE IF NOT EXISTS system_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL,
  provider    TEXT,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_events_time ON system_events (created_at DESC);

-- No raw passwords/cookies are ever stored here. Playwright storageState
-- lives only on disk under storage/, outside the database, and is
-- git-ignored.
CREATE TABLE IF NOT EXISTS provider_sessions (
  provider          TEXT PRIMARY KEY,
  authenticated     INTEGER NOT NULL DEFAULT 0,
  last_verified_at  TEXT,
  expires_hint_at   TEXT
);

CREATE TABLE IF NOT EXISTS heartbeats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL
);
