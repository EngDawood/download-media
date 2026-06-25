import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch, isTimeoutError } from '../btch-client';
import { parseLinksSection } from '../aio-parser';
import { buildCaption, isUrl } from '../media-helpers';

/** YouTube extraction is the slowest btch operation; give it more headroom than the 8s default. */
const YOUTUBE_TIMEOUT_MS = 20_000;

export class YouTubeProvider implements IDownloaderProvider {
	readonly platforms = ['youtube.com', 'youtu.be', 'music.youtube.com'];

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		let timedOut = false;
		try {
			const res = await btchFetch('youtube', url, true, YOUTUBE_TIMEOUT_MS);
			const caption = buildCaption(res.title);
			const thumbnail = res.thumbnail;
			if (mode === 'audio' && isUrl(res.mp3)) return { status: 'success', media: [{ type: 'audio', url: res.mp3 }], caption, thumbnail };
			if (isUrl(res.mp4)) {
				return { status: 'success', media: [{ type: 'video', url: res.mp4 }], caption, thumbnail, mp3Url: isUrl(res.mp3) ? res.mp3 : undefined };
			}
		} catch (e) { if (isTimeoutError(e)) timedOut = true; /* fall through to AIO */ }

		try {
			const aio = await btchFetch('aio', url, true, YOUTUBE_TIMEOUT_MS);
			const data = aio.data;
			if (data?.links) {
				const caption = buildCaption(data.title);
				const thumbnail = data.thumbnail;
				const audioItems = parseLinksSection(data.links.audio, 'audio');
				const mp3Url = audioItems[0]?.url;
				if (mode === 'audio') {
					if (audioItems.length) return { status: 'success', media: [audioItems[0]], caption, thumbnail };
				}
				const videos: MediaItem[] = parseLinksSection(data.links.video, 'video');
				if (videos.length) {
					if (mode !== 'auto' && mode !== 'audio') {
						const match = videos.find(v => v.quality?.includes(mode));
						if (match) return { status: 'success', media: [match], caption, thumbnail, mp3Url };
					}
					return { status: 'success', media: [videos[0]], caption, thumbnail, mp3Url };
				}
			}
			// btch AIO for YouTube sometimes returns { mp4, mp3, title } at the top level
			const flatCaption = buildCaption(aio.title || data?.title);
			const flatThumb = aio.thumbnail || data?.thumbnail;
			if (isUrl(aio.mp4)) {
				return { status: 'success', media: [{ type: 'video', url: aio.mp4 }], caption: flatCaption, thumbnail: flatThumb, mp3Url: isUrl(aio.mp3) ? aio.mp3 : undefined };
			}
			if (isUrl(aio.mp3)) {
				return { status: 'success', media: [{ type: 'audio', url: aio.mp3 }], caption: flatCaption, thumbnail: flatThumb };
			}
		} catch (e) { if (isTimeoutError(e)) timedOut = true; /* all failed */ }

		if (timedOut) {
			return { status: 'error', error: 'YouTube is still processing this video', retryable: true };
		}
		return { status: 'error', error: 'No YouTube media found' };
	}
}
