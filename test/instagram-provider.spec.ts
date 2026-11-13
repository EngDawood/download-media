import { describe, it, expect, vi, afterEach } from 'vitest';
import { InstagramProvider } from '../src/services/downloader/platforms/instagram';

const REEL_URL = 'https://www.instagram.com/reel/DFnVvNfixte/';
const CDN_MP4 = 'https://scontent.cdninstagram.com/o1/v/t2/f2/m367/clip.mp4?_nc_cat=100';
const IGDL_OK = [{ status: true, creator: '@prm2.0', thumbnail: 'https://cdn.example/thumb.jpg', url: 'https://cdn.example/igdl.mp4' }];
const AIO_OK = {
	data: {
		title: 'AIO Clip',
		links: { video: [{ url: 'https://aio.example/clip.mp4', q_text: '720p' }] },
	},
};

const cobaltDown = () => Response.json({ status: 'error', error: { code: 'error.api.fetch.empty' } });

/**
 * Route fetch by service: cobalt instances (recorded with their host),
 * the btch fleet (recorded with the endpoint name), RSSHub story feeds.
 */
const stubChain = (handlers: {
	cobalt: (host: string, body: any) => Response;
	btch: (endpoint: string) => Response;
	rss?: () => Response;
}) => {
	const calls: string[] = [];
	vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
		if (input.includes('picnob.info')) {
			calls.push('rss');
			return handlers.rss ? handlers.rss() : new Response('down', { status: 503 });
		}
		// The bytes probe GETs the tunnel URL; it is not a backend call.
		if (input.includes('/tunnel?')) {
			return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
		}
		if (input.includes('cobalt')) {
			const host = new URL(input).hostname;
			calls.push(`cobalt:${host}`);
			return handlers.cobalt(host, JSON.parse(String(init?.body)));
		}
		const endpoint = input.match(/downloader\/(\w+)/)?.[1] ?? 'unknown';
		calls.push(`btch:${endpoint}`);
		return handlers.btch(endpoint);
	});
	return calls;
};

describe('InstagramProvider cobalt-first chain', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('serves a reel from cobalt (liubquanti first) without touching btch', async () => {
		const calls = stubChain({
			cobalt: () => Response.json({ status: 'redirect', url: CDN_MP4 }),
			btch: () => Response.json(IGDL_OK),
		});
		const result = await new InstagramProvider().download(REEL_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({ type: 'video', url: CDN_MP4 });
		expect(calls[0]).toBe('cobalt:api.cobalt.liubquanti.click');
		expect(calls.some((c) => c.startsWith('btch'))).toBe(false);
	});

	it('serves audio mode as an MP3 from cobalt', async () => {
		stubChain({
			cobalt: (_host, body) => {
				expect(body.downloadMode).toBe('audio');
				return Response.json({
					status: 'tunnel',
					url: 'https://rue-cobalt.xenon.zone/tunnel?id=igaud',
					filename: 'instagram_DFnVvNfixte_audio.mp3',
				});
			},
			btch: () => Response.json(IGDL_OK),
		});
		const result = await new InstagramProvider().download(REEL_URL, 'audio');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({
			type: 'audio',
			url: 'https://rue-cobalt.xenon.zone/tunnel?id=igaud',
			filename: 'instagram_DFnVvNfixte_audio.mp3',
		});
	});

	it('returns every item of a carousel picker', async () => {
		stubChain({
			cobalt: () =>
				Response.json({
					status: 'picker',
					picker: [
						{ type: 'photo', url: 'https://scontent.cdninstagram.com/one.jpg' },
						{ type: 'video', url: 'https://scontent.cdninstagram.com/two.mp4' },
					],
				}),
			btch: () => Response.json(IGDL_OK),
		});
		const result = await new InstagramProvider().download('https://www.instagram.com/p/CAROUSEL1/', 'auto');
		expect(result.status).toBe('success');
		expect(result.media).toEqual([
			{ type: 'photo', url: 'https://scontent.cdninstagram.com/one.jpg' },
			{ type: 'video', url: 'https://scontent.cdninstagram.com/two.mp4' },
		]);
	});

	it('falls through to igdl when cobalt has nothing — AIO is not burned first', async () => {
		const calls = stubChain({
			cobalt: cobaltDown,
			btch: (endpoint) => Response.json(endpoint === 'igdl' ? IGDL_OK : AIO_OK),
		});
		const result = await new InstagramProvider().download(REEL_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media?.[0].url).toBe('https://cdn.example/igdl.mp4');
		const btchCalls = calls.filter((c) => c.startsWith('btch'));
		expect(btchCalls[0]).toBe('btch:igdl');
		expect(btchCalls.some((c) => c === 'btch:aio')).toBe(false);
	});

	it('keeps AIO as the last resort when cobalt and igdl both fail', async () => {
		stubChain({
			cobalt: cobaltDown,
			btch: (endpoint) => (endpoint === 'igdl' ? new Response('nope', { status: 500 }) : Response.json(AIO_OK)),
		});
		const result = await new InstagramProvider().download(REEL_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media?.[0].url).toBe('https://aio.example/clip.mp4');
		expect(result.caption).toContain('AIO Clip');
	});

	it('errors when every stage fails', async () => {
		stubChain({
			cobalt: cobaltDown,
			btch: () => new Response('nope', { status: 500 }),
		});
		const result = await new InstagramProvider().download(REEL_URL, 'auto');
		expect(result.status).toBe('error');
	});

	it('stories still go through RSSHub, never cobalt', async () => {
		const xml = '<rss><channel><item><description>&lt;source src="https://cdn.example/story.mp4"&gt;</description></item></channel></rss>';
		const calls = stubChain({
			cobalt: () => Response.json({ status: 'redirect', url: CDN_MP4 }),
			btch: () => Response.json(IGDL_OK),
			rss: () => new Response(xml, { status: 200 }),
		});
		const result = await new InstagramProvider().download('https://www.instagram.com/stories/someuser/30123456789/', 'auto');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({ url: 'https://cdn.example/story.mp4', type: 'video' });
		expect(calls.some((c) => c.startsWith('cobalt'))).toBe(false);
	});
});
