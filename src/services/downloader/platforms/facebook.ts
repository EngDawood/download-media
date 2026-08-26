import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { classifyError, mostPermanent, type FailureKind } from '../failure';
import { buildCaption, isUrl, formatFileSize } from '../media-helpers';

// share/v/ and share/r/ links need server-side resolution to the underlying post
// before extraction, which routinely exceeds the 8s default. Every recent Facebook
// timeout in D1 was one of these — 15s is enough for the resolve step to land.
const FACEBOOK_SHARE_TIMEOUT_MS = 15_000;

function timeoutFor(url: string): number | undefined {
	return /facebook\.com\/share\//i.test(url) ? FACEBOOK_SHARE_TIMEOUT_MS : undefined;
}

export class FacebookProvider implements IDownloaderProvider {
	readonly platforms = ['facebook.com', 'fb.watch'];

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		const failures: FailureKind[] = [];
		const timeout = timeoutFor(url);
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
			const res = await btchFetch('fbdown', url, timeout);
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

	async fetchInfo(url: string): Promise<{ hdLabel: string; sdLabel: string } | null> {
		try {
			const res = await btchFetch('aio', url, timeoutFor(url));
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
