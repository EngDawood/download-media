import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { classifyError, mostPermanent, type FailureKind } from '../failure';
import { buildCaption, isUrl, formatFileSize } from '../media-helpers';

// Facebook is the slowest extractor in the fleet. Racing all four backends against a
// reel, time-to-first-usable-response measured 4s / 13s / 17s across runs — the previous
// 15s cap (and the 12s default) cut off runs that would have succeeded, which is what
// surfaced as "service temporarily unavailable" on links that are perfectly downloadable.
const FACEBOOK_TIMEOUT_MS = 25_000;

// Tracking params Facebook appends to the redirect target; they are not part of the post.
const SHARE_TRACKING_PARAMS = ['rdid', 'share_url'];

/**
 * facebook.com/share/{r,v}/{id} 302s to the real post (e.g. /reel/{id}/). btch returns
 * nothing for the share form but extracts the resolved URL fine, so resolve it first.
 * Uses redirect: 'manual' — Facebook answers 400 when a browser User-Agent actually
 * follows the hop, and the Location header is all that is needed.
 * Returns the original URL if resolution fails so the pipeline can still try tryAIO.
 */
async function resolveShareUrl(url: string): Promise<string> {
	if (!/facebook\.com\/share\//i.test(url)) return url;
	try {
		const res = await fetch(url, {
			method: 'HEAD',
			redirect: 'manual',
			signal: AbortSignal.timeout(5_000),
			headers: { 'User-Agent': 'Mozilla/5.0' },
		});
		const location = res.headers.get('location');
		if (!location) return url;
		const resolved = new URL(location, url);
		const host = resolved.hostname.replace(/^(?:www|m|web)\./i, '');
		// A dead or logged-out share link redirects to login/checkpoint, not to a post.
		if (host.toLowerCase() !== 'facebook.com' || /^\/(?:login|checkpoint)/i.test(resolved.pathname)) return url;
		for (const param of SHARE_TRACKING_PARAMS) resolved.searchParams.delete(param);
		return resolved.toString();
	} catch {
		/* fall through — use original URL */
	}
	return url;
}

export class FacebookProvider implements IDownloaderProvider {
	readonly platforms = ['facebook.com', 'fb.watch'];

	async download(inputUrl: string, mode: DownloaderMode): Promise<DownloaderResult> {
		const failures: FailureKind[] = [];
		const timeout = FACEBOOK_TIMEOUT_MS;
		const url = await resolveShareUrl(inputUrl);
		try {
			const aioResult = await tryAIO(url, 'auto', failures, timeout);
			if (aioResult?.media?.length) {
				const videos = aioResult.media.filter((m) => m.type === 'video');
				if (videos.length > 1) {
					const selected = mode === 'sd' ? videos[videos.length - 1] : videos[0];
					return { ...aioResult, media: [selected] };
				}
				return aioResult;
			}
		} catch (e) {
			failures.push(classifyError(e));
		}

		try {
			// Reject backends that answer 200 with both fields null so the race falls
			// through to one that actually extracted the video.
			const res = await btchFetch('fbdown', url, timeout, (d) => isUrl(d.HD) || isUrl(d.Normal_video));
			const videoUrl = isUrl(res.HD) ? res.HD : isUrl(res.Normal_video) ? res.Normal_video : null;
			if (videoUrl) {
				return { status: 'success', media: [{ type: 'video', url: videoUrl }], caption: buildCaption(res.title) };
			}
		} catch (e) {
			failures.push(classifyError(e));
		}
		const kind = mostPermanent(failures);
		const message =
			kind === 'timeout' || kind === 'rate_limited'
				? 'Download service temporarily unavailable. Please try again or use the Retry button.'
				: 'No Facebook media found';
		return { status: 'error', error: message, failureKind: kind };
	}

	async fetchInfo(inputUrl: string): Promise<{ hdLabel: string; sdLabel: string } | null> {
		try {
			const url = await resolveShareUrl(inputUrl);
			const res = await btchFetch('aio', url, FACEBOOK_TIMEOUT_MS);
			const data = res.data;
			if (!data?.links?.video) return null;
			const entries: any[] = Array.isArray(data.links.video) ? data.links.video : Object.values(data.links.video);
			if (entries.length < 2) return null;
			const buildLabel = (e: any, def: string) => {
				const q = e?.resolution || e?.q_text || def;
				const s = typeof e?.size === 'number' && e.size > 0 ? ` (${formatFileSize(e.size)})` : '';
				return `${q}${s}`;
			};
			return { hdLabel: buildLabel(entries[0], 'HD'), sdLabel: buildLabel(entries[entries.length - 1], 'SD') };
		} catch {
			return null;
		}
	}
}
