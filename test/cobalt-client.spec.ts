import { describe, it, expect, vi, afterEach } from 'vitest';
import { cobaltFetch, cobaltFetchMany, cobaltQualityOf, COBALT_API_URLS_INSTAGRAM } from '../src/services/downloader/cobalt-client';
import { DownloadError } from '../src/services/downloader/failure';

const PAGE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const stubFetch = (handler: (input: string, init?: RequestInit) => Promise<Response>) => vi.stubGlobal('fetch', handler);

describe('cobaltFetch', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns the tunnel url and filename for a processed download', async () => {
		stubFetch(async () =>
			Response.json({
				status: 'tunnel',
				url: 'https://cobaltapi.cjs.nz/tunnel?id=abc&exp=1',
				filename: 'Rick Astley - Never Gonna Give You Up (720p, h264).mp4',
			}),
		);
		const media = await cobaltFetch(PAGE_URL, { videoQuality: '720', youtubeVideoCodec: 'h264' }, 5_000);
		expect(media.url).toBe('https://cobaltapi.cjs.nz/tunnel?id=abc&exp=1');
		expect(media.filename).toBe('Rick Astley - Never Gonna Give You Up (720p, h264).mp4');
	});

	it('posts the page url and requested options as JSON to the instance root', async () => {
		let seen: { input: string; body: any } = { input: '', body: null };
		stubFetch(async (input: string, init?: RequestInit) => {
			seen = { input, body: JSON.parse(String(init?.body)) };
			return Response.json({ status: 'tunnel', url: 'https://cobaltapi.cjs.nz/tunnel?id=x', filename: 'a.mp3' });
		});
		await cobaltFetch(PAGE_URL, { downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '128' }, 5_000);
		expect(seen.input).toBe('https://cobaltapi.cjs.nz/');
		expect(seen.body).toEqual({
			url: PAGE_URL,
			downloadMode: 'audio',
			audioFormat: 'mp3',
			audioBitrate: '128',
		});
	});

	it('returns the direct url for a redirect response (Facebook)', async () => {
		stubFetch(async () => Response.json({ status: 'redirect', url: 'https://video.xx.fbcdn.net/o1/v/t2/f2/m412/clip.mp4?_nc_cat=101' }));
		const media = await cobaltFetch('https://www.facebook.com/watch/?v=10153231379946729', {}, 5_000);
		expect(media.url).toContain('fbcdn.net');
	});

	it('takes the first item of a picker response', async () => {
		stubFetch(async () =>
			Response.json({
				status: 'picker',
				picker: [
					{ type: 'photo', url: 'https://cdn.example/first.jpg' },
					{ type: 'video', url: 'https://cdn.example/second.mp4' },
				],
			}),
		);
		const media = await cobaltFetch(PAGE_URL, {}, 5_000);
		expect(media.url).toBe('https://cdn.example/first.jpg');
	});

	it('throws a gone DownloadError for a cobalt content error', async () => {
		stubFetch(async () => Response.json({ status: 'error', error: { code: 'error.api.fetch.empty' } }));
		await expect(cobaltFetch(PAGE_URL, {}, 5_000)).rejects.toMatchObject({ kind: 'gone' });
	});

	it('throws a rate_limited DownloadError when cobalt reports a rate limit', async () => {
		stubFetch(async () => Response.json({ status: 'error', error: { code: 'error.api.rate_exceeded' } }));
		const err = await cobaltFetch(PAGE_URL, {}, 5_000).catch((e) => e);
		expect(err).toBeInstanceOf(DownloadError);
		expect(err.kind).toBe('rate_limited');
	});

	it('throws a rate_limited DownloadError on an HTTP 429 from the instance', async () => {
		stubFetch(async () => new Response('slow down', { status: 429 }));
		await expect(cobaltFetch(PAGE_URL, {}, 5_000)).rejects.toMatchObject({ kind: 'rate_limited' });
	});
});

describe('cobaltQualityOf', () => {
	it('reads the height out of a cobalt video filename', () => {
		expect(cobaltQualityOf('Some Title (1080p, h264).mp4')).toBe(1080);
		expect(cobaltQualityOf('Some Title (720p, h264).mp4')).toBe(720);
	});

	it('ignores parenthesised text that is not a quality marker', () => {
		expect(cobaltQualityOf('Never Gonna Give You Up (Official Video) (4K Remaster).mp4')).toBeNull();
		expect(cobaltQualityOf('audio file.mp3')).toBeNull();
		expect(cobaltQualityOf(undefined)).toBeNull();
	});
});

describe('cobaltFetchMany + custom pool order', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns every picker item, not just the first', async () => {
		stubFetch(async () =>
			Response.json({
				status: 'picker',
				picker: [
					{ type: 'photo', url: 'https://cdn.example/first.jpg' },
					{ type: 'video', url: 'https://cdn.example/second.mp4' },
					{ type: 'photo', url: 'https://cdn.example/third.jpg' },
				],
			}),
		);
		const items = await cobaltFetchMany(PAGE_URL, {}, 5_000);
		expect(items.map((i) => i.url)).toEqual([
			'https://cdn.example/first.jpg',
			'https://cdn.example/second.mp4',
			'https://cdn.example/third.jpg',
		]);
	});

	it('wraps a tunnel answer as a single-item list', async () => {
		stubFetch(async () => Response.json({ status: 'tunnel', url: 'https://cobaltapi.cjs.nz/tunnel?id=one', filename: 'a.mp4' }));
		const items = await cobaltFetchMany(PAGE_URL, {}, 5_000);
		expect(items).toEqual([{ url: 'https://cobaltapi.cjs.nz/tunnel?id=one', filename: 'a.mp4' }]);
	});

	it('tries a caller-supplied pool in its own order (Instagram pool leads with liubquanti)', async () => {
		const calls: string[] = [];
		vi.stubGlobal('fetch', async (input: string) => {
			calls.push(input);
			if (input.startsWith('https://api.cobalt.liubquanti.click')) {
				return Response.json({ status: 'error', error: { code: 'error.api.fetch.empty' } });
			}
			return Response.json({ status: 'redirect', url: 'https://scontent.cdninstagram.com/clip.mp4' });
		});
		const media = await cobaltFetch(PAGE_URL, {}, 15_000, COBALT_API_URLS_INSTAGRAM);
		expect(media.url).toBe('https://scontent.cdninstagram.com/clip.mp4');
		expect(calls[0]).toContain('api.cobalt.liubquanti.click');
		expect(calls[1]).toContain('rue-cobalt.xenon.zone');
		expect(COBALT_API_URLS_INSTAGRAM[0]).toContain('liubquanti');
	});
});

describe('cobaltFetch instance pool', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('falls through to the next instance when the first errors', async () => {
		const calls: string[] = [];
		vi.stubGlobal('fetch', async (input: string) => {
			calls.push(input);
			if (input.startsWith('https://cobaltapi.cjs.nz')) {
				return Response.json({ status: 'error', error: { code: 'error.api.fetch.empty' } });
			}
			return Response.json({ status: 'tunnel', url: 'https://api.cobalt.liubquanti.click/tunnel?id=pool', filename: 'a.mp3' });
		});
		const media = await cobaltFetch(PAGE_URL, { downloadMode: 'audio', audioFormat: 'mp3' }, 15_000);
		expect(media.url).toBe('https://api.cobalt.liubquanti.click/tunnel?id=pool');
		expect(calls[0]).toContain('cobaltapi.cjs.nz');
		expect(calls[1]).toContain('api.cobalt.liubquanti.click');
	});
});
