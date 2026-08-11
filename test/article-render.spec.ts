import { describe, it, expect } from 'vitest';
import { parseArticle } from '../src/services/downloader/article-doc';
import { articleToMarkdown } from '../src/services/downloader/article-text';
import { articleToHtml } from '../src/services/downloader/article-html';

/**
 * One fixture exercising every block kind. `entityMap` is an ARRAY whose index does not
 * match the entity key — the real FxTwitter shape, and the source of the bug where
 * positional lookups dropped inline images.
 */
const ARTICLE = {
	title: 'My Article',
	preview_text: 'a preview',
	cover_media: { media_info: { original_img_url: 'https://cdn/cover.jpg' } },
	media_entities: [{ media_id: 'M1', media_info: { original_img_url: 'https://cdn/inline.jpg' } }],
	content: {
		entityMap: [
			{ key: '7', value: { type: 'LINK', data: { url: 'https://example.com/a' } } },
			{ key: '2', value: { type: 'MEDIA', data: { mediaItems: [{ mediaId: 'M1' }] } } },
			{ key: '9', value: { type: 'DIVIDER', data: {} } },
		],
		blocks: [
			{ type: 'header-one', text: 'Big Heading', inlineStyleRanges: [], entityRanges: [] },
			{ type: 'unstyled', text: 'plain text', inlineStyleRanges: [], entityRanges: [] },
			{ type: 'unstyled', text: 'bold and italic', inlineStyleRanges: [
				{ style: 'BOLD', offset: 0, length: 4 },
				{ style: 'ITALIC', offset: 9, length: 6 },
			], entityRanges: [] },
			{ type: 'unstyled', text: 'click here', inlineStyleRanges: [], entityRanges: [{ key: 7, offset: 0, length: 10 }] },
			{ type: 'atomic', text: ' ', inlineStyleRanges: [], entityRanges: [{ key: 2, offset: 0, length: 1 }] },
			{ type: 'header-two', text: 'Sub Heading', inlineStyleRanges: [], entityRanges: [] },
			{ type: 'blockquote', text: 'a quote', inlineStyleRanges: [], entityRanges: [] },
			{ type: 'unordered-list-item', text: 'first', inlineStyleRanges: [], entityRanges: [] },
			{ type: 'unordered-list-item', text: 'second', inlineStyleRanges: [], entityRanges: [] },
			{ type: 'ordered-list-item', text: 'one', inlineStyleRanges: [], entityRanges: [] },
			{ type: 'ordered-list-item', text: 'two', inlineStyleRanges: [], entityRanges: [] },
			{ type: 'atomic', text: ' ', inlineStyleRanges: [], entityRanges: [{ key: 9, offset: 0, length: 1 }] },
			{ type: 'unstyled', text: '   ', inlineStyleRanges: [], entityRanges: [] },
		],
	},
};

describe('parseArticle', () => {
	it('resolves entities by key, not array position', () => {
		const doc = parseArticle(ARTICLE);
		expect(doc.title).toBe('My Article');
		expect(doc.cover).toBe('https://cdn/cover.jpg');
		expect(doc.blocks.filter((b) => b.kind === 'image')).toEqual([{ kind: 'image', src: 'https://cdn/inline.jpg' }]);
		expect(doc.blocks.some((b) => b.kind === 'divider')).toBe(true);
	});

	it('drops whitespace-only blocks and numbers ordered lists', () => {
		const doc = parseArticle(ARTICLE);
		expect(doc.blocks.some((b) => b.kind === 'paragraph' && b.inline.every((s) => !s.text.trim()))).toBe(false);
		const ordered = doc.blocks.filter((b) => b.kind === 'listItem' && b.ordered);
		expect(ordered.map((b: any) => b.index)).toEqual([1, 2]);
	});
});

describe('articleToMarkdown', () => {
	it('renders the full document', () => {
		expect(articleToMarkdown(ARTICLE)).toBe(
			[
				'# My Article',
				'',
				'![](https://cdn/cover.jpg)',
				'',
				'## Big Heading',
				'',
				'plain text',
				'',
				'**bold** and *italic*',
				'',
				'[click here](https://example.com/a)',
				'',
				'![](https://cdn/inline.jpg)',
				'',
				'### Sub Heading',
				'',
				'> a quote',
				'',
				// Consecutive list items join tight, including across a ul→ol switch.
				// Pre-existing `assemble` behaviour, preserved by the refactor.
				'- first',
				'- second',
				'1. one',
				'2. two',
				'',
				'---',
			].join('\n'),
		);
	});

	it('falls back to preview text when nothing parses', () => {
		const empty = { ...ARTICLE, content: { entityMap: [], blocks: [] } };
		expect(articleToMarkdown(empty)).toBe('# My Article\n\n![](https://cdn/cover.jpg)\n\na preview');
	});
});

describe('articleToHtml', () => {
	const html = articleToHtml(ARTICLE);

	it('renders the full document', () => {
		expect(html).toBe(
			[
				'<h1>My Article</h1>',
				'<figure><img src="https://cdn/cover.jpg" alt="" loading="lazy"></figure>',
				'<h2>Big Heading</h2>',
				'<p>plain text</p>',
				'<p><strong>bold</strong> and <em>italic</em></p>',
				'<p><a href="https://example.com/a" rel="noopener noreferrer" target="_blank">click here</a></p>',
				'<figure><img src="https://cdn/inline.jpg" alt="" loading="lazy"></figure>',
				'<h3>Sub Heading</h3>',
				'<blockquote>a quote</blockquote>',
				'<ul><li>first</li><li>second</li></ul>',
				'<ol><li>one</li><li>two</li></ol>',
				'<hr>',
			].join('\n'),
		);
	});

	it('groups consecutive list items into one list, splitting on type change', () => {
		expect(html).toContain('<ul><li>first</li><li>second</li></ul>');
		expect(html).toContain('<ol><li>one</li><li>two</li></ol>');
	});

	it('escapes text so article content cannot inject markup', () => {
		const hostile = {
			title: '<script>alert(1)</script>',
			content: {
				entityMap: [],
				blocks: [{ type: 'unstyled', text: 'a < b & c "quoted"', inlineStyleRanges: [], entityRanges: [] }],
			},
		};
		const out = articleToHtml(hostile);
		expect(out).toContain('<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>');
		expect(out).toContain('<p>a &lt; b &amp; c &quot;quoted&quot;</p>');
		expect(out).not.toContain('<script>');
	});

	it('drops javascript: links but keeps their text', () => {
		const hostile = {
			content: {
				entityMap: [{ key: '0', value: { type: 'LINK', data: { url: 'javascript:alert(1)' } } }],
				blocks: [{ type: 'unstyled', text: 'tap me', inlineStyleRanges: [], entityRanges: [{ key: 0, offset: 0, length: 6 }] }],
			},
		};
		const out = articleToHtml(hostile);
		expect(out).toBe('<p>tap me</p>');
		expect(out).not.toContain('javascript:');
	});
});
