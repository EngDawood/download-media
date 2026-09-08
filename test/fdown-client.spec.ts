import { describe, it, expect, vi, afterEach } from 'vitest';
import { tryFdown } from '../src/services/downloader/fdown-client';
import { DownloadError } from '../src/services/downloader/failure';

const VIDEO_URL = 'https://video-den2-1.xx.fbcdn.net/o1/v/t2/f2/m366/merged.mp4';

/** Stub fetch with one canned response, capturing the request the client made. */
function stubFdown(status: number, body: unknown) {
	const seen: { url?: string; body?: any } = {};
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		seen.url = url;
		seen.body = JSON.parse(init.body as string);
		return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
	});
	return seen;
}

const successBody = {
	status: 'success',
	video_info: {
		title: '455K views · 6.2K reactions | Story of my life | Wornies Gaming',
		thumbnail: 'https://scontent.xx.fbcdn.net/thumb.jpg',
		uploader: 'Wornies Gaming',
	},
	download_url: VIDEO_URL,
	available_formats: [
		{ quality: '1080p', format_id: '3008672289493503v', ext: 'mp4', url: 'https://video.xx.fbcdn.net/dash-1080.mp4' },
		{ quality: '720p', format_id: '3008672282826837v', ext: 'mp4', url: 'https://video.xx.fbcdn.net/dash-720.mp4' },
	],
};

describe('tryFdown()', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('maps a success response onto a single-video result', async () => {
		stubFdown(200, successBody);
		const result = await tryFdown('https://www.facebook.com/reel/123/', 'auto');
		expect(result?.status).toBe('success');
		expect(result?.media).toEqual([{ type: 'video', url: VIDEO_URL }]);
		expect(result?.thumbnail).toBe('https://scontent.xx.fbcdn.net/thumb.jpg');
	});

	it('strips the view/reaction prefix Facebook titles carry', async () => {
		stubFdown(200, successBody);
		const result = await tryFdown('https://www.facebook.com/reel/123/', 'auto');
		expect(result?.caption).toBe('<b>Story of my life | Wornies Gaming</b>');
	});

	// The listed formats are yt-dlp's raw DASH renditions — video-only, no audio track.
	// Turning them into a quality ladder would let the sender step down to a silent file.
	it('never exposes available_formats as a quality ladder', async () => {
		stubFdown(200, successBody);
		const result = await tryFdown('https://www.facebook.com/reel/123/', 'auto');
		expect(result?.media?.[0].variants).toBeUndefined();
	});

	it('asks for `worst` in sd mode and `best` otherwise', async () => {
		const sd = stubFdown(200, successBody);
		await tryFdown('https://www.facebook.com/reel/123/', 'sd');
		expect(sd.body.quality).toBe('worst');

		vi.unstubAllGlobals();
		const hd = stubFdown(200, successBody);
		await tryFdown('https://www.facebook.com/reel/123/', 'hd');
		expect(hd.body.quality).toBe('best');
	});

	it('offers HD/SD rungs when the post lists more than one height', async () => {
		stubFdown(200, successBody);
		const result = await tryFdown('https://www.facebook.com/reel/123/', 'auto');
		expect(result?.altQualities).toEqual([
			{ label: 'HD', mode: 'hd' },
			{ label: 'SD', mode: 'sd' },
		]);
	});

	// One rendition means `worst` would hand back the same file the user already has.
	it('offers no rungs when the post has a single height, or none at all', async () => {
		const oneHeight = {
			...successBody,
			available_formats: [
				{ quality: '720p', format_id: 'a', ext: 'mp4', url: 'https://video.xx.fbcdn.net/a.mp4' },
				{ quality: '720p', format_id: 'b', ext: 'mp4', url: 'https://video.xx.fbcdn.net/b.mp4' },
			],
		};
		stubFdown(200, oneHeight);
		expect((await tryFdown('https://www.facebook.com/reel/123/', 'auto'))?.altQualities).toBeUndefined();

		vi.unstubAllGlobals();
		stubFdown(200, { ...successBody, available_formats: [] });
		expect((await tryFdown('https://www.facebook.com/reel/123/', 'auto'))?.altQualities).toBeUndefined();
	});

	it('returns null on 400 so the failure never outranks a later timeout', async () => {
		stubFdown(400, { detail: { status: 'error', message: 'Unsupported URL', error_code: 'INVALID_REQUEST' } });
		await expect(tryFdown('https://www.facebook.com/reel/123/', 'auto')).resolves.toBeNull();
	});

	it('returns null when a 200 carries no download_url', async () => {
		stubFdown(200, { status: 'success', video_info: { title: 'x' }, download_url: null, available_formats: [] });
		await expect(tryFdown('https://www.facebook.com/reel/123/', 'auto')).resolves.toBeNull();
	});

	it('throws rate_limited on 429 and on 5xx — those describe the service, not the link', async () => {
		stubFdown(429, { detail: { error_code: 'RATE_LIMIT_EXCEEDED' } });
		await expect(tryFdown('https://www.facebook.com/reel/123/', 'auto')).rejects.toMatchObject({ kind: 'rate_limited' });

		vi.unstubAllGlobals();
		stubFdown(503, {});
		const err = await tryFdown('https://www.facebook.com/reel/123/', 'auto').catch((e) => e);
		expect(err).toBeInstanceOf(DownloadError);
		expect(err.kind).toBe('rate_limited');
	});
});
