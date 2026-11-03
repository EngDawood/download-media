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
