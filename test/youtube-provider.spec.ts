import { describe, it, expect, vi, afterEach } from 'vitest';
import { YouTubeProvider } from '../src/services/downloader/platforms/youtube';

const URL_UNDER_TEST = 'https://youtu.be/p54LUOrHzZU?feature=shared';
const MEDIA = {
	status: true,
	title: 'Farm Animals',
	thumbnail: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
	mp4: 'https://api.vidsnap.app/proxy?u=video',
	mp3: 'https://api.vidsnap.app/proxy?u=audio',
};

describe('YouTubeProvider', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('waits for a backend that has media instead of taking a faster empty 200', async () => {
		const calls: string[] = [];
		vi.stubGlobal('fetch', async (input: string) => {
			calls.push(input);
			// backend4 answers first with the empty `{status:true}` body; backend3 is slower but has the file.
			if (input.includes('backend4')) return Response.json({ status: true });
			if (input.includes('backend3')) {
				await new Promise((r) => setTimeout(r, 20));
				return Response.json(MEDIA);
			}
			return Response.json({ status: true });
		});

		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'auto');

		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({ type: 'video', url: MEDIA.mp4 });
		expect(result.mp3Url).toBe(MEDIA.mp3);
		// The empty answers must not have pushed us into the AIO fallback.
		expect(calls.some((c) => c.includes('/aio?'))).toBe(false);
	});

	it('returns the mp3 for audio mode', async () => {
		vi.stubGlobal('fetch', async () => Response.json(MEDIA));
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'audio');
		expect(result.media?.[0]).toEqual({ type: 'audio', url: MEDIA.mp3, filename: 'Farm Animals.mp3' });
	});

	it('names the audio file .webm when btch wraps an itag-249 WebM/Opus stream', async () => {
		// The real shape btch returns today: the "mp3" is a vidsnap proxy link
		// around a googlevideo audio/webm stream — not an MP3 at all.
		const inner = 'https://rr1---sn.googlevideo.com/videoplayback?expire=1&itag=249&mime=audio%2Fwebm&clen=1231355';
		const webmMedia = { ...MEDIA, mp3: `https://api.vidsnap.app/proxy?u=${encodeURIComponent(inner)}` };
		vi.stubGlobal('fetch', async () => Response.json(webmMedia));
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'audio');
		expect(result.media?.[0].filename).toBe('Farm Animals.webm');
	});

	it('names the audio file .m4a when btch wraps an itag-140 AAC stream', async () => {
		const inner = 'https://rr1---sn.googlevideo.com/videoplayback?expire=1&itag=140&mime=audio%2Fmp4&clen=3000000';
		const m4aMedia = { ...MEDIA, mp3: `https://api.vidsnap.app/proxy?u=${encodeURIComponent(inner)}` };
		vi.stubGlobal('fetch', async () => Response.json(m4aMedia));
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'audio');
		expect(result.media?.[0].filename).toBe('Farm Animals.m4a');
	});

	it('treats every backend answering empty as retryable and skips the AIO fallback', async () => {
		const calls: string[] = [];
		vi.stubGlobal('fetch', async (input: string) => {
			calls.push(input);
			return input.includes('/aio?') ? Response.json({ error: 'Failed to obtain Cloudflare token' }) : Response.json({ status: true });
		});
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'auto');
		expect(result.status).toBe('error');
		expect(result.retryable).toBe(true);
		expect(result.failureKind).toBe('timeout');
		expect(calls.some((c) => c.includes('/aio?'))).toBe(false);
	});

	it('reports a definitive failure when backends return a real error', async () => {
		vi.stubGlobal('fetch', async () => Response.json({ error: 'Video unavailable' }));
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'auto');
		expect(result.status).toBe('error');
		expect(result.retryable).toBeFalsy();
		expect(result.failureKind).toBe('gone');
	});
});

describe('YouTubeProvider via cobalt (default backend)', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const COBALT = 'https://cobaltapi.cjs.nz/';

	/** Route fetch: cobalt answers from `cobalt`, everything else from `btch`. Records cobalt request bodies. */
	const stubBackends = (cobalt: (body: any) => Response, btch: (input: string) => Response, bodies: any[] = []) => {
		vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
			if (input.startsWith(COBALT)) {
				const body = JSON.parse(String(init?.body));
				bodies.push(body);
				return cobalt(body);
			}
			return btch(input);
		});
		return bodies;
	};

	it('serves audio mode as a real MP3 from cobalt without touching btch', async () => {
		const calls: string[] = [];
		vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
			calls.push(input);
			if (input.startsWith(COBALT)) {
				const body = JSON.parse(String(init?.body));
				expect(body.downloadMode).toBe('audio');
				expect(body.audioFormat).toBe('mp3');
				return Response.json({
					status: 'tunnel',
					url: 'https://cobaltapi.cjs.nz/tunnel?id=aud',
					filename: 'Farm Animals - Some Channel.mp3',
				});
			}
			return Response.json(MEDIA);
		});
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'audio');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({
			type: 'audio',
			url: 'https://cobaltapi.cjs.nz/tunnel?id=aud',
			filename: 'Farm Animals - Some Channel.mp3',
		});
		expect(result.title).toBe('Farm Animals - Some Channel');
		expect(calls.some((c) => c.includes('tioo.eu.org'))).toBe(false);
	});

	it('falls back to btch for audio when cobalt errors', async () => {
		stubBackends(
			() => Response.json({ status: 'error', error: { code: 'error.api.fetch.empty' } }),
			async () => Response.json(MEDIA),
		);
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'audio');
		expect(result.status).toBe('success');
		expect(result.media?.[0].filename).toBe('Farm Animals.mp3');
	});

	it('detects the quality ladder from a max probe and delivers 720p by default', async () => {
		const bodies = stubBackends(
			(body) =>
				Response.json({
					status: 'tunnel',
					url: `https://cobaltapi.cjs.nz/tunnel?id=q${body.videoQuality}`,
					filename: `Farm Animals (${body.videoQuality === 'max' ? 1080 : body.videoQuality}p, h264).mp4`,
				}),
			async () => Response.json(MEDIA),
		);
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'auto');
		expect(result.status).toBe('success');
		expect(bodies.map((b) => b.videoQuality)).toEqual(['max', '720']);
		expect(result.media?.[0]).toEqual({
			type: 'video',
			url: 'https://cobaltapi.cjs.nz/tunnel?id=q720',
			filename: 'Farm Animals (720p, h264).mp4',
			quality: '720p',
		});
		expect(result.altQualities).toEqual([
			{ label: '1080p', mode: '1080' },
			{ label: '480p', mode: '480' },
			{ label: '360p', mode: '360' },
			{ label: '240p', mode: '240' },
			{ label: '144p', mode: '144' },
			{ label: 'MP3', mode: 'audio' },
		]);
	});

	it('delivers the probe itself when the best available quality is 720p or lower', async () => {
		const bodies = stubBackends(
			() =>
				Response.json({
					status: 'tunnel',
					url: 'https://cobaltapi.cjs.nz/tunnel?id=max480',
					filename: 'Farm Animals (480p, h264).mp4',
				}),
			async () => Response.json(MEDIA),
		);
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'auto');
		expect(bodies).toHaveLength(1);
		expect(result.media?.[0].url).toBe('https://cobaltapi.cjs.nz/tunnel?id=max480');
		expect(result.media?.[0].quality).toBe('480p');
		expect(result.altQualities).toEqual([
			{ label: '360p', mode: '360' },
			{ label: '240p', mode: '240' },
			{ label: '144p', mode: '144' },
			{ label: 'MP3', mode: 'audio' },
		]);
	});

	it('serves an explicit quality mode with one cobalt call', async () => {
		const bodies = stubBackends(
			(body) =>
				Response.json({
					status: 'tunnel',
					url: 'https://cobaltapi.cjs.nz/tunnel?id=q1080',
					filename: 'Farm Animals (1080p, h264).mp4',
				}),
			async () => Response.json(MEDIA),
		);
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, '1080');
		expect(bodies.map((b) => b.videoQuality)).toEqual(['1080']);
		expect(result.media?.[0].quality).toBe('1080p');
		expect(result.altQualities?.[0]).toEqual({ label: '720p', mode: '720' });
	});

	it('falls back to btch for video when cobalt is down', async () => {
		stubBackends(
			() => new Response('boom', { status: 500 }),
			async () => Response.json(MEDIA),
		);
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'auto');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({ type: 'video', url: MEDIA.mp4 });
		expect(result.mp3Url).toBe(MEDIA.mp3);
	});
});
