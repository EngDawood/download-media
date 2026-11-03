-- Telegram file_id cache: a link the bot has already uploaded once is resent
-- by file_id instead of being downloaded and uploaded again. The payload is
-- the JSON the bot needs to replay the send (items, caption, title); entries
-- are treated as misses after 90 days (see src/utils/media-cache.ts).
CREATE TABLE IF NOT EXISTS media_cache (
    cache_key  TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_media_cache_created ON media_cache(created_at);
