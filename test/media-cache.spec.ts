import { describe, it, expect, vi } from 'vitest';
import type { Bot } from 'grammy';
import {
	mediaCacheKey,
	getMediaCache,
	putMediaCache,
	deleteMediaCache,
	MEDIA_CACHE_TTL_MS,
	type MediaCacheWrite,
} from '../src/utils/media-cache';
import { extractFileId, sendCachedMediaToChannel, sendMediaToChannel } from '../src/services/telegram-bot/handlers/send-media';

// ─── Fake D1 (just the media_cache statements, in memory) ────────────────────

interface CacheRow {
	payload: string;
	created_at: number;
}

class FakeStatement {
	private binds: unknown[] = [];
	constructor(
		private db: FakeDb,
		private sql: string,
	) {}
	bind(...args: unknown[]): this {
		this.binds = args;
		return this;
	}
	async first<T>(): Promise<T | null> {
		if (!this.sql.includes('SELECT')) return null;
		const row = this.db.rows.get(this.binds[0] as string);
		return (row as T | undefined) ?? null;
	}
	async run(): Promise<{ meta: { changes: number } }> {
		if (this.sql.startsWith('INSERT')) {
			this.db.rows.set(this.binds[0] as string, { payload: this.binds[1] as string, created_at: this.binds[2] as number });
			return { meta: { changes: 1 } };
		}
		if (this.sql.startsWith('DELETE')) {
			return { meta: { changes: this.db.rows.delete(this.binds[0] as string) ? 1 : 0 } };
		}
		return { meta: { changes: 0 } };
	}
}

class FakeDb {
	rows = new Map<string, CacheRow>();
	prepare(sql: string): FakeStatement {
		return new FakeStatement(this, sql);
	}
}

const fakeDb = () => {
	const db = new FakeDb();
	return { fake: db, d1: db as unknown as D1Database };
};

const ENTRY: MediaCacheWrite = {
	items: [{ type: 'video', fileId: 'VID_FILE_ID', filename: 'clip.mp4', filesize: 41_943_040 }],
	caption: 'a caption',
	title: 'Some video',
};

describe('mediaCacheKey()', () => {
	it('is stable for the same url + mode and differs across modes', () => {
		const url = 'https://youtu.be/abc123';
		expect(mediaCacheKey(url, 'auto')).toBe(mediaCacheKey(url, 'auto'));
		expect(mediaCacheKey(url, 'auto')).not.toBe(mediaCacheKey(url, 'audio'));
		expect(mediaCacheKey(url, 'auto')).not.toBe(mediaCacheKey('https://youtu.be/other', 'auto'));
	});
});

describe('media cache store', () => {
	it('round-trips an entry', async () => {
		const { d1 } = fakeDb();
		await putMediaCache(d1, 'https://youtu.be/abc123', 'auto', ENTRY);
		const got = await getMediaCache(d1, 'https://youtu.be/abc123', 'auto');
		expect(got?.items).toEqual(ENTRY.items);
		expect(got?.caption).toBe('a caption');
		expect(got?.title).toBe('Some video');
		expect(got?.createdAt).toBeGreaterThan(0);
	});

	it('keeps modes apart: an audio entry does not answer an auto lookup', async () => {
		const { d1 } = fakeDb();
		await putMediaCache(d1, 'https://youtu.be/abc123', 'audio', ENTRY);
		expect(await getMediaCache(d1, 'https://youtu.be/abc123', 'auto')).toBeNull();
		expect(await getMediaCache(d1, 'https://youtu.be/abc123', 'audio')).not.toBeNull();
	});

	it('misses cleanly for an unknown link', async () => {
		const { d1 } = fakeDb();
		expect(await getMediaCache(d1, 'https://youtu.be/never-seen', 'auto')).toBeNull();
	});

	it('replaces the entry on a second write for the same link + mode', async () => {
		const { d1, fake } = fakeDb();
		await putMediaCache(d1, 'https://youtu.be/abc123', 'auto', ENTRY);
		await putMediaCache(d1, 'https://youtu.be/abc123', 'auto', { items: [{ type: 'video', fileId: 'NEW_ID' }] });
		expect(fake.rows.size).toBe(1);
		expect((await getMediaCache(d1, 'https://youtu.be/abc123', 'auto'))?.items[0].fileId).toBe('NEW_ID');
	});

	it('never stores an empty or file-less entry', async () => {
		const { d1, fake } = fakeDb();
		await putMediaCache(d1, 'https://youtu.be/abc123', 'auto', { items: [] });
		await putMediaCache(d1, 'https://youtu.be/abc123', 'auto', { items: [{ type: 'video', fileId: '' }] });
		expect(fake.rows.size).toBe(0);
	});

	it('treats entries older than the TTL as misses and deletes them on read', async () => {
		const { d1, fake } = fakeDb();
		await putMediaCache(d1, 'https://youtu.be/abc123', 'auto', ENTRY);
		const key = mediaCacheKey('https://youtu.be/abc123', 'auto');
		fake.rows.get(key)!.created_at = Date.now() - MEDIA_CACHE_TTL_MS - 1;
		expect(await getMediaCache(d1, 'https://youtu.be/abc123', 'auto')).toBeNull();
		expect(fake.rows.has(key)).toBe(false);
	});

	it('reads a corrupt payload as a miss instead of throwing', async () => {
		const { d1, fake } = fakeDb();
		fake.rows.set(mediaCacheKey('https://youtu.be/abc123', 'auto'), { payload: '{not json', created_at: Date.now() });
		expect(await getMediaCache(d1, 'https://youtu.be/abc123', 'auto')).toBeNull();
		fake.rows.set(mediaCacheKey('https://youtu.be/abc123', 'auto'), { payload: '{"items":"nope"}', created_at: Date.now() });
		expect(await getMediaCache(d1, 'https://youtu.be/abc123', 'auto')).toBeNull();
	});

	it('delete removes the entry', async () => {
		const { d1 } = fakeDb();
		await putMediaCache(d1, 'https://youtu.be/abc123', 'auto', ENTRY);
		await deleteMediaCache(d1, 'https://youtu.be/abc123', 'auto');
		expect(await getMediaCache(d1, 'https://youtu.be/abc123', 'auto')).toBeNull();
	});
});

// ─── extractFileId() ─────────────────────────────────────────────────────────

describe('extractFileId()', () => {
	it('reads a video file_id and size', () => {
		expect(extractFileId({ video: { file_id: 'V1', file_size: 123 } })).toEqual({ type: 'video', fileId: 'V1', fileSize: 123 });
	});

	it('reads document, audio, voice and animation', () => {
		expect(extractFileId({ document: { file_id: 'D1' } })?.fileId).toBe('D1');
		expect(extractFileId({ audio: { file_id: 'A1' } })?.type).toBe('audio');
		expect(extractFileId({ voice: { file_id: 'VO1' } })?.type).toBe('voice');
		expect(extractFileId({ animation: { file_id: 'AN1' } })?.type).toBe('animation');
	});

	it('takes the largest (last) size of a photo', () => {
		const message = {
			photo: [
				{ file_id: 'small', file_size: 100 },
				{ file_id: 'large', file_size: 900 },
			],
		};
		expect(extractFileId(message)).toEqual({ type: 'photo', fileId: 'large', fileSize: 900 });
	});

	it('returns null for messages without a file', () => {
		expect(extractFileId({ text: 'hello' })).toBeNull();
		expect(extractFileId({})).toBeNull();
		expect(extractFileId(null)).toBeNull();
		expect(extractFileId(undefined)).toBeNull();
		expect(extractFileId('a string')).toBeNull();
	});
});

// ─── Sending: normal path returns Messages, cached path resends file_ids ────

describe('sendCachedMediaToChannel()', () => {
	it('sends a single video by file_id with its caption', async () => {
		const sendVideo = vi.fn(async () => ({}));
		const bot = { api: { sendVideo, sendMessage: vi.fn() } } as unknown as Bot;
		await sendCachedMediaToChannel(bot, 7, [{ type: 'video', fileId: 'VID', filesize: 10 }], 'cap');
		expect(sendVideo).toHaveBeenCalledTimes(1);
		expect(sendVideo.mock.calls[0][0]).toBe(7);
		expect(sendVideo.mock.calls[0][1]).toBe('VID');
		expect(sendVideo.mock.calls[0][2]).toMatchObject({ caption: 'cap', parse_mode: 'HTML' });
	});

	it('sends an album as a media group of file_ids, caption on the first item', async () => {
		const sendMediaGroup = vi.fn(async () => []);
		const bot = { api: { sendMediaGroup, sendMessage: vi.fn() } } as unknown as Bot;
		await sendCachedMediaToChannel(
			bot,
			7,
			[
				{ type: 'photo', fileId: 'P1' },
				{ type: 'photo', fileId: 'P2' },
				{ type: 'video', fileId: 'V1' },
			],
			'album cap',
		);
		expect(sendMediaGroup).toHaveBeenCalledTimes(1);
		const group = sendMediaGroup.mock.calls[0][1] as Array<{ media: string; caption?: string }>;
		expect(group.map((g) => g.media)).toEqual(['P1', 'P2', 'V1']);
		expect(group[0].caption).toBe('album cap');
		expect(group[1].caption).toBeFalsy();
	});

	it('propagates a Telegram refusal so the caller can fall back to a download', async () => {
		const bot = {
			api: {
				sendVideo: vi.fn(async () => {
					throw new Error('wrong file identifier');
				}),
				sendMessage: vi.fn(),
			},
		} as unknown as Bot;
		await expect(sendCachedMediaToChannel(bot, 7, [{ type: 'video', fileId: 'STALE' }], '')).rejects.toThrow('wrong file identifier');
	});
});

describe('sendMediaToChannel() return value', () => {
	it('returns the sent Message so its file_id can be harvested', async () => {
		const sent = { message_id: 5, video: { file_id: 'HARVEST_ME', file_size: 42 } };
		const bot = { api: { sendVideo: vi.fn(async () => sent), sendMessage: vi.fn() } } as unknown as Bot;
		const results = await sendMediaToChannel(bot, 1, {
			type: 'video',
			url: 'https://cdn.example/v.mp4',
			caption: 'c',
			buffer: new Uint8Array([1, 2, 3]),
			filename: 'v.mp4',
		});
		expect(results).toEqual([sent]);
		expect(extractFileId(results[0])?.fileId).toBe('HARVEST_ME');
	});
});
