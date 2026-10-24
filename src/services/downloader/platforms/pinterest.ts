import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { log } from '../../../utils/logger';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { buildCaption, isUrl } from '../media-helpers';

// Pinterest serves the full pin page (with og tags and media URLs) to a normal desktop UA.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

const VIDEO_URL_RE = /https:\/\/v1\.pinimg\.com\/videos\/[^"'\\\s<>]+\.mp4/g;
const HLS_URL_RE = /v1\.pinimg\.com\/videos\/[^"'\\\s<>]+\.m3u8/;

function metaContent(html: string, property: string): string | undefined {
	return html.match(new RegExp(`<meta[^>]*content="([^"]+)"[^>]*property="${property}"`))?.[1];
}

/**
 * The og:image is a resized .jpg (`/736x/aa/bb/cc/<hash>.jpg`). The page also holds the full-size
 * `/originals/` URL for the same hash, with the file's real extension, so look that up by hash.
 */
function originalImage(html: string, thumbnail: string | undefined): string | undefined {
	const key = thumbnail?.match(/pinimg\.com\/\d+x\/([\w/]+)\.\w+$/)?.[1];
	if (!key) return thumbnail;
	return html.match(new RegExp(`https://i\\.pinimg\\.com/originals/${key}\\.\\w+`))?.[0] ?? thumbnail;
}

const PAGE_ATTEMPTS = 3;

/**
 * Fetch a pin page as text with slashes unescaped (the page JSON writes them as `\/` or
 * `\u002F`), so one regex matches both forms. Null for a dead pin: Pinterest redirects those
 * to its homepage (`?show_error=true`) instead of a /pin/ page.
 */
async function fetchPinHtml(url: string): Promise<string | null> {
	const res = await fetch(url, {
		headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' },
		redirect: 'follow',
		signal: AbortSignal.timeout(10_000),
	});
	if (!res.ok || !/\/pin\/\d+/.test(res.url)) return null;
	return (await res.text()).replace(/\\u002F|\\\//g, '/');
}

/**
 * Primary path: fetch the pin page and read the media out of it. Videos come from the raw
 * v1.pinimg.com mp4 URLs (720p preferred), photos from the `originals` URL of the og:image.
 * Returns null on any miss so the caller falls back.
 *
 * Pinterest sometimes serves a video pin's page without its mp4 (only the HLS .m3u8 is there),
 * which would otherwise pass for a photo pin. Such a page is refetched, and if the mp4 never
 * shows up the pin is left to the fallbacks rather than sent as its thumbnail.
 */
async function tryDirect(url: string): Promise<DownloaderResult | null> {
	try {
		for (let attempt = 0; attempt < PAGE_ATTEMPTS; attempt++) {
			const html = await fetchPinHtml(url);
			if (!html) return null;

			const thumbnail = metaContent(html, 'og:image');
			const caption = buildCaption(metaContent(html, 'og:title')?.split(' | ')[0]);

			const videos = [...new Set(html.match(VIDEO_URL_RE) ?? [])];
			if (videos.length > 0) {
				const best = videos.find((v) => v.includes('720')) ?? videos[0];
				return { status: 'success', media: [{ type: 'video', url: best }], caption, thumbnail };
			}
			if (HLS_URL_RE.test(html)) continue;

			const imageUrl = originalImage(html, thumbnail);
			if (!imageUrl) return null;
			const media: MediaItem[] = [{ type: 'photo', url: imageUrl }];
			return { status: 'success', media, caption, thumbnail };
		}
	} catch (e) {
		log('warn', 'downloader:Pinterest', 'direct fetch failed', { error: (e as Error).message });
	}
	return null;
}

export class PinterestProvider implements IDownloaderProvider {
	readonly platforms = ['pinterest.com', 'pin.it'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const direct = await tryDirect(url);
		if (direct) return direct;

		try {
			const aioResult = await tryAIO(url);
			if (aioResult?.media) {
				const videos = aioResult.media.filter((m) => m.type === 'video');
				if (videos.length > 1) return { ...aioResult, media: [videos[0]] };
				return aioResult;
			}
		} catch {
			/* fall through */
		}

		const res = await btchFetch('pinterest', url);
		if (res.result) {
			const item = Array.isArray(res.result) ? res.result[0] : res.result;
			const isVideo = item?.is_video && isUrl(item?.video_url);
			const imageUrl = item?.images?.orig?.url || item?.image;
			const mediaUrl = isVideo ? item.video_url : isUrl(imageUrl) ? imageUrl : null;
			if (mediaUrl) {
				return {
					status: 'success',
					media: [{ type: isVideo ? 'video' : 'photo', url: mediaUrl }],
					caption: buildCaption(item.title || item.description || ''),
					thumbnail: item?.images?.['236x']?.url,
				};
			}
		}
		return { status: 'error', error: 'No Pinterest media found', failureKind: 'gone' };
	}
}
