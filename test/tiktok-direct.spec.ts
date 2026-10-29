import { describe, it, expect, vi, afterEach } from 'vitest';
import { tryTiktokDirect } from '../src/services/downloader/tiktok-direct';

const CDN = 'https://v16-webapp-prime.us.tiktok.com/video/tos/a.mp4';

function pageHtml(itemStruct: unknown): string {
	const data = { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct } } } };
	return `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script></html>`;
}

/** Serve the post page for tiktok.com and bytes for the CDN, recording the CDN request headers. */
function stubTiktok(itemStruct: unknown, cdn: () => Response = () => new Response(new Uint8Array([1, 2, 3]))) {
	const cdnHeaders: Headers[] = [];
	vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
		if (url.startsWith('https://www.tiktok.com/')) {
			const res = new Response(pageHtml(itemStruct), { status: 200 });
			res.headers.append('Set-Cookie', 'tt_chain_token=abc; Path=/');
			res.headers.append('Set-Cookie', 'ttwid=xyz; Path=/');
			return res;
		}
		cdnHeaders.push(new Headers(init?.headers));
		return cdn();
	});
	return cdnHeaders;
}

describe('tiktok direct', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('downloads the video with the page cookies and a TikTok referer', async () => {
		const cdnHeaders = stubTiktok({
			desc: 'a caption',
			video: { playAddr: CDN, cover: 'https://p16.tiktokcdn-us.com/c.jpg' },
			music: { playUrl: 'https://m/a.mp3' },
		});
		const result = await tryTiktokDirect('https://www.tiktok.com/@u/video/1', 'auto');
		expect(cdnHeaders[0].get('cookie')).toBe('tt_chain_token=abc; ttwid=xyz');
		expect(cdnHeaders[0].get('referer')).toBe('https://www.tiktok.com/');
		expect(result?.caption).toBe('<b>a caption</b>');
		expect(result?.mp3Url).toBe('https://m/a.mp3');
		expect(result?.media?.[0]).toMatchObject({ type: 'video', url: CDN, filename: 'tiktok.mp4' });
		expect(result?.media?.[0].buffer).toEqual(new Uint8Array([1, 2, 3]));
	});

	it('keeps the link without a buffer when the CDN refuses the download', async () => {
		stubTiktok({ video: { playAddr: CDN } }, () => new Response('no', { status: 403 }));
		const result = await tryTiktokDirect('https://www.tiktok.com/@u/video/1', 'auto');
		expect(result?.media).toEqual([{ type: 'video', url: CDN }]);
	});

	it('returns the music track in audio mode', async () => {
		stubTiktok({ video: { playAddr: CDN }, music: { playUrl: 'https://m/a.mp3' } });
		const result = await tryTiktokDirect('https://www.tiktok.com/@u/video/1', 'audio');
		expect(result?.media?.[0]).toMatchObject({ type: 'audio', url: 'https://m/a.mp3', filename: 'tiktok.mp3' });
	});

	it('returns slideshow photos', async () => {
		stubTiktok({ imagePost: { images: [{ imageURL: { urlList: ['https://p/1.jpg'] } }, { imageURL: { urlList: ['https://p/2.jpg'] } }] } });
		const result = await tryTiktokDirect('https://www.tiktok.com/@u/video/1', 'auto');
		expect(result?.media).toEqual([
			{ type: 'photo', url: 'https://p/1.jpg' },
			{ type: 'photo', url: 'https://p/2.jpg' },
		]);
	});

	it('returns null when the page has no post data', async () => {
		vi.stubGlobal('fetch', async () => new Response('<html>captcha</html>', { status: 200 }));
		expect(await tryTiktokDirect('https://www.tiktok.com/@u/video/1', 'auto')).toBeNull();
	});
});
