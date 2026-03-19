import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { buildCaption, isUrl } from '../media-helpers';

export class SoundCloudProvider implements IDownloaderProvider {
	readonly platforms = ['soundcloud.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		try {
			const res = await btchFetch('soundcloud', url, true);
			const audioUrl = isUrl(res.downloadMp3) ? res.downloadMp3 : isUrl(res.audio) ? res.audio : null;
			if (audioUrl) {
				return { status: 'success', media: [{ type: 'audio', url: audioUrl }], caption: buildCaption(res.title), thumbnail: res.thumbnail };
			}
		} catch { /* fall through to AIO */ }
		const aioResult = await tryAIO(url, 'audio');
		if (aioResult?.media) return aioResult;
		return { status: 'error', error: 'No SoundCloud audio found' };
	}
}
