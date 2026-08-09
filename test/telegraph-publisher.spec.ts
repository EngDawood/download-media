import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishArticleToTelegraph } from '../src/services/downloader/telegraph-publisher';

/**
 * Mirrors the real FxTwitter article payload: `entityMap` is an ARRAY of { key, value }
 * pairs whose `key` is the entity id, deliberately NOT in positional order. Indexing it
 * positionally resolves entity 1 to a LINK instead of MEDIA, which silently dropped every
 * inline image while the cover image (a separate code path) kept working.
 */
const ARTICLE = {
	title: 'Test Article',
	cover_media: { media_info: { original_img_url: 'https://cdn/cover.jpg' } },
	media_entities: [
		{ media_id: 'M1', media_info: { original_img_url: 'https://cdn/inline-1.jpg' } },
		{ media_id: 'M2', media_info: { original_img_url: 'https://cdn/inline-2.jpg' } },
	],
	content: {
		blocks: [
			{ type: 'header-one', text: 'Heading', inlineStyleRanges: [], entityRanges: [] },
			{ type: 'atomic', text: ' ', inlineStyleRanges: [], entityRanges: [{ key: 1, offset: 0, length: 1 }] },
			{ type: 'unstyled', text: 'linked text', inlineStyleRanges: [], entityRanges: [{ key: 5, offset: 0, length: 11 }] },
			{ type: 'atomic', text: ' ', inlineStyleRanges: [], entityRanges: [{ key: 3, offset: 0, length: 1 }] },
		],
		// Order is scrambled on purpose: index !== key.
		entityMap: [
			{ key: '5', value: { type: 'LINK', data: { url: 'https://example.com/link' } } },
			{ key: '1', value: { type: 'MEDIA', data: { mediaItems: [{ mediaId: 'M1' }] } } },
			{ key: '3', value: { type: 'MEDIA', data: { mediaItems: [{ mediaId: 'M2' }] } } },
		],
	},
};

let captured: any;

beforeEach(() => {
	captured = undefined;
	vi.stubGlobal('fetch', async (_url: string, init: any) => {
		captured = JSON.parse(JSON.parse(init.body).content);
		return new Response(JSON.stringify({ ok: true, result: { url: 'https://telegra.ph/x' } }), {
			headers: { 'Content-Type': 'application/json' },
		});
	});
});

afterEach(() => vi.unstubAllGlobals());

/** Collect every img src in the generated Telegraph node tree. */
function imageSources(nodes: any[]): string[] {
	const out: string[] = [];
	const walk = (n: any) => {
		if (typeof n !== 'object' || !n) return;
		if (n.tag === 'img' && n.attrs?.src) out.push(n.attrs.src);
		for (const child of n.children ?? []) walk(child);
	};
	nodes.forEach(walk);
	return out;
}

describe('publishArticleToTelegraph', () => {
	it('includes inline body images, not just the cover', async () => {
		const url = await publishArticleToTelegraph(
			ARTICLE, { name: 'A', screenName: 'a' }, 'https://x.com/a/status/1', 'token',
		);
		expect(url).toBe('https://telegra.ph/x');

		expect(imageSources(captured)).toEqual([
			'https://cdn/cover.jpg',
			'https://cdn/inline-1.jpg',
			'https://cdn/inline-2.jpg',
		]);
	});

	it('resolves link entities by key rather than array position', async () => {
		await publishArticleToTelegraph(ARTICLE, { name: 'A', screenName: 'a' }, 'https://x.com/a/status/1', 'token');

		const hrefs: string[] = [];
		const walk = (n: any) => {
			if (typeof n !== 'object' || !n) return;
			if (n.tag === 'a' && n.attrs?.href) hrefs.push(n.attrs.href);
			for (const child of n.children ?? []) walk(child);
		};
		captured.forEach(walk);

		// Entity 5 is a LINK at array index 0 — positional lookup would have missed it.
		expect(hrefs).toContain('https://example.com/link');
	});

	it('tolerates a plain-object entityMap (Draft.js native shape)', async () => {
		const objectForm = {
			...ARTICLE,
			content: {
				...ARTICLE.content,
				entityMap: {
					'1': { type: 'MEDIA', data: { mediaItems: [{ mediaId: 'M1' }] } },
					'3': { type: 'MEDIA', data: { mediaItems: [{ mediaId: 'M2' }] } },
					'5': { type: 'LINK', data: { url: 'https://example.com/link' } },
				},
			},
		};
		await publishArticleToTelegraph(objectForm, { name: 'A', screenName: 'a' }, 'https://x.com/a/status/1', 'token');
		expect(imageSources(captured)).toEqual([
			'https://cdn/cover.jpg',
			'https://cdn/inline-1.jpg',
			'https://cdn/inline-2.jpg',
		]);
	});
});
