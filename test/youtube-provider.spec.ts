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

	it('picks the best variant under the caller-supplied maxFileBytes', async () => {
		vi.stubGlobal('fetch', async (input: string) => {
			// Primary backends fail definitively so the AIO fallback runs.
			if (input.includes('/aio?')) {
				return Response.json({
					status: true,
					data: {
						title: 'Big video',
						links: {
							video: [
								{ url: 'https://cdn.example/small.mp4', size: 10 * 1024 * 1024, q_text: '480p' },
								{ url: 'https://cdn.example/big.mp4', size: 100 * 1024 * 1024, q_text: '1080p' },
							],
						},
					},
				});
			}
			return Response.json({ error: 'Video unavailable' });
		});

		// Default (bot) behaviour: stay under Telegram's upload limit.
		const bot = await new YouTubeProvider().download(URL_UNDER_TEST, 'auto');
		expect(bot.status).toBe('success');
		expect(bot.media?.[0].url).toBe('https://cdn.example/small.mp4');

		// API/MCP callers pass a higher ceiling and get the better variant.
		const api = await new YouTubeProvider().download(URL_UNDER_TEST, 'auto', { maxFileBytes: 150 * 1024 * 1024 });
		expect(api.status).toBe('success');
		expect(api.media?.[0].url).toBe('https://cdn.example/big.mp4');
	});
});
