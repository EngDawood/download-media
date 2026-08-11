/**
 * Render long-form X content (Articles, threads) as Markdown.
 *
 * The Telegram bot can only show a short caption, so long-form posts are published to
 * Telegraph and the caption carries a link. MCP clients have no such limit and cannot
 * usefully fetch the Telegraph page, so they get the whole body inline instead.
 *
 * Parsing lives in `article-doc.ts`; this file only serializes. See that module for why.
 */

import { parseArticle, type ArticleDoc, type Block, type Inline } from './article-doc';

export { buildEntityLookup } from './article-doc';

/**
 * Render inline spans as Markdown.
 * Markers must hug their text, so trailing whitespace is pushed outside the span —
 * `**bold **` renders literally in most parsers, `**bold** ` does not.
 */
function inlineToMarkdown(spans: Inline[]): string {
	let out = '';
	for (const span of spans) {
		let slice = span.text;
		const trailing = slice.match(/\s+$/)?.[0] ?? '';
		if (trailing) slice = slice.slice(0, slice.length - trailing.length);

		if (slice) {
			if (span.href) slice = `[${slice}](${span.href})`;
			if (span.italic) slice = `*${slice}*`;
			if (span.bold) slice = `**${slice}**`;
		}
		out += slice + trailing;
	}
	return out;
}

/** A rendered block plus whether it is a list item, so lists can stay tight. */
interface RenderedBlock {
	text: string;
	listItem: boolean;
}

function blockToMarkdown(block: Block): RenderedBlock | null {
	switch (block.kind) {
		case 'image':
			return { text: `![](${block.src})`, listItem: false };
		case 'divider':
			return { text: '---', listItem: false };
		case 'heading':
			return { text: `${block.level === 1 ? '##' : '###'} ${inlineToMarkdown(block.inline)}`, listItem: false };
		case 'quote': {
			const body = inlineToMarkdown(block.inline);
			return { text: `> ${body.replace(/\n/g, '\n> ')}`, listItem: false };
		}
		case 'listItem': {
			const marker = block.ordered ? `${block.index}.` : '-';
			return { text: `${marker} ${inlineToMarkdown(block.inline)}`, listItem: true };
		}
		case 'paragraph':
			return { text: inlineToMarkdown(block.inline), listItem: false };
	}
}

/** Join blocks with blank lines, keeping consecutive list items tight. */
function assemble(blocks: RenderedBlock[]): string {
	let out = '';
	for (let i = 0; i < blocks.length; i++) {
		if (i > 0) out += blocks[i].listItem && blocks[i - 1].listItem ? '\n' : '\n\n';
		out += blocks[i].text;
	}
	return out;
}

/** Serialize an already-parsed document as Markdown. */
export function docToMarkdown(doc: ArticleDoc): string {
	const parts: string[] = [];

	if (doc.title) parts.push(`# ${doc.title}`);
	// Cover image, so the Markdown stands alone without cross-referencing the media list
	if (doc.cover) parts.push(`![](${doc.cover})`);

	const rendered = doc.blocks.map(blockToMarkdown).filter((b): b is RenderedBlock => b !== null);
	const body = assemble(rendered);
	if (body) parts.push(body);

	// Nothing parsed — fall back to the short preview rather than returning nothing
	if (!body && doc.previewText) parts.push(doc.previewText);

	return parts.join('\n\n');
}

/**
 * Render a full FxTwitter article (title + body) as Markdown.
 * `article.media_entities` supplies the images referenced by atomic blocks.
 */
export function articleToMarkdown(article: any): string {
	return docToMarkdown(parseArticle(article));
}

/**
 * Render a collected thread (FxTwitter tweet objects, oldest first) as Markdown.
 * Media is listed by URL so a client can fetch it without a second call.
 *
 * Threads are plain tweet objects, not Draft.js documents, so they do not go through
 * `article-doc.ts`.
 */
export function threadToMarkdown(tweets: any[]): string {
	if (!tweets?.length) return '';

	const author = tweets[0]?.author;
	const parts: string[] = [`# Thread by @${author?.screen_name ?? 'unknown'} — ${tweets.length} tweet${tweets.length > 1 ? 's' : ''}`];

	for (let i = 0; i < tweets.length; i++) {
		const tweet = tweets[i];
		const section: string[] = [];

		const text = tweet.text?.trim();
		if (text) section.push(text);

		for (const m of tweet.media?.all ?? []) {
			if (m.type === 'photo' && m.url) section.push(`![](${m.url})`);
			else if ((m.type === 'video' || m.type === 'gif') && m.url) section.push(`🎬 Video: ${m.url}`);
		}

		if (tweet.url) section.push(`— ${tweet.url}`);
		if (section.length) parts.push(section.join('\n\n'));
	}

	return parts.join('\n\n---\n\n');
}
