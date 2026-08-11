import { log } from '../../utils/logger';
import { parseArticle, type Block, type Inline } from './article-doc';

// ─── Telegraph node types ─────────────────────────────────────────────────────

interface TelegraphNode {
	tag: string;
	attrs?: { href?: string; src?: string };
	children?: (string | TelegraphNode)[];
}

type TelegraphContent = (string | TelegraphNode)[];

// ─── ArticleDoc → Telegraph serializer ───────────────────────────────────────

/** Render inline spans as Telegraph child nodes. Unformatted runs stay bare strings. */
function inlineToTelegraph(spans: Inline[]): (string | TelegraphNode)[] {
	return spans.map((span) => {
		let node: string | TelegraphNode = span.text;
		if (span.href) node = { tag: 'a', attrs: { href: span.href }, children: [node] };
		if (span.italic) node = { tag: 'em', children: [node] };
		if (span.bold) node = { tag: 'strong', children: [node] };
		return node;
	});
}

/**
 * Serialize neutral blocks to Telegraph nodes.
 * Telegraph starts body headings at h3 — h1/h2 are reserved for the page title.
 */
function blocksToTelegraph(blocks: Block[]): TelegraphContent {
	const nodes: TelegraphContent = [];

	for (const block of blocks) {
		switch (block.kind) {
			case 'image':
				nodes.push({ tag: 'figure', children: [{ tag: 'img', attrs: { src: block.src } }] });
				break;
			case 'divider':
				nodes.push({ tag: 'hr' });
				break;
			case 'heading':
				nodes.push({ tag: block.level === 1 ? 'h3' : 'h4', children: inlineToTelegraph(block.inline) });
				break;
			case 'quote':
				nodes.push({ tag: 'blockquote', children: inlineToTelegraph(block.inline) });
				break;
			case 'listItem':
				nodes.push({ tag: 'li', children: inlineToTelegraph(block.inline) });
				break;
			case 'paragraph':
				nodes.push({ tag: 'p', children: inlineToTelegraph(block.inline) });
				break;
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
		children: [{ tag: 'a', attrs: { href: tweet.url }, children: ['🔗 View tweet'] }],
	});

	return nodes;
}

/**
 * Publish a thread (array of FxTwitter tweet objects, oldest first) to Telegraph.
 * Returns the Telegraph page URL, or null on failure.
 */
export async function publishThreadToTelegraph(tweets: any[], accessToken: string): Promise<string | null> {
	if (tweets.length === 0) return null;
	try {
		const first = tweets[0];
		const author = first.author;

		// Title: first tweet's text (truncated) or fallback
		const rawTitle = first.text?.trim() || `Thread by @${author?.screen_name}`;
		const title = rawTitle.length > 100 ? rawTitle.slice(0, 97) + '…' : rawTitle;

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
		const doc = parseArticle(article);
		const title = doc.title || 'Twitter Article';

		// Build content: cover image first, then body blocks
		const content: TelegraphContent = [];

		if (doc.cover) {
			content.push({ tag: 'figure', children: [{ tag: 'img', attrs: { src: doc.cover } }] });
		}

		// Author attribution line linking back to original tweet
		content.push({
			tag: 'p',
			children: [{ tag: 'a', attrs: { href: tweetUrl }, children: [`@${author.screenName} on X`] }],
		});

		content.push(...blocksToTelegraph(doc.blocks));

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
