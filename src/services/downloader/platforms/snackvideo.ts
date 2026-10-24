import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { log } from '../../../utils/logger';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { classifyError, mostPermanent, type FailureKind } from '../failure';
import { BROWSER_UA, buildCaption, isUrl, metaContent } from '../media-helpers';

/** The page's own video: its VideoObject `contentUrl`, else the first player. The page also lists other videos' mp4s. */
const CONTENT_URL_RE = /contentUrl:"(https:\/\/[^"]+\.mp4[^"]*)"/;
const PLAYER_URL_RE = /id="video-0"[^>]*src="(https:\/\/[^"]+\.mp4[^"]*)"/;

/** Share links redirect to the full page, whose markup embeds the mp4 on the kwai CDN — no cookies needed. */
async function tryDirect(url: string): Promise<DownloaderResult | null> {
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' },
			redirect: 'follow',
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return null;

		// The page JSON escapes slashes as /; undo that so one regex matches both forms.
		const html = (await res.text()).replace(/\\u002F/g, '/').replace(/&amp;/g, '&');
		const video = html.match(CONTENT_URL_RE)?.[1] ?? html.match(PLAYER_URL_RE)?.[1];
		if (!video) return null;
		const cover = metaContent(html, 'og:image');
		return {
			status: 'success',
			media: [{ type: 'video', url: video }],
			caption: buildCaption(metaContent(html, 'og:title')),
			thumbnail: isUrl(cover) ? cover : undefined,
		};
	} catch (e) {
		log('warn', 'downloader:SnackVideo', 'direct fetch failed', { error: (e as Error).message });
		return null;
	}
}

/** SnackVideo — read from the share page, then btch's dedicated endpoint, then AIO. */
export class SnackVideoProvider implements IDownloaderProvider {
	readonly platforms = ['snackvideo.com'];

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		const direct = await tryDirect(url);
		if (direct) return direct;

		const failures: FailureKind[] = [];
		try {
			const res = await btchFetch('snackvideo', url);
			const videoUrl = isUrl(res.videoUrl) ? res.videoUrl : isUrl(res.url) ? res.url : null;
			if (videoUrl) {
				return {
					status: 'success',
					media: [{ type: 'video', url: videoUrl }],
					caption: buildCaption(res.title || res.description),
					thumbnail: isUrl(res.thumbnail) ? res.thumbnail : undefined,
				};
			}
		} catch (e) {
			failures.push(classifyError(e));
		}

		const aio = await tryAIO(url, mode, failures);
		if (aio) return aio;
		return { status: 'error', error: 'No SnackVideo media found', failureKind: mostPermanent(failures) };
	}
}
