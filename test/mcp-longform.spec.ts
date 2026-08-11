import { describe, it, expect, vi } from 'vitest';

/**
 * Long-form bodies must survive `shapeResult` on the way out of the MCP route — they are the
 * whole point of the route for X Articles, and are the easiest thing to drop when fields are
 * added. Stub the downloader so this stays a pure serialization test with no network.
 */
vi.mock('../src/services/media-downloader', () => ({
	downloadMedia: async () => ({
		status: 'success',
		media: [{ type: 'photo', url: 'https://cdn/cover.jpg' }],
		caption: '<b>Title</b>\npreview',
		fullText: '# Title\n\n![](https://cdn/inline.jpg)\n\nbody',
		fullHtml: '<h1>Title</h1>\n<figure><img src="https://cdn/inline.jpg" alt="" loading="lazy"></figure>\n<p>body</p>',
		thumbnail: 'https://cdn/cover.jpg',
	}),
	fetchTikTokInfo: async () => null,
	fetchFacebookInfo: async () => null,
}));

const KEY = 'test-api-key';
const env = { PUBLIC_API_KEY: KEY } as unknown as Env;

async function callDownload(args: Record<string, unknown>) {
	const { handleMcp } = await import('../src/routes/mcp');
	const { Hono } = await import('hono');
	const instance = new Hono();
	instance.post('/mcp', handleMcp);

	const res = await instance.fetch(
		new Request('https://worker/mcp', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY },
			body: JSON.stringify({
				jsonrpc: '2.0', id: 1, method: 'tools/call',
				params: { name: 'download_media', arguments: args },
			}),
		}),
		env,
	);
	return ((await res.json()) as any).result;
}

const URL_ARG = { url: 'https://x.com/someone/status/123' };

describe('MCP long-form passthrough', () => {
	it('defaults to Markdown only, so HTML never costs context unasked', async () => {
		const result = await callDownload(URL_ARG);
		expect(result.isError).toBeUndefined();

		const payload = result.structuredContent;
		expect(payload.fullText).toContain('# Title');
		expect(payload.fullText).toContain('![](https://cdn/inline.jpg)');
		expect(payload.fullHtml).toBeUndefined();

		// The text block clients read must carry it too, not just structuredContent.
		expect(result.content[0].text).toContain('fullText');
	});

	it('returns HTML only when asked', async () => {
		const payload = (await callDownload({ ...URL_ARG, format: 'html' })).structuredContent;
		expect(payload.fullHtml).toContain('<h1>Title</h1>');
		expect(payload.fullHtml).toContain('<img src="https://cdn/inline.jpg"');
		expect(payload.fullText).toBeUndefined();
	});

	it('returns both when asked', async () => {
		const payload = (await callDownload({ ...URL_ARG, format: 'both' })).structuredContent;
		expect(payload.fullText).toBeDefined();
		expect(payload.fullHtml).toBeDefined();
	});

	it('omits both bodies for format=none, keeping the media links', async () => {
		const payload = (await callDownload({ ...URL_ARG, format: 'none' })).structuredContent;
		expect(payload.fullText).toBeUndefined();
		expect(payload.fullHtml).toBeUndefined();
		expect(payload.media).toHaveLength(1);
		expect(payload.caption).toBeDefined();
	});

	it('falls back to the default for an unknown format', async () => {
		const payload = (await callDownload({ ...URL_ARG, format: 'yaml' })).structuredContent;
		expect(payload.fullText).toBeDefined();
		expect(payload.fullHtml).toBeUndefined();
	});
});
