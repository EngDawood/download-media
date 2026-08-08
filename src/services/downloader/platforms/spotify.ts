import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { classifyError, mostPermanent, type FailureKind } from '../failure';
import { buildCaption, isUrl } from '../media-helpers';

export class SpotifyProvider implements IDownloaderProvider {
	readonly platforms = ['spotify.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const failures: FailureKind[] = [];
		try {
			const res = await btchFetch('spotify', url);
			const data = res.res_data;
			if (data?.formats?.length > 0) {
				const best = data.formats[0];
				if (isUrl(best.url)) {
					return {
						status: 'success',
						media: [{ type: 'audio', url: best.url, quality: best.quality }],
						caption: buildCaption(data.title),
						title: data.title,
						thumbnail: data.thumbnail,
					};
				}
			}
		} catch (e) {
			failures.push(classifyError(e)); /* fall through to AIO */
		}
		const aioResult = await tryAIO(url, 'audio', failures);
		if (aioResult?.media) return aioResult;
		return { status: 'error', error: 'No Spotify audio found', failureKind: mostPermanent(failures) };
	}
}
