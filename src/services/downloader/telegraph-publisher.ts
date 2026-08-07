import { log } from '../../utils/logger';

// ─── Telegraph node types ─────────────────────────────────────────────────────

interface TelegraphNode {
	tag: string;
	attrs?: { href?: string; src?: string };
	children?: (string | TelegraphNode)[];
}

type TelegraphContent = (string | TelegraphNode)[];

// ─── Draft.js → Telegraph converter ──────────────────────────────────────────

/**
 * Map a Draft.js block type to a Telegraph tag.
 */
function blockTag(type: string): string {
	switch (type) {
		case 'header-one':   return 'h3';
		case 'header-two':   return 'h4';
		case 'blockquote':   return 'blockquote';
		case 'unordered-list-item': return 'li';
		case 'ordered-list-item':   return 'li';
		default:             return 'p';
	}
}

/**
 * Apply inline style ranges and entity ranges to a block's text,
 * producing an array of Telegraph child nodes.
 */
function buildInlineChildren(
	text: string,
	inlineStyleRanges: any[],
	entityRanges: any[],
	entityMap: Record<string, any>,
): (string | TelegraphNode)[] {
	if (!text) return [];

	// Build a flat map of per-character annotations
	type Annotation = { bold?: boolean; italic?: boolean; href?: string };
	const chars: Annotation[] = Array.from({ length: text.length }, () => ({}));

	for (const r of inlineStyleRanges ?? []) {
		for (let i = r.offset; i < r.offset + r.length && i < chars.length; i++) {
			if (r.style === 'BOLD') chars[i].bold = true;
			if (r.style === 'ITALIC') chars[i].italic = true;
		}
	}
	for (const r of entityRanges ?? []) {
		const entity = entityMap?.[String(r.key)]?.value ?? entityMap?.[String(r.key)];
		if (entity?.type === 'LINK' && entity?.data?.url) {
			for (let i = r.offset; i < r.offset + r.length && i < chars.length; i++) {
				chars[i].href = entity.data.url;
			}
		}
	}

	// Group consecutive characters with identical annotations into spans
	const children: (string | TelegraphNode)[] = [];
	let i = 0;
	while (i < text.length) {
		const ann = chars[i];
		let j = i + 1;
		while (
			j < text.length &&
			chars[j].bold === ann.bold &&
			chars[j].italic === ann.italic &&
			chars[j].href === ann.href
		) j++;

		const slice = text.slice(i, j);
		i = j;

		if (!ann.bold && !ann.italic && !ann.href) {
			children.push(slice);
			continue;
		}

		let node: string | TelegraphNode = slice;
		if (ann.href) node = { tag: 'a', attrs: { href: ann.href }, children: [node] };
		if (ann.italic) node = { tag: 'em', children: [node] };
		if (ann.bold) node = { tag: 'strong', children: [node] };
		children.push(node);
	}

	return children;
}

/**
 * Convert FxTwitter article content blocks to Telegraph nodes.
 * Handles: unstyled, header-one/two, atomic (inline images), links, bold/italic.
 */
function blocksToTelegraph(
	blocks: any[],
	entityMap: Record<string, any>,
	mediaEntities: any[],
): TelegraphContent {
	// Build a lookup: mediaId → original_img_url
	const mediaById: Record<string, string> = {};
	for (const m of mediaEntities ?? []) {
		if (m.media_id && m.media_info?.original_img_url) {
			mediaById[m.media_id] = m.media_info.original_img_url;
		}
	}

	const nodes: TelegraphContent = [];

	for (const block of blocks ?? []) {
		const { type, text, inlineStyleRanges, entityRanges } = block;

		// Atomic blocks = inline media (images embedded in article body)
		if (type === 'atomic') {
			for (const r of entityRanges ?? []) {
				const entity = entityMap?.[String(r.key)]?.value ?? entityMap?.[String(r.key)];
				if (entity?.type === 'MEDIA') {
					for (const item of entity.data?.mediaItems ?? []) {
						const imgUrl = mediaById[item.mediaId];
						if (imgUrl) {
							nodes.push({ tag: 'figure', children: [{ tag: 'img', attrs: { src: imgUrl } }] });
						}
					}
				}
			}
			continue;
		}

		// Skip empty unstyled blocks (just whitespace separators)
		if (type === 'unstyled' && !text?.trim()) {
			continue;
		}

		const tag = blockTag(type);
		const children = buildInlineChildren(text, inlineStyleRanges, entityRanges, entityMap);
		if (children.length > 0) {
			nodes.push({ tag, children });
		}
	}

	return nodes;
}

// ─── Telegraph API ────────────────────────────────────────────────────────────

/**
 * Convert a single FxTwitter tweet object into Telegraph content nodes.
 * Used when building a thread page — one section per tweet.
 */
function tweetToTelegraphNodes(tweet: any, index: number): TelegraphContent {
	const nodes: TelegraphContent = [];

	// Section divider after first tweet
	if (index > 0) {
		nodes.push({ tag: 'hr' });
	}

	// Tweet text
	const text = tweet.text?.trim();
	if (text) {
		nodes.push({ tag: 'p', children: [text] });
	}

	// Media — photos and videos
	const mediaItems: any[] = tweet.media?.all ?? [];
	for (const m of mediaItems) {
		if (m.type === 'photo' && m.url) {
			nodes.push({ tag: 'figure', children: [{ tag: 'img', attrs: { src: m.url } }] });
		} else if ((m.type === 'video' || m.type === 'gif') && m.thumbnail_url) {
			// Videos can't be embedded in Telegraph — show thumbnail with link
			nodes.push({
				tag: 'figure',
				children: [
					{ tag: 'img', attrs: { src: m.thumbnail_url } },
					{ tag: 'figcaption', children: ['🎬 Video (tap to open on X)'] },
				],
			});
		}
	}

	// Link back to this specific tweet
	nodes.push({
		tag: 'p',
		children: [
			{ tag: 'a', attrs: { href: tweet.url }, children: ['🔗 View tweet'] },
		],
	});

	return nodes;
}

/**
 * Publish a thread (array of FxTwitter tweet objects, oldest first) to Telegraph.
 * Returns the Telegraph page URL, or null on failure.
 */
export async function publishThreadToTelegraph(
	tweets: any[],
	accessToken: string,
): Promise<string | null> {
	if (tweets.length === 0) return null;
	try {
		const first = tweets[0];
		const author = first.author;

		// Title: first tweet's text (truncated) or fallback
		const rawTitle = first.text?.trim() || `Thread by @${author?.screen_name}`;
		const title = rawTitle.length > 100
			? rawTitle.slice(0, 97) + '…'
			: rawTitle;

		// Build content
		const content: TelegraphContent = [
			// Author header
			{
				tag: 'p',
				children: [
					'🧵 Thread by ',
					{ tag: 'a', attrs: { href: `https://x.com/${author?.screen_name}` }, children: [`@${author?.screen_name}`] },
					` — ${tweets.length} tweet${tweets.length > 1 ? 's' : ''}`,
				],
			},
		];

		for (let i = 0; i < tweets.length; i++) {
			content.push(...tweetToTelegraphNodes(tweets[i], i));
		}

		const body = JSON.stringify({
			access_token: accessToken,
			title: title.slice(0, 256),
			author_name: author?.name ?? 'Unknown',
			author_url: first.url,
			content: JSON.stringify(content),
			return_content: false,
		});

		const res = await fetch('https://api.telegra.ph/createPage', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			signal: AbortSignal.timeout(10_000),
		});

		if (!res.ok) {
			log('warn', 'telegraph', 'createPage (thread) HTTP error', { status: res.status });
			return null;
		}

		const data: any = await res.json();
		if (!data.ok) {
			log('warn', 'telegraph', 'createPage (thread) API error', { error: data.error });
			return null;
		}

		return data.result?.url ?? null;
	} catch (e) {
		log('warn', 'telegraph', 'publishThreadToTelegraph failed', { error: (e as Error).message });
		return null;
	}
}

/**
 * Create a Telegraph page from a FxTwitter article.
 * Returns the Telegraph page URL, or null on failure.
 */
export async function publishArticleToTelegraph(
	article: any,
	author: { name: string; screenName: string },
	tweetUrl: string,
	accessToken: string,
): Promise<string | null> {
	try {
		const title = article.title?.trim() || 'Twitter Article';
		const entityMap = article.content?.entityMap ?? {};
		const blocks = article.content?.blocks ?? [];
		const mediaEntities = article.media_entities ?? [];

		// Build content: cover image first, then body blocks
		const content: TelegraphContent = [];

		const coverUrl = article.cover_media?.media_info?.original_img_url;
		if (coverUrl) {
			content.push({ tag: 'figure', children: [{ tag: 'img', attrs: { src: coverUrl } }] });
		}

		// Author attribution line linking back to original tweet
		content.push({
			tag: 'p',
			children: [
				{ tag: 'a', attrs: { href: tweetUrl }, children: [`@${author.screenName} on X`] },
			],
		});

		content.push(...blocksToTelegraph(blocks, entityMap, mediaEntities));

		const body = JSON.stringify({
			access_token: accessToken,
			title: title.slice(0, 256), // Telegraph title max 256 chars
			author_name: author.name,
			author_url: tweetUrl,
			content: JSON.stringify(content),
			return_content: false,
		});

		const res = await fetch('https://api.telegra.ph/createPage', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			signal: AbortSignal.timeout(10_000),
		});

		if (!res.ok) {
			log('warn', 'telegraph', 'createPage HTTP error', { status: res.status });
			return null;
		}

		const data: any = await res.json();
		if (!data.ok) {
			log('warn', 'telegraph', 'createPage API error', { error: data.error });
			return null;
		}

		return data.result?.url ?? null;
	} catch (e) {
		log('warn', 'telegraph', 'publishArticleToTelegraph failed', { error: (e as Error).message });
		return null;
	}
}
