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
		expect(result.media?.[0]).toEqual({ type: 'audio', url: MEDIA.mp3 });
	});

	it('reports a definitive failure when no backend has media and AIO errors', async () => {
		vi.stubGlobal('fetch', async (input: string) =>
			input.includes('/aio?') ? Response.json({ error: 'Failed to obtain Cloudflare token' }) : Response.json({ status: true }),
		);
		const result = await new YouTubeProvider().download(URL_UNDER_TEST, 'auto');
		expect(result.status).toBe('error');
		expect(result.retryable).toBeFalsy();
		expect(result.failureKind).toBe('gone');
	});
});
