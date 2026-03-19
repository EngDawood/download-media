import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { buildCaption, isUrl, detectMediaType, decodeTiktokDirectUrl } from '../media-helpers';

export class TikTokProvider implements IDownloaderProvider {
	readonly platforms = ['tiktok.com'];

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		try {
			const res = await btchFetch('tiktok', url, true);
			const data = res.data;
			if (data) {
				const caption = buildCaption(data.title);
				const thumbnail = data.cover || data.origin_cover;
				if (Array.isArray(data.images) && data.images.length > 0) {
					const photos: MediaItem[] = data.images
						.filter((img: any) => isUrl(typeof img === 'string' ? img : img?.url))
						.map((img: any) => ({ type: 'photo' as const, url: typeof img === 'string' ? img : img.url }));
					if (photos.length) return { status: 'success', media: photos, caption, thumbnail };
				}
				if (mode === 'audio' && isUrl(data.music)) return { status: 'success', media: [{ type: 'audio', url: data.music }], caption, thumbnail };
				if (isUrl(data.play)) {
					return { status: 'success', media: [{ type: 'video', url: data.play }], caption, thumbnail, mp3Url: isUrl(data.music) ? data.music : undefined };
				}
			}
		} catch { /* fall through to ttdl */ }

		const res = await btchFetch('ttdl', url, true);
		const caption = buildCaption(res.title);
		const thumb = isUrl(res.cover) ? res.cover : isUrl(res.thumbnail) ? res.thumbnail : undefined;
		const audio = Array.isArray(res.audio) && isUrl(res.audio[0]) ? decodeTiktokDirectUrl(res.audio[0]) || res.audio[0] : undefined;
		if (mode === 'audio' && audio) return { status: 'success', media: [{ type: 'audio', url: audio }], caption, thumbnail: thumb };
		if (Array.isArray(res.video) && isUrl(res.video[0])) {
			const video = decodeTiktokDirectUrl(res.video[0]) || res.video[0];
			return { status: 'success', media: [{ type: 'video', url: video }], caption, thumbnail: thumb, mp3Url: audio };
		}
		return { status: 'error', error: 'No TikTok media found' };
	}

	async fetchInfo(url: string): Promise<{ caption: string; isImagePost: boolean; audioAvailable: boolean } | null> {
		try {
			const res = await btchFetch('tiktok', url);
			const data = res.data;
			if (data) {
				return {
					caption: buildCaption(data.title),
					isImagePost: Array.isArray(data.images) && data.images.length > 0,
					audioAvailable: isUrl(data.music),
				};
			}
		} catch { return null; }
		return null;
	}
}
