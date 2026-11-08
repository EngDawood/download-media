import type { DownloaderMode } from '../types/downloader';
import { log } from './logger';

/**
 * Telegram file_id cache for the bot.
 *
 * The first time the bot uploads a file for a link, Telegram hands back a
 * `file_id` for it. That id belongs to the bot (not to a chat), so any later
 * request for the same link — from any user — can be answered by resending
 * the stored file_id: no provider call, no download, no re-upload.
 *
 * Entries live in the bot's D1 database keyed by the canonical (detector)
 * URL plus the download mode, because one link yields different files per
 * mode (a YouTube link in `audio` mode is an mp3, in `auto` a video).
 */

export const MEDIA_CACHE_TTL_MS = 90 * 24 * 3600 * 1000;

export type MediaCacheItemType = 'video' | 'photo' | 'audio' | 'document';

export interface MediaCacheItem {
	type: MediaCacheItemType;
	fileId: string;
	filename?: string;
	filesize?: number;
}

export interface MediaCacheEntry {
	items: MediaCacheItem[];
	/** Caption exactly as sent with the media (Instagram footer included). */
	caption?: string;
	title?: string;
	/** Preview image the provider supplied — kept so the guest moderation check can run on a hit. */
	thumbnail?: string;
	/** The source flagged the post sensitive; guests must stay blocked on a hit too. */
	sensitive?: boolean;
	createdAt: number;
}

/** What a writer stores; `createdAt` is stamped by the store. */
export type MediaCacheWrite = Omit<MediaCacheEntry, 'createdAt'>;

/** Stable cache key for a canonical URL + mode pair. */
export function mediaCacheKey(url: string, mode: DownloaderMode): string {
	return `${mode}:${url}`;
}

// The CREATE mirrors migrations/0002_media_cache.sql. Running it on access
// keeps the feature working on a database the migration has not reached yet;
// IF NOT EXISTS makes it a no-op once the table is there.
const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS media_cache (
	cache_key  TEXT PRIMARY KEY,
	payload    TEXT NOT NULL,
	created_at INTEGER NOT NULL
) STRICT`;

async function ensureTable(db: D1Database): Promise<void> {
	await db.prepare(CREATE_TABLE_SQL).run();
}

interface MediaCacheRow {
	payload: string;
	created_at: number;
}

function isValidEntry(value: unknown): value is MediaCacheWrite {
	if (!value || typeof value !== 'object') return false;
	const entry = value as MediaCacheWrite;
	return (
		Array.isArray(entry.items) &&
		entry.items.length > 0 &&
		entry.items.every(
			(item) =>
				!!item &&
				typeof item.fileId === 'string' &&
				item.fileId.length > 0 &&
				(item.type === 'video' || item.type === 'photo' || item.type === 'audio' || item.type === 'document'),
		)
	);
}

/**
 * The cached entry for a link + mode, or null on a miss. Entries older than
 * the TTL count as misses and are deleted on read. Never throws — a broken
 * cache must not break downloads, so failures are logged and read as misses.
 */
export async function getMediaCache(db: D1Database, url: string, mode: DownloaderMode): Promise<MediaCacheEntry | null> {
	const key = mediaCacheKey(url, mode);
	try {
		await ensureTable(db);
		const row = await db.prepare(`SELECT payload, created_at FROM media_cache WHERE cache_key = ?`).bind(key).first<MediaCacheRow>();
		if (!row) return null;
		if (Date.now() - row.created_at > MEDIA_CACHE_TTL_MS) {
			await deleteMediaCache(db, url, mode);
			return null;
		}
		const parsed: unknown = JSON.parse(row.payload);
		if (!isValidEntry(parsed)) return null;
		return { ...parsed, createdAt: row.created_at };
	} catch (e) {
		log('error', 'media-cache', 'cache read failed', { error: (e as Error)?.message });
		return null;
	}
}

/** Store (or replace) the entry for a link + mode. Empty item lists are never stored. Never throws. */
export async function putMediaCache(db: D1Database, url: string, mode: DownloaderMode, entry: MediaCacheWrite): Promise<void> {
	if (!isValidEntry(entry)) return;
	try {
		await ensureTable(db);
		await db
			.prepare(
				`INSERT INTO media_cache (cache_key, payload, created_at) VALUES (?, ?, ?)
				 ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at`,
			)
			.bind(mediaCacheKey(url, mode), JSON.stringify(entry), Date.now())
			.run();
	} catch (e) {
		log('error', 'media-cache', 'cache write failed', { error: (e as Error)?.message });
	}
}

/** Drop the entry for a link + mode (stale file_id, expired entry). Never throws. */
export async function deleteMediaCache(db: D1Database, url: string, mode: DownloaderMode): Promise<void> {
	try {
		await ensureTable(db);
		await db.prepare(`DELETE FROM media_cache WHERE cache_key = ?`).bind(mediaCacheKey(url, mode)).run();
	} catch (e) {
		log('error', 'media-cache', 'cache delete failed', { error: (e as Error)?.message });
	}
}
