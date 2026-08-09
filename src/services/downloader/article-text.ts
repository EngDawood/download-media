/**
 * Render long-form X content (Articles, threads) as Markdown.
 *
 * The Telegram bot can only show a short caption, so long-form posts are published to
 * Telegraph and the caption carries a link. MCP clients have no such limit and cannot
 * usefully fetch the Telegraph page, so they get the whole body inline instead.
 * Same source data as `telegraph-publisher.ts`, different rendering target.
 */

type Annotation = { bold?: boolean; italic?: boolean; href?: string };

/**
 * Normalize `content.entityMap` into a plain `entityKey → value` lookup.
 *
 * FxTwitter serialises it as an ARRAY of `{ key, value }` pairs, where `key` is the
 * entity id referenced by `entityRanges[].key` — not the array index. Indexing the array
 * positionally therefore resolves to the wrong entity (element 0 may have key "4"),
 * silently attaching the wrong URL to a link or dropping an image entirely.
 * Plain-object maps are accepted too, since Draft.js itself emits that shape.
 */
function buildEntityLookup(entityMap: unknown): Record<string, any> {
	const lookup: Record<string, any> = {};
	if (!entityMap) return lookup;

	if (Array.isArray(entityMap)) {
		for (const entry of entityMap) {
			if (entry?.key !== undefined) lookup[String(entry.key)] = entry.value ?? entry;
		}
		return lookup;
	}

	for (const [key, entry] of Object.entries(entityMap as Record<string, any>)) {
		lookup[key] = entry?.value ?? entry;
	}
	return lookup;
}

/**
 * Apply Draft.js inline style ranges and link entities to a block's text,
 * producing Markdown with `**bold**`, `*italic*` and `[text](href)` spans.
 */
function inlineMarkdown(text: string, inlineStyleRanges: any[], entityRanges: any[], entities: Record<string, any>): string {
	if (!text) return '';

	const chars: Annotation[] = Array.from({ length: text.length }, () => ({}));

	for (const r of inlineStyleRanges ?? []) {
		for (let i = r.offset; i < r.offset + r.length && i < chars.length; i++) {
			if (r.style === 'BOLD') chars[i].bold = true;
			if (r.style === 'ITALIC') chars[i].italic = true;
		}
	}
	for (const r of entityRanges ?? []) {
		const entity = entities[String(r.key)];
		if (entity?.type === 'LINK' && entity?.data?.url) {
			for (let i = r.offset; i < r.offset + r.length && i < chars.length; i++) {
				chars[i].href = entity.data.url;
			}
		}
	}

	// Group consecutive characters with identical annotations into spans
	let out = '';
	let i = 0;
	while (i < text.length) {
		const ann = chars[i];
		let j = i + 1;
		while (j < text.length && chars[j].bold === ann.bold && chars[j].italic === ann.italic && chars[j].href === ann.href) j++;

		let slice = text.slice(i, j);
		i = j;

		// Markers must hug the text, so trailing whitespace moves outside the span
		const trailing = slice.match(/\s+$/)?.[0] ?? '';
		if (trailing) slice = slice.slice(0, slice.length - trailing.length);

		if (slice) {
			if (ann.href) slice = `[${slice}](${ann.href})`;
			if (ann.italic) slice = `*${slice}*`;
			if (ann.bold) slice = `**${slice}**`;
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

/**
 * Convert Draft.js article blocks to Markdown lines.
 * Handles: unstyled, header-one/two, blockquote, ordered/unordered lists, atomic (images).
 */
function blocksToMarkdown(blocks: any[], entities: Record<string, any>, mediaEntities: any[]): RenderedBlock[] {
	// Build a lookup: mediaId → original_img_url
	const mediaById: Record<string, string> = {};
	for (const m of mediaEntities ?? []) {
		if (m.media_id && m.media_info?.original_img_url) {
			mediaById[m.media_id] = m.media_info.original_img_url;
		}
	}

	const rendered: RenderedBlock[] = [];
	let orderedIndex = 0;

	for (const block of blocks ?? []) {
		const { type, text, inlineStyleRanges, entityRanges } = block;

		if (type !== 'ordered-list-item') orderedIndex = 0;

		// Atomic blocks = inline media (images embedded in the article body)
		if (type === 'atomic') {
			for (const r of entityRanges ?? []) {
				const entity = entities[String(r.key)];
				if (entity?.type === 'MEDIA') {
					for (const item of entity.data?.mediaItems ?? []) {
						const imgUrl = mediaById[item.mediaId];
						if (imgUrl) rendered.push({ text: `![](${imgUrl})`, listItem: false });
					}
				}
			}
			continue;
		}

		// Skip empty unstyled blocks (whitespace-only separators)
		if (type === 'unstyled' && !text?.trim()) continue;

		const body = inlineMarkdown(text, inlineStyleRanges, entityRanges, entities);
		if (!body.trim()) continue;

		switch (type) {
			case 'header-one':
				rendered.push({ text: `## ${body}`, listItem: false });
				break;
			case 'header-two':
				rendered.push({ text: `### ${body}`, listItem: false });
				break;
			case 'blockquote':
				rendered.push({ text: `> ${body.replace(/\n/g, '\n> ')}`, listItem: false });
				break;
			case 'unordered-list-item':
				rendered.push({ text: `- ${body}`, listItem: true });
				break;
			case 'ordered-list-item':
				rendered.push({ text: `${++orderedIndex}. ${body}`, listItem: true });
				break;
			default:
				rendered.push({ text: body, listItem: false });
		}
	}

	return rendered;
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

/**
 * Render a full FxTwitter article (title + body) as Markdown.
 * `article.media_entities` supplies the images referenced by atomic blocks.
 */
export function articleToMarkdown(article: any): string {
	const parts: string[] = [];

	const title = article?.title?.trim();
	if (title) parts.push(`# ${title}`);

	// Cover image, so the Markdown stands alone without cross-referencing the media list
	const coverUrl = article?.cover_media?.media_info?.original_img_url;
	if (coverUrl) parts.push(`![](${coverUrl})`);

	const entities = buildEntityLookup(article?.content?.entityMap);
	const body = assemble(blocksToMarkdown(article?.content?.blocks ?? [], entities, article?.media_entities ?? []));
	if (body) parts.push(body);

	// Nothing parsed — fall back to the short preview rather than returning nothing
	if (!body && article?.preview_text?.trim()) parts.push(article.preview_text.trim());

	return parts.join('\n\n');
}

/**
 * Render a collected thread (FxTwitter tweet objects, oldest first) as Markdown.
 * Media is listed by URL so a client can fetch it without a second call.
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
