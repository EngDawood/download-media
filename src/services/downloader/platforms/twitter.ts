import { log } from '../../../utils/logger';
import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { classifyError, mostPermanent, type FailureKind } from '../failure';
import { tryAIO } from '../aio-parser';
import { buildCaption, isUrl, detectMediaType, parseTwimgVariants } from '../media-helpers';
import { publishArticleToTelegraph, publishThreadToTelegraph } from '../telegraph-publisher';
import { articleToMarkdown, threadToMarkdown } from '../article-text';
import { articleToHtml } from '../article-html';

// ─── FxTwitter (primary) ─────────────────────────────────────────────────────

function extractTweetId(url: string): string | null {
	const match = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i);
	return match ? match[1] : null;
}

/**
 * Handle tweet.article — publishes to Telegraph and returns cover image + link.
 */
async function handleArticle(tweet: any, tweetUrl: string, accessToken: string): Promise<DownloaderResult | null> {
	if (!tweet.article) return null;
	// media_entities lives on the article itself; the tweet-level field is a legacy fallback.
	const article = { ...tweet.article, media_entities: tweet.article.media_entities ?? tweet.media_entities };

	const title = article.title?.trim() || 'Twitter Article';
	const preview = article.preview_text?.trim() || '';
	const coverUrl: string | undefined = article.cover_media?.media_info?.original_img_url;
	const avatar: string | undefined = tweet.author?.avatar_url;

	// Publish to Telegraph
	const telegraphUrl = await publishArticleToTelegraph(
		article,
		{ name: tweet.author?.name ?? 'Unknown', screenName: tweet.author?.screen_name ?? 'unknown' },
		tweetUrl,
		accessToken,
	);

	const captionLines: string[] = [];
	captionLines.push(`<b>${title}</b>`);
	if (preview) captionLines.push(preview);
	if (telegraphUrl) captionLines.push(`\n📖 <a href="${telegraphUrl}">Read full article</a>`);

	const caption = captionLines.join('\n');
	const thumbnail = coverUrl ?? avatar;

	return {
		status: 'success',
		media: coverUrl ? [{ type: 'photo', url: coverUrl }] : avatar ? [{ type: 'photo', url: avatar }] : [],
		caption,
		thumbnail,
		fullText: articleToMarkdown(article),
		fullHtml: articleToHtml(article),
	};
}

// ─── Thread detection & collection ─────────────────────────────────────────

/**
 * A tweet is part of a thread (not a normal reply) when the author
 * is replying to themselves: replying_to === author.screen_name.
 */
function isThreadTweet(tweet: any): boolean {
	return !!tweet.replying_to && tweet.replying_to.toLowerCase() === tweet.author?.screen_name?.toLowerCase();
}

/**
 * Build a video item, carrying over the quality ladder FxTwitter ships alongside it.
 *
 * `m.url` is already the top rendition, so the ladder changes nothing about what we send by
 * default — it exists so the sender can step down when that file is over Telegram's limit,
 * and so the user can pick a different one afterwards.
 */
function videoItem(m: { url: string; height?: number; variants?: unknown; formats?: unknown }): MediaItem {
	const item: MediaItem = { type: 'video', url: m.url };
	const variants = parseTwimgVariants(m?.variants ?? m?.formats);
	if (variants.length) item.variants = variants;
	const height = Number(m?.height);
	if (height > 0) item.quality = `${height}p`;
	else if (variants.length) item.quality = variants[0].label;
	return item;
}

/**
 * Media attached to a single tweet, in original order.
 * `media.all` covers mixed posts (video + photos); the explicit arrays are legacy fallbacks.
 */
function collectTweetMedia(tweet: any): MediaItem[] {
	const media: MediaItem[] = [];

	for (const m of tweet.media?.all ?? []) {
		if (!isUrl(m.url)) continue;
		media.push(m.type === 'video' || m.type === 'gif' ? videoItem(m) : { type: 'photo', url: m.url });
	}
	if (media.length > 0) return media;

	for (const v of tweet.media?.videos ?? []) {
		if (isUrl(v.url)) media.push(videoItem(v));
	}
	if (media.length > 0) return media;

	for (const p of tweet.media?.photos ?? []) {
		if (isUrl(p.url)) media.push({ type: 'photo', url: p.url });
	}
	return media;
}

/** Video poster frame when the tweet has one, otherwise the author's avatar. */
function tweetThumbnail(tweet: any): string | undefined {
	const videoThumb = tweet.media?.videos?.[0]?.thumbnail_url;
	if (isUrl(videoThumb)) return videoThumb;
	const avatar = tweet.author?.avatar_url as string | undefined;
	return isUrl(avatar) ? avatar : undefined;
}

/**
 * Fetch a single tweet from FxTwitter. Returns the tweet object or null.
 */
async function fetchTweet(tweetId: string): Promise<any | null> {
	try {
		const res = await fetch(`https://api.fxtwitter.com/i/status/${tweetId}`, {
			headers: { 'User-Agent': 'DownloadMediaBot/1.0 (https://github.com/dawo5d/download-media)' },
			signal: AbortSignal.timeout(8_000),
		});
		if (!res.ok) return null;
		const data: any = await res.json();
		return data?.tweet ?? null;
	} catch {
		return null;
	}
}

/**
 * Walk backward from the given tweet to find the thread root,
 * then collect all tweets from root → given tweet (oldest first).
 * Stops at max 20 tweets to avoid runaway fetches.
 */
async function collectThread(startTweet: any): Promise<any[]> {
	const MAX = 20;
	const chain: any[] = [startTweet];

	// Walk backward to root
	let current = startTweet;
	while (chain.length < MAX && isThreadTweet(current)) {
		const parentId = current.replying_to_status;
		if (!parentId) break;
		const parent = await fetchTweet(parentId);
		if (!parent) break;
		// Stop if the parent is from a different author (safety check)
		if (parent.author?.screen_name?.toLowerCase() !== startTweet.author?.screen_name?.toLowerCase()) break;
		chain.unshift(parent); // prepend — oldest first
		current = parent;
	}

	return chain;
}

/**
 * Primary strategy — FxTwitter API.
 * Handles: media tweets, article tweets, thread tweets, text-only tweets.
 * Docs: docs/FxEmbed-API.md
 */
async function tryViaFxTwitter(url: string, accessToken: string, failures: FailureKind[]): Promise<DownloaderResult | null> {
	const id = extractTweetId(url);
	if (!id) return null;
	try {
		const res = await fetch(`https://api.fxtwitter.com/i/status/${id}`, {
			headers: { 'User-Agent': 'DownloadMediaBot/1.0 (https://github.com/dawo5d/download-media)' },
			signal: AbortSignal.timeout(10_000),
		});

		if (res.status === 401)
			return { status: 'error', error: 'This tweet is from a private account and cannot be downloaded.', failureKind: 'gone' };
		if (res.status === 404) return { status: 'error', error: 'This tweet no longer exists or has been deleted.', failureKind: 'gone' };
		if (!res.ok) {
			log('warn', 'downloader:Twitter', 'fxtwitter non-OK response', { status: res.status });
			return null;
		}

		const data: any = await res.json();
		const tweet = data?.tweet;
		if (!tweet) return null;

		// ── Article tweet ──
		if (tweet.article) {
			return await handleArticle(tweet, url, accessToken);
		}

		// ── Thread tweet ──
		// Case A: mid-thread tweet (author replying to themselves) — walk backward to root.
		// Case B: thread root shared directly — we can only send this tweet + a note,
		//          since FxTwitter has no forward traversal API.
		const isMidThread = isThreadTweet(tweet);
		if (isMidThread) {
			const threadTweets = await collectThread(tweet);
			if (threadTweets.length > 1) {
				const telegraphUrl = await publishThreadToTelegraph(threadTweets, accessToken);
				const avatar = tweet.author?.avatar_url as string | undefined;

				// Sent after the media, so the tweet's own video/photos arrive first.
				const noticeLines = [`🧵 Thread — ${threadTweets.length} tweets`];
				noticeLines.push(telegraphUrl ? `📖 <a href="${telegraphUrl}">Read full thread</a>` : `🔗 <a href="${tweet.url}">View on X</a>`);
				const followUp = noticeLines.join('\n');

				const caption = tweet.text ? `<b>${tweet.text}</b>` : '';
				const ownMedia = collectTweetMedia(tweet);

				// The tweet the user sent carries its own media — send that, not a cover image.
				if (ownMedia.length > 0) {
					return {
						status: 'success',
						media: ownMedia,
						caption,
						thumbnail: tweetThumbnail(tweet),
						followUp,
						fullText: threadToMarkdown(threadTweets),
					};
				}

				// Text-only tweet — cover with the first photo anywhere in the thread, else the avatar.
				let coverUrl: string | undefined;
				for (const t of threadTweets) {
					const photo = t.media?.photos?.[0]?.url;
					if (photo) {
						coverUrl = photo;
						break;
					}
				}

				return {
					status: 'success',
					media: (coverUrl ?? avatar) ? [{ type: 'photo', url: (coverUrl ?? avatar)! }] : [],
					caption,
					thumbnail: coverUrl ?? avatar,
					followUp,
					fullText: threadToMarkdown(threadTweets),
				};
			}
			// Single tweet in chain — fall through to normal handling
		}

		// ── Media tweet ──
		const caption = tweet.text ? `<b>${tweet.text}</b>` : '';
		const avatar = tweet.author?.avatar_url as string | undefined;

		const media = collectTweetMedia(tweet);
		if (media.length > 0) {
			return { status: 'success', media, caption, thumbnail: tweetThumbnail(tweet) };
		}

		// Text-only tweet
		if (caption) {
			return {
				status: 'success',
				media: avatar ? [{ type: 'photo', url: avatar }] : [],
				caption,
				thumbnail: avatar,
			};
		}
	} catch (e) {
		failures.push(classifyError(e));
		log('warn', 'downloader:Twitter', 'fxtwitter failed', { error: (e as Error).message });
	}
	return null;
}

// ─── btch fallbacks ───────────────────────────────────────────────────────────

async function tryViaAIO(url: string, failures: FailureKind[]): Promise<DownloaderResult | null> {
	try {
		const result = await tryAIO(url, 'auto', failures);
		if (!result?.media?.length) return null;
		const videos = result.media.filter((m) => m.type === 'video');
		return videos.length > 0 ? { ...result, media: [videos[0]] } : result;
	} catch (e) {
		failures.push(classifyError(e));
		log('warn', 'downloader:Twitter', 'btch AIO failed', { error: (e as Error).message });
	}
	return null;
}

async function tryViaBtch(url: string, failures: FailureKind[]): Promise<DownloaderResult | null> {
	try {
		const res = await btchFetch('twitter', url);
		const caption = buildCaption(res.title);
		const thumb = isUrl(res.thumbnail) ? res.thumbnail : undefined;
		const media: MediaItem[] = [];

		if (Array.isArray(res.url) && res.url.length > 0) {
			for (const item of res.url) {
				if (typeof item === 'object' && item !== null && Object.keys(item).length > 0) {
					const u = isUrl(item.hd) ? item.hd : isUrl(item.sd) ? item.sd : null;
					if (u) media.push({ type: detectMediaType(u), url: u });
				} else if (typeof item === 'string' && isUrl(item)) {
					media.push({ type: detectMediaType(item), url: item });
				}
			}
		}
		if (!media.length && isUrl(res.url)) media.push({ type: detectMediaType(res.url), url: res.url });
		if (!media.length && Array.isArray(res.images)) {
			res.images
				.filter((img: any) => isUrl(typeof img === 'string' ? img : img?.url))
				.forEach((img: any) => media.push({ type: 'photo', url: typeof img === 'string' ? img : img.url }));
		}
		if (!media.length && isUrl(res.image)) media.push({ type: 'photo', url: res.image });
		if (media.length) return { status: 'success', media: [media[0]], caption, thumbnail: thumb };
	} catch (e) {
		failures.push(classifyError(e));
		log('warn', 'downloader:Twitter', 'btch twitter endpoint failed', { error: (e as Error).message });
	}
	return null;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class TwitterProvider implements IDownloaderProvider {
	readonly platforms = ['twitter.com', 'x.com'];

	private accessToken: string;

	constructor(accessToken: string) {
		this.accessToken = accessToken;
	}

	/**
	 * Fallback chain:
	 *   1. FxTwitter API — handles articles (→ Telegraph), media, text-only tweets
	 *   2. btch AIO endpoint
	 *   3. btch twitter-specific endpoint
	 */
	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		// All three strategies swallow their errors to allow the next one to run, so the
		// reason for the overall failure only survives if they deposit it here.
		const failures: FailureKind[] = [];
		return (
			(await tryViaFxTwitter(url, this.accessToken, failures)) ??
			(await tryViaAIO(url, failures)) ??
			(await tryViaBtch(url, failures)) ?? {
				status: 'error',
				error: 'No Twitter media found',
				failureKind: mostPermanent(failures),
			}
		);
	}
}
