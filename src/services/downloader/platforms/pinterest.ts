import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { buildCaption, isUrl, detectMediaType } from '../media-helpers';

export class PinterestProvider implements IDownloaderProvider {
	readonly platforms = ['pinterest.com', 'pin.it'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		try {
			const aioResult = await tryAIO(url);
			if (aioResult?.media) {
				const videos = aioResult.media.filter(m => m.type === 'video');
				if (videos.length > 1) return { ...aioResult, media: [videos[0]] };
				return aioResult;
			}
		} catch { /* fall through */ }

		const res = await btchFetch('pinterest', url, true);
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
		return { status: 'error', error: 'No Pinterest media found' };
	}
}
