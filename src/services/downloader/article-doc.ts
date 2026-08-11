/**
 * Parse FxTwitter's Draft.js article payload into a neutral document tree.
 *
 * X Articles arrive as a Draft.js document: a flat `blocks` array, an `entityMap` of
 * links/media/dividers, and a separate `media_entities` table the media entities point into.
 * Resolving that takes three hops, and every renderer used to re-implement the walk —
 * which is exactly how they drifted apart: the Telegraph copy resolved `entityMap`
 * positionally and silently dropped every inline image while the Markdown copy was correct.
 *
 * So the traversal lives here once, and `article-text.ts` (Markdown), `article-html.ts`
 * (HTML) and `telegraph-publisher.ts` (Telegraph nodes) are thin serializers over the
 * result. A parsing fix now lands in all three at once.
 */

/** A run of text sharing identical formatting. */
export interface Inline {
	text: string;
	bold?: boolean;
	italic?: boolean;
	href?: string;
}

export type Block =
	| { kind: 'heading'; level: 1 | 2; inline: Inline[] }
	| { kind: 'paragraph'; inline: Inline[] }
	| { kind: 'quote'; inline: Inline[] }
	| { kind: 'listItem'; ordered: boolean; index: number; inline: Inline[] }
	| { kind: 'image'; src: string }
	| { kind: 'divider' };

export interface ArticleDoc {
	title?: string;
	/** Header image — comes from `cover_media`, not from the block list. */
	cover?: string;
	blocks: Block[];
	/** Short summary, used as a fallback when no blocks parse. */
	previewText?: string;
}

/**
 * Normalize `content.entityMap` into a plain `entityKey → value` lookup.
 *
 * FxTwitter serialises it as an ARRAY of `{ key, value }` pairs, where `key` is the
 * entity id referenced by `entityRanges[].key` — not the array index. Indexing the array
 * positionally therefore resolves to the wrong entity (element 0 may have key "4"),
 * silently attaching the wrong URL to a link or dropping an image entirely.
 * Plain-object maps are accepted too, since Draft.js itself emits that shape.
 */
export function buildEntityLookup(entityMap: unknown): Record<string, any> {
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
 * Apply Draft.js inline style ranges and link entities to a block's text, collapsing
 * runs of identically-formatted characters into spans.
 */
function splitInline(
	text: string,
	inlineStyleRanges: any[],
	entityRanges: any[],
	entities: Record<string, any>,
): Inline[] {
	if (!text) return [];

	type Annotation = { bold?: boolean; italic?: boolean; href?: string };
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

	const spans: Inline[] = [];
	let i = 0;
	while (i < text.length) {
		const ann = chars[i];
		let j = i + 1;
		while (j < text.length && chars[j].bold === ann.bold && chars[j].italic === ann.italic && chars[j].href === ann.href) j++;
		spans.push({ text: text.slice(i, j), ...ann });
		i = j;
	}
	return spans;
}

/** True when a block carries no visible text. */
function isBlank(inline: Inline[]): boolean {
	return !inline.some((s) => s.text.trim());
}

/**
 * Walk Draft.js blocks into neutral nodes.
 * Handles: unstyled, header-one/two, blockquote, ordered/unordered lists,
 * and atomic blocks carrying MEDIA (inline images) or DIVIDER entities.
 */
function parseBlocks(blocks: any[], entities: Record<string, any>, mediaEntities: any[]): Block[] {
	// mediaId → image URL. Atomic blocks reference media by id, not by URL.
	const mediaById: Record<string, string> = {};
	for (const m of mediaEntities ?? []) {
		if (m.media_id && m.media_info?.original_img_url) {
			mediaById[m.media_id] = m.media_info.original_img_url;
		}
	}

	const out: Block[] = [];
	let orderedIndex = 0;

	for (const block of blocks ?? []) {
		const { type, text, inlineStyleRanges, entityRanges } = block;

		if (type !== 'ordered-list-item') orderedIndex = 0;

		// Atomic blocks hold no text — they point at an entity.
		if (type === 'atomic') {
			for (const r of entityRanges ?? []) {
				const entity = entities[String(r.key)];
				if (entity?.type === 'MEDIA') {
					for (const item of entity.data?.mediaItems ?? []) {
						const src = mediaById[item.mediaId];
						if (src) out.push({ kind: 'image', src });
					}
				} else if (entity?.type === 'DIVIDER') {
					out.push({ kind: 'divider' });
				}
			}
			continue;
		}

		if (type === 'unstyled' && !text?.trim()) continue;

		const inline = splitInline(text, inlineStyleRanges, entityRanges, entities);
		if (isBlank(inline)) continue;

		switch (type) {
			case 'header-one':
				out.push({ kind: 'heading', level: 1, inline });
				break;
			case 'header-two':
				out.push({ kind: 'heading', level: 2, inline });
				break;
			case 'blockquote':
				out.push({ kind: 'quote', inline });
				break;
			case 'unordered-list-item':
				out.push({ kind: 'listItem', ordered: false, index: 0, inline });
				break;
			case 'ordered-list-item':
				out.push({ kind: 'listItem', ordered: true, index: ++orderedIndex, inline });
				break;
			default:
				out.push({ kind: 'paragraph', inline });
		}
	}

	return out;
}

/** Parse a full FxTwitter article object into the neutral document tree. */
export function parseArticle(article: any): ArticleDoc {
	const entities = buildEntityLookup(article?.content?.entityMap);
	return {
		title: article?.title?.trim() || undefined,
		cover: article?.cover_media?.media_info?.original_img_url,
		blocks: parseBlocks(article?.content?.blocks ?? [], entities, article?.media_entities ?? []),
		previewText: article?.preview_text?.trim() || undefined,
	};
}
