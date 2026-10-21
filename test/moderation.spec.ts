import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSexualResult } from '../src/services/moderation';
import type { DownloaderResult } from '../src/types/downloader';

const result: DownloaderResult = {
	status: 'success',
	media: [{ type: 'video', url: 'https://cdn.example.com/v.mp4' }],
	caption: 'some caption',
	thumbnail: 'https://cdn.example.com/thumb.jpg',
};

/** Stub fetch with one canned moderation response, capturing the request body. */
function stubModeration(status: number, body: unknown) {
	const seen: { url?: string; auth?: string; body?: any } = {};
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		seen.url = url;
		seen.auth = (init.headers as Record<string, string>).Authorization;
		seen.body = JSON.parse(init.body as string);
		return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
	});
	return seen;
}

describe('isSexualResult()', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sends caption and thumbnail in one request and flags a sexual result', async () => {
		const seen = stubModeration(200, { results: [{ categories: { sexual: true, violence: false } }] });
		expect(await isSexualResult('key', result)).toBe(true);
		expect(seen.url).toBe('https://api.openai.com/v1/moderations');
		expect(seen.auth).toBe('Bearer key');
		expect(seen.body.model).toBe('omni-moderation-latest');
		expect(seen.body.input).toEqual([
			{ type: 'text', text: 'some caption' },
			{ type: 'image_url', image_url: { url: 'https://cdn.example.com/thumb.jpg' } },
		]);
	});

	it('ignores non-sexual categories such as violence', async () => {
		stubModeration(200, { results: [{ categories: { sexual: false, violence: true } }] });
		expect(await isSexualResult('key', result)).toBe(false);
	});

	it('uses a photo item when there is no thumbnail', async () => {
		const seen = stubModeration(200, { results: [{ categories: { sexual: false } }] });
		await isSexualResult('key', { status: 'success', media: [{ type: 'photo', url: 'https://cdn.example.com/p.jpg' }] });
		expect(seen.body.input).toEqual([{ type: 'image_url', image_url: { url: 'https://cdn.example.com/p.jpg' } }]);
	});

	it('does not call the API without a key or without anything to scan', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		expect(await isSexualResult(undefined, result)).toBe(false);
		expect(await isSexualResult('key', { status: 'success', media: [{ type: 'video', url: 'https://cdn.example.com/v.mp4' }] })).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('fails open on API errors and network failures', async () => {
		stubModeration(500, { error: 'boom' });
		expect(await isSexualResult('key', result)).toBe(false);
		vi.stubGlobal('fetch', async () => {
			throw new Error('network down');
		});
		expect(await isSexualResult('key', result)).toBe(false);
	});
});
