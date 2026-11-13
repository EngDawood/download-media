import { describe, it, expect, vi, afterEach } from 'vitest';
import { FacebookProvider } from '../src/services/downloader/platforms/facebook';

const PAGE_URL = 'https://www.facebook.com/watch/?v=10153231379946729';
const FBCDN = 'https://video.xx.fbcdn.net/o1/v/t2/f2/m412/clip.mp4?_nc_cat=101';
const FDOWN_OK = {
	status: 'success',
	video_info: { title: 'Fdown Clip', thumbnail: 'https://cdn.example/thumb.jpg' },
	download_url: 'https://fdown.example/merged.mp4',
	available_formats: [{ quality: '720p' }, { quality: '360p' }],
};
const AIO_OK = {
	data: {
		title: 'AIO Clip',
		links: { video: [{ url: 'https://aio.example/clip.mp4', q_text: '720p' }] },
	},
};

/**
 * Route fetch by host: fdown, cobalt, then the btch fleet (tioo).
 * Records which backends were touched, in order, in `calls`.
 */
const stubChain = (handlers: { fdown: () => Response; cobalt: (body: any) => Response; btch: (input: string) => Response }) => {
	const calls: string[] = [];
	vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
		// The bytes probe GETs the delivered URL (fbcdn redirect or tunnel);
		// it is not a backend call, so it answers bytes and stays out of `calls`.
		if (input.includes('fbcdn.net') || input.includes('/tunnel?')) {
			return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
		}
		if (input.includes('fdown.isuru.eu.org')) {
			calls.push('fdown');
			return handlers.fdown();
		}
		if (input.startsWith('https://cobaltapi.cjs.nz/')) {
			calls.push('cobalt');
			return handlers.cobalt(JSON.parse(String(init?.body)));
		}
		calls.push('btch');
		return handlers.btch(input);
	});
	return calls;
};

const fdownEmpty = () => new Response('unsupported', { status: 400 });
const cobaltDown = () => Response.json({ status: 'error', error: { code: 'error.api.fetch.empty' } });

describe('FacebookProvider cobalt step (after fdown, before AIO)', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('serves the video from cobalt when fdown has nothing, without touching btch', async () => {
		const calls = stubChain({
			fdown: fdownEmpty,
			cobalt: () => Response.json({ status: 'redirect', url: FBCDN }),
			btch: () => Response.json(AIO_OK),
		});
		const result = await new FacebookProvider().download(PAGE_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({ type: 'video', url: FBCDN });
		expect(calls).toEqual(['fdown', 'cobalt']);
	});

	it('keeps fdown first: a fdown hit never reaches cobalt', async () => {
		const calls = stubChain({
			fdown: () => Response.json(FDOWN_OK),
			cobalt: () => Response.json({ status: 'redirect', url: FBCDN }),
			btch: () => Response.json(AIO_OK),
		});
		const result = await new FacebookProvider().download(PAGE_URL, 'auto');
		expect(result.media?.[0].url).toBe(FDOWN_OK.download_url);
		expect(calls).toEqual(['fdown']);
	});

	it('falls through to AIO when cobalt errors', async () => {
		const calls = stubChain({
			fdown: fdownEmpty,
			cobalt: cobaltDown,
			btch: () => Response.json(AIO_OK),
		});
		const result = await new FacebookProvider().download(PAGE_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media?.[0].url).toBe('https://aio.example/clip.mp4');
		// btch races its four backends in parallel, so 'btch' repeats; what matters
		// is the stage order: fdown, then cobalt, then nothing but btch.
		expect(calls.slice(0, 2)).toEqual(['fdown', 'cobalt']);
		expect(calls.slice(2).every((c) => c === 'btch')).toBe(true);
	});

	it('serves audio mode as an MP3 from cobalt', async () => {
		stubChain({
			fdown: fdownEmpty,
			cobalt: (body) => {
				expect(body.downloadMode).toBe('audio');
				return Response.json({
					status: 'tunnel',
					url: 'https://cobaltapi.cjs.nz/tunnel?id=fbaud',
					filename: 'facebook_10153231379946729_audio.mp3',
				});
			},
			btch: () => Response.json(AIO_OK),
		});
		const result = await new FacebookProvider().download(PAGE_URL, 'audio');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({
			type: 'audio',
			url: 'https://cobaltapi.cjs.nz/tunnel?id=fbaud',
			filename: 'facebook_10153231379946729_audio.mp3',
		});
	});
});
