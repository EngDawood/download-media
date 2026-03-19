import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { buildCaption, isUrl } from '../media-helpers';

export class SpotifyProvider implements IDownloaderProvider {
	readonly platforms = ['spotify.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		try {
			const res = await btchFetch('spotify', url, true);
			const data = res.res_data;
			if (data?.formats?.length > 0) {
				const best = data.formats[0];
				if (isUrl(best.url)) {
					return {
						status: 'success',
						media: [{ type: 'audio', url: best.url, quality: best.quality }],
						caption: buildCaption(data.title),
						thumbnail: data.thumbnail,
					};
				}
			}
		} catch { /* fall through to AIO */ }
		const aioResult = await tryAIO(url, 'audio');
		if (aioResult?.media) return aioResult;
		return { status: 'error', error: 'No Spotify audio found' };
	}
}
