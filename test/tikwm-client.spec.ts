import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchTikwm, tryTikwm } from '../src/services/downloader/tikwm-client';

const okBody = {
	code: 0,
	msg: 'success',
	data: {
		title: 'a caption',
		cover: 'https://p16.tiktokcdn-us.com/cover.jpg',
		play: 'https://v16.tiktokcdn-us.com/sd.mp4',
		hdplay: 'https://v16.tiktokcdn-us.com/hd.mp4',
		music: 'https://v16.tiktokcdn-us.com/music.mp3',
		images: [] as string[],
	},
};

/** Stub fetch with a queue of canned responses, capturing each request body. */
function stubTikwm(...bodies: unknown[]) {
	const calls: URLSearchParams[] = [];
	vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
		calls.push(init.body as URLSearchParams);
		const body = bodies[Math.min(calls.length - 1, bodies.length - 1)];
		return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
	});
	return calls;
}

describe('tikwm client', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('maps a video post to the HD rendition with music and thumbnail', async () => {
		const calls = stubTikwm(okBody);
		const result = await tryTikwm('https://vt.tiktok.com/abc/', 'auto');
		expect(calls[0].get('url')).toBe('https://vt.tiktok.com/abc/');
		expect(calls[0].get('hd')).toBe('1');
		expect(result).toEqual({
			status: 'success',
			media: [{ type: 'video', url: 'https://v16.tiktokcdn-us.com/hd.mp4' }],
			caption: '<b>a caption</b>',
			thumbnail: 'https://p16.tiktokcdn-us.com/cover.jpg',
			mp3Url: 'https://v16.tiktokcdn-us.com/music.mp3',
		});
	});

	it('falls back to the standard rendition when there is no HD one', async () => {
		stubTikwm({ ...okBody, data: { ...okBody.data, hdplay: undefined } });
		const result = await tryTikwm('https://vt.tiktok.com/abc/', 'auto');
		expect(result?.media?.[0].url).toBe('https://v16.tiktokcdn-us.com/sd.mp4');
	});

	it('returns audio in audio mode', async () => {
		stubTikwm(okBody);
		const result = await tryTikwm('https://vt.tiktok.com/abc/', 'audio');
		expect(result?.media).toEqual([{ type: 'audio', url: 'https://v16.tiktokcdn-us.com/music.mp3' }]);
	});

	it('returns slideshow photos instead of a video', async () => {
		stubTikwm({ ...okBody, data: { ...okBody.data, images: ['https://p16.tiktokcdn-us.com/1.jpg', 'https://p16.tiktokcdn-us.com/2.jpg'] } });
		const result = await tryTikwm('https://vt.tiktok.com/abc/', 'auto');
		expect(result?.media?.map((m) => m.type)).toEqual(['photo', 'photo']);
	});

	it('retries once after a rate-limit reply, then succeeds', async () => {
		vi.useFakeTimers();
		const calls = stubTikwm({ code: -1, msg: 'Free Api Limit: 1 request/second.' }, okBody);
		const pending = fetchTikwm('https://vt.tiktok.com/abc/');
		await vi.advanceTimersByTimeAsync(1200);
		expect(await pending).toMatchObject({ title: 'a caption' });
		expect(calls).toHaveLength(2);
	});

	it('returns null on failures so the btch backends take over', async () => {
		stubTikwm({ code: -1, msg: 'Url parsing is failed! Please check url.' });
		expect(await tryTikwm('https://vt.tiktok.com/abc/', 'auto')).toBeNull();
		vi.stubGlobal('fetch', async () => {
			throw new Error('network down');
		});
		expect(await tryTikwm('https://vt.tiktok.com/abc/', 'auto')).toBeNull();
	});
});
