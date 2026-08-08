import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { classifyError, mostPermanent, type FailureKind } from '../failure';
import { buildCaption, isUrl } from '../media-helpers';

export class SoundCloudProvider implements IDownloaderProvider {
	readonly platforms = ['soundcloud.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const failures: FailureKind[] = [];
		try {
			const res = await btchFetch('soundcloud', url);
			const audioUrl = isUrl(res.downloadMp3) ? res.downloadMp3 : isUrl(res.audio) ? res.audio : null;
			if (audioUrl) {
				return {
					status: 'success',
					media: [{ type: 'audio', url: audioUrl }],
					caption: buildCaption(res.title),
					title: res.title,
					thumbnail: res.thumbnail,
				};
			}
		} catch (e) {
			failures.push(classifyError(e)); /* fall through to AIO */
		}
		const aioResult = await tryAIO(url, 'audio', failures);
		if (aioResult?.media) return aioResult;
		return { status: 'error', error: 'No SoundCloud audio found', failureKind: mostPermanent(failures) };
	}
}
