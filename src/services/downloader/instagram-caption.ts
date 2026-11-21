import { buildCaption } from './media-helpers';

// Cobalt and btch igdl return media only, and btch AIO (the one stage with a title) is
// down for Instagram. The public post page still carries the caption in og:description,
// reachable without cookies: `12 likes, 3 comments - user on October 28, 2026: "caption"`.
// Related posts embed their own `"caption":{...}` JSON in the same page, so only the meta
// tag is read — scraping those blocks would return another post's text.
const CAPTION_TIMEOUT_MS = 5_000;
const MAX_CAPTION_CHARS = 900;
const POST_PATH = /instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;
const ENGAGEMENT_PREFIX = /^[\d.,KMkm]+ likes?, [\d.,KMkm]+ comments? - .+? on [^:]+: "([\s\S]*)"\.?\s*$/;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Caption text out of an og:description value, or '' when it is not the likes/comments form. */
export function parseOgDescription(content: string): string {
	const text = content.replace(/[‎‏]/g, '').trim();
	const match = text.match(ENGAGEMENT_PREFIX);
	return match ? match[1].trim() : '';
}

/**
 * Original caption of a post/reel, as ready-to-send HTML. Never throws: any failure
 * (blocked, login wall, no caption) yields '' so the download itself is unaffected.
 */
export async function fetchInstagramCaption(url: string): Promise<string> {
	const post = url.match(POST_PATH);
	if (!post) return '';
	try {
		const res = await fetch(`https://www.instagram.com/${post[1].toLowerCase()}/${post[2]}/`, {
			signal: AbortSignal.timeout(CAPTION_TIMEOUT_MS),
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
				Accept: 'text/html,application/xhtml+xml',
				'Accept-Language': 'en-US,en;q=0.9',
				// Without Accept: text/html and Sec-Fetch-Mode: navigate Instagram serves a JS shell with no og tags.
				'Sec-Fetch-Dest': 'document',
				'Sec-Fetch-Mode': 'navigate',
				'Sec-Fetch-Site': 'none',
				Referer: 'https://www.instagram.com/',
			},
		});
		if (!res.ok) return '';
		let description = '';
		await new HTMLRewriter()
			.on('meta[property="og:description"]', {
				element(el) {
					description ||= el.getAttribute('content') ?? '';
				},
			})
			.transform(res)
			.arrayBuffer();
		const caption = parseOgDescription(description);
		if (!caption) return '';
		const clipped = caption.length > MAX_CAPTION_CHARS ? `${caption.slice(0, MAX_CAPTION_CHARS).trimEnd()}…` : caption;
		return buildCaption(escapeHtml(clipped));
	} catch {
		return '';
	}
}
