import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { parseAioGallery, parseLinksSection } from '../aio-parser';
import { buildCaption, isUrl, detectMediaType } from '../media-helpers';

export class InstagramProvider implements IDownloaderProvider {
	readonly platforms = ['instagram.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		try {
			const res = await btchFetch('aio', url, true);
			const data = res.data;
			if (data) {
				const media: MediaItem[] = [];
				if (data.gallery?.items?.length > 0) media.push(...parseAioGallery(data.gallery.items));
				if (media.length === 0 && data.links) media.push(...parseLinksSection(data.links.video, 'video'));
				if (media.length > 0) {
					return { status: 'success', media, caption: buildCaption(data.title), thumbnail: data.thumbnail };
				}
			}
		} catch { /* fall through to igdl */ }

		const res = await btchFetch('igdl', url, true);
		const items = Array.isArray(res) ? res : Array.isArray(res.result) ? res.result : null;
		if (items?.length > 0 && isUrl(items[0]?.url)) {
			return {
				status: 'success',
				media: items.filter((i: any) => isUrl(i.url)).map((i: any) => ({ type: detectMediaType(i.url), url: i.url })),
				caption: '',
				thumbnail: items[0]?.thumbnail,
			};
		}
		return { status: 'error', error: 'No Instagram media found' };
	}
}
