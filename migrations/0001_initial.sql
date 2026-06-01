CREATE TABLE IF NOT EXISTS user_settings (
    user_id  INTEGER PRIMARY KEY,
    lang     TEXT NOT NULL DEFAULT 'en'
) STRICT;

CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS blocked_users (
    user_id    INTEGER PRIMARY KEY,
    username   TEXT,
    first_name TEXT NOT NULL DEFAULT '',
    blocked_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS domain_allowlist (
    hostname TEXT PRIMARY KEY
) STRICT;

CREATE TABLE IF NOT EXISTS user_stats (
    user_id    INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL DEFAULT '',
    username   TEXT,
    count      INTEGER NOT NULL DEFAULT 0,
    failures   INTEGER NOT NULL DEFAULT 0,
    platforms  TEXT NOT NULL DEFAULT '{}',
    last_seen  INTEGER NOT NULL DEFAULT 0,
    first_seen INTEGER NOT NULL DEFAULT 0,
    started    INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX IF NOT EXISTS idx_user_stats_last_seen ON user_stats(last_seen);
CREATE INDEX IF NOT EXISTS idx_user_stats_count ON user_stats(count DESC);

CREATE TABLE IF NOT EXISTS global_stats (
    id                       INTEGER PRIMARY KEY DEFAULT 1,
    total_links              INTEGER NOT NULL DEFAULT 0,
    total_success            INTEGER NOT NULL DEFAULT 0,
    total_errors             INTEGER NOT NULL DEFAULT 0,
    total_unique_users       INTEGER NOT NULL DEFAULT 0,
    total_start_users        INTEGER NOT NULL DEFAULT 0,
    total_gate_blocked       INTEGER NOT NULL DEFAULT 0,
    total_gate_verified      INTEGER NOT NULL DEFAULT 0,
    total_gate_still_blocked INTEGER NOT NULL DEFAULT 0,
    hourly_distribution      TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'
) STRICT;

INSERT OR IGNORE INTO global_stats (id) VALUES (1);

-- Separate table for atomic global platform counter increments (no read-modify-write)
CREATE TABLE IF NOT EXISTS platform_counts (
    scope    TEXT NOT NULL,
    platform TEXT NOT NULL,
    count    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (scope, platform)
) STRICT;

CREATE TABLE IF NOT EXISTS daily_stats (
    date          TEXT PRIMARY KEY,
    links         INTEGER NOT NULL DEFAULT 0,
    success       INTEGER NOT NULL DEFAULT 0,
    errors        INTEGER NOT NULL DEFAULT 0,
    gate_blocked  INTEGER NOT NULL DEFAULT 0,
    gate_verified INTEGER NOT NULL DEFAULT 0,
    expires_at    INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS download_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    url             TEXT NOT NULL,
    platform        TEXT NOT NULL,
    user_id         INTEGER NOT NULL,
    username        TEXT,
    first_name      TEXT NOT NULL DEFAULT '',
    timestamp       INTEGER NOT NULL,
    success         INTEGER NOT NULL DEFAULT 1,
    duration_ms     INTEGER,
    file_size_bytes INTEGER
) STRICT;

CREATE INDEX IF NOT EXISTS idx_history_ts ON download_history(timestamp DESC);

CREATE TABLE IF NOT EXISTS failed_downloads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    url          TEXT NOT NULL,
    platform     TEXT NOT NULL,
    error_reason TEXT NOT NULL,
    timestamp    INTEGER NOT NULL,
    user_id      INTEGER NOT NULL,
    first_name   TEXT NOT NULL DEFAULT '',
    username     TEXT,
    mode         TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_failed_ts ON failed_downloads(timestamp DESC);

-- All TTL-bearing ephemeral state in one table.
-- key_type: 'state' | 'lock' | 'lock_pending' | 'usage' | 'blocked_url'
--           | 'report' | 'report_sent' | 'report_pending'
CREATE TABLE IF NOT EXISTS session_store (
    key_type   TEXT NOT NULL,
    user_id    INTEGER NOT NULL,
    value      TEXT NOT NULL,
    expires_at INTEGER,
    PRIMARY KEY (key_type, user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_session_expires ON session_store(expires_at)
    WHERE expires_at IS NOT NULL;
