import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { classifyError, mostPermanent, type FailureKind } from '../failure';
import { buildCaption, isUrl } from '../media-helpers';

/** CapCut template shares — btch resolves the signed CDN video URL and cover art. */
export class CapCutProvider implements IDownloaderProvider {
	readonly platforms = ['capcut.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const failures: FailureKind[] = [];
		try {
			const res = await btchFetch('capcut', url);
			if (isUrl(res.originalVideoUrl)) {
				return {
					status: 'success',
					media: [{ type: 'video', url: res.originalVideoUrl }],
					caption: buildCaption(res.title),
					thumbnail: isUrl(res.coverUrl) ? res.coverUrl : undefined,
				};
			}
		} catch (e) {
			failures.push(classifyError(e));
		}
		return { status: 'error', error: 'No CapCut video found', failureKind: mostPermanent(failures) };
	}
}
