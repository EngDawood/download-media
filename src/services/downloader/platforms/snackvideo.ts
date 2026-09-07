import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { classifyError, mostPermanent, type FailureKind } from '../failure';
import { buildCaption, isUrl } from '../media-helpers';

/** SnackVideo — btch's dedicated endpoint resolves the share link to a direct video URL. */
export class SnackVideoProvider implements IDownloaderProvider {
	readonly platforms = ['snackvideo.com'];

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
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
