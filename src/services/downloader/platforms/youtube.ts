import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { parseLinksSection } from '../aio-parser';
import { buildCaption, isUrl } from '../media-helpers';

export class YouTubeProvider implements IDownloaderProvider {
	readonly platforms = ['youtube.com', 'youtu.be', 'music.youtube.com'];

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		try {
			const res = await btchFetch('youtube', url, true);
			const caption = buildCaption(res.title);
			const thumbnail = res.thumbnail;
			if (mode === 'audio' && isUrl(res.mp3)) return { status: 'success', media: [{ type: 'audio', url: res.mp3 }], caption, thumbnail };
			if (isUrl(res.mp4)) {
				return { status: 'success', media: [{ type: 'video', url: res.mp4 }], caption, thumbnail, mp3Url: isUrl(res.mp3) ? res.mp3 : undefined };
			}
		} catch { /* fall through to AIO */ }

		try {
			const aio = await btchFetch('aio', url, true);
			const data = aio.data;
			if (data?.links) {
				const caption = buildCaption(data.title);
				const thumbnail = data.thumbnail;
				if (mode === 'audio') {
					const audioItems = parseLinksSection(data.links.audio, 'audio');
					if (audioItems.length) return { status: 'success', media: [audioItems[0]], caption, thumbnail };
				}
				const videos: MediaItem[] = parseLinksSection(data.links.video, 'video');
				if (videos.length) {
					if (mode !== 'auto' && mode !== 'audio') {
						const match = videos.find(v => v.quality?.includes(mode));
						if (match) return { status: 'success', media: [match], caption, thumbnail };
					}
					return { status: 'success', media: [videos[0]], caption, thumbnail };
				}
			}
		} catch { /* all failed */ }

		return { status: 'error', error: 'No YouTube media found' };
	}
}
