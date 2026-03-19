import { log } from '../../../utils/logger';
import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { buildCaption, isUrl, detectMediaType } from '../media-helpers';
import { publishArticleToTelegraph } from '../telegraph-publisher';

// ─── FxTwitter (primary) ─────────────────────────────────────────────────────

function extractTweetId(url: string): string | null {
	const match = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i);
	return match ? match[1] : null;
}

/**
 * Handle tweet.article — publishes to Telegraph and returns cover image + link.
 */
async function handleArticle(
	tweet: any,
	tweetUrl: string,
	accessToken: string,
): Promise<DownloaderResult | null> {
	const article = tweet.article;
	if (!article) return null;

	const title = article.title?.trim() || 'Twitter Article';
	const preview = article.preview_text?.trim() || '';
	const coverUrl: string | undefined = article.cover_media?.media_info?.original_img_url;
	const avatar: string | undefined = tweet.author?.avatar_url;

	// Publish to Telegraph
	const telegraphUrl = await publishArticleToTelegraph(
		{ ...article, media_entities: tweet.media_entities },
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
		media: coverUrl ? [{ type: 'photo', url: coverUrl }] : (avatar ? [{ type: 'photo', url: avatar }] : []),
		caption,
		thumbnail,
	};
}

/**
 * Primary strategy — FxTwitter API.
 * Handles: media tweets, article tweets, text-only tweets.
 * Docs: docs/FxEmbed-API.md
 */
async function tryViaFxTwitter(url: string, accessToken: string): Promise<DownloaderResult | null> {
	const id = extractTweetId(url);
	if (!id) return null;
	try {
		const res = await fetch(`https://api.fxtwitter.com/i/status/${id}`, {
			headers: { 'User-Agent': 'DownloadMediaBot/1.0 (https://github.com/dawo5d/download-media)' },
			signal: AbortSignal.timeout(10_000),
		});

		if (res.status === 401) return { status: 'error', error: 'This tweet is from a private account and cannot be downloaded.' };
		if (res.status === 404) return { status: 'error', error: 'This tweet no longer exists or has been deleted.' };
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

		// ── Media tweet ──
		const caption = tweet.text ? `<b>${tweet.text}</b>` : '';
		const avatar = tweet.author?.avatar_url as string | undefined;
		const media: MediaItem[] = [];

		// Prefer media.all — preserves original order, handles mixed posts (video + photos in same tweet)
		if (Array.isArray(tweet.media?.all) && tweet.media.all.length > 0) {
			for (const m of tweet.media.all) {
				if (isUrl(m.url)) {
					media.push({ type: (m.type === 'video' || m.type === 'gif') ? 'video' : 'photo', url: m.url });
				}
			}
			if (media.length > 0) {
				const firstVideo = tweet.media.videos?.[0];
				const thumb = isUrl(firstVideo?.thumbnail_url) ? firstVideo.thumbnail_url : avatar;
				return { status: 'success', media, caption, thumbnail: thumb };
			}
		}

		// Fallback: explicit videos array
		if (Array.isArray(tweet.media?.videos) && tweet.media.videos.length > 0) {
			for (const v of tweet.media.videos) {
				if (isUrl(v.url)) media.push({ type: 'video', url: v.url });
			}
			if (media.length > 0) {
				const thumb = tweet.media.videos[0]?.thumbnail_url;
				return { status: 'success', media, caption, thumbnail: isUrl(thumb) ? thumb : avatar };
			}
		}

		// Fallback: explicit photos array
		if (Array.isArray(tweet.media?.photos) && tweet.media.photos.length > 0) {
			for (const p of tweet.media.photos) {
				if (isUrl(p.url)) media.push({ type: 'photo', url: p.url });
			}
			if (media.length > 0) {
				return { status: 'success', media, caption, thumbnail: avatar };
			}
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
		log('warn', 'downloader:Twitter', 'fxtwitter failed', { error: (e as Error).message });
	}
	return null;
}

// ─── btch fallbacks ───────────────────────────────────────────────────────────

async function tryViaAIO(url: string): Promise<DownloaderResult | null> {
	try {
		const result = await tryAIO(url);
		if (!result?.media?.length) return null;
		const videos = result.media.filter(m => m.type === 'video');
		return videos.length > 0 ? { ...result, media: [videos[0]] } : result;
	} catch (e) {
		log('warn', 'downloader:Twitter', 'btch AIO failed', { error: (e as Error).message });
	}
	return null;
}

async function tryViaBtch(url: string): Promise<DownloaderResult | null> {
	try {
		const res = await btchFetch('twitter', url, true);
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
		return (
			await tryViaFxTwitter(url, this.accessToken) ??
			await tryViaAIO(url) ??
			await tryViaBtch(url) ??
			{ status: 'error', error: 'No Twitter media found' }
		);
	}
}
