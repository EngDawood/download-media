/**
 * Render long-form X content (Articles) as an HTML fragment.
 *
 * Parsing lives in `article-doc.ts`; this file only serializes. The output is a fragment
 * (no `<html>`/`<body>` wrapper) so callers can embed it in a page, a CMS field or an
 * email without stripping anything.
 */

import { parseArticle, type ArticleDoc, type Block, type Inline } from './article-doc';

/**
 * Escape text for HTML body content.
 * Article text is attacker-controlled (anyone can publish an X Article), so every
 * interpolated value is escaped — this output may be rendered in a browser.
 */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Escape a URL for use in an attribute, dropping anything that is not http(s).
 * Blocks `javascript:` and `data:` URLs, which would otherwise be a scripting vector
 * in whatever page embeds this fragment.
 */
function safeUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
		return escapeHtml(parsed.toString());
	} catch {
		return null;
	}
}

function inlineToHtml(spans: Inline[]): string {
	let out = '';
	for (const span of spans) {
		let slice = escapeHtml(span.text);
		if (span.href) {
			const href = safeUrl(span.href);
			// Unsafe scheme — keep the text, drop the link rather than the content.
			if (href) slice = `<a href="${href}" rel="noopener noreferrer" target="_blank">${slice}</a>`;
		}
		if (span.italic) slice = `<em>${slice}</em>`;
		if (span.bold) slice = `<strong>${slice}</strong>`;
		out += slice;
	}
	return out;
}

function blockToHtml(block: Block): string | null {
	switch (block.kind) {
		case 'image': {
			const src = safeUrl(block.src);
			return src ? `<figure><img src="${src}" alt="" loading="lazy"></figure>` : null;
		}
		case 'divider':
			return '<hr>';
		// h1 is reserved for the article title, so body headings start at h2.
		case 'heading':
			return `<h${block.level + 1}>${inlineToHtml(block.inline)}</h${block.level + 1}>`;
		case 'quote':
			return `<blockquote>${inlineToHtml(block.inline)}</blockquote>`;
		case 'listItem':
			return `<li>${inlineToHtml(block.inline)}</li>`;
		case 'paragraph':
			return `<p>${inlineToHtml(block.inline)}</p>`;
	}
}

/**
 * Wrap runs of consecutive list items in a single `<ul>`/`<ol>`.
 * Draft.js emits list items as flat sibling blocks with no container, so the grouping
 * has to be reconstructed here or every bullet becomes its own list.
 */
function serializeBlocks(blocks: Block[]): string[] {
	const out: string[] = [];
	let i = 0;

	while (i < blocks.length) {
		const block = blocks[i];

		if (block.kind === 'listItem') {
			const ordered = block.ordered;
			const items: string[] = [];
			while (i < blocks.length) {
				const next = blocks[i];
				if (next.kind !== 'listItem' || next.ordered !== ordered) break;
				const html = blockToHtml(next);
				if (html) items.push(html);
				i++;
			}
			const tag = ordered ? 'ol' : 'ul';
			if (items.length) out.push(`<${tag}>${items.join('')}</${tag}>`);
			continue;
		}

		const html = blockToHtml(block);
		if (html) out.push(html);
		i++;
	}

	return out;
}

/** Serialize an already-parsed document as an HTML fragment. */
export function docToHtml(doc: ArticleDoc): string {
	const parts: string[] = [];

	if (doc.title) parts.push(`<h1>${escapeHtml(doc.title)}</h1>`);

	if (doc.cover) {
		const cover = safeUrl(doc.cover);
		if (cover) parts.push(`<figure><img src="${cover}" alt="" loading="lazy"></figure>`);
	}

	const body = serializeBlocks(doc.blocks);
	parts.push(...body);

	// Nothing parsed — fall back to the short preview rather than returning a bare title
	if (!body.length && doc.previewText) parts.push(`<p>${escapeHtml(doc.previewText)}</p>`);

	return parts.join('\n');
}

/** Render a full FxTwitter article (title + body) as an HTML fragment. */
export function articleToHtml(article: any): string {
	return docToHtml(parseArticle(article));
}
