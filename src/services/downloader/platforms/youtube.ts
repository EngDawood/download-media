import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch, isTimeoutError } from '../btch-client';
import { parseLinksSection } from '../aio-parser';
import { buildCaption, isUrl } from '../media-helpers';

/** YouTube extraction is the slowest btch operation; give it more headroom than the 8s default. */
const YOUTUBE_TIMEOUT_MS = 20_000;

/** Telegram caps bot uploads at 50MB; stay under it so multipart overhead cannot tip us over. */
const MAX_SENDABLE_BYTES = 45 * 1024 * 1024;

/**
 * Pick the best variant Telegram will actually accept.
 * btch lists variants best-first, but the best is routinely far over the upload
 * limit when a lower one would sail through — so prefer the largest variant that
 * still fits. Variants with no reported size keep the old best-first behaviour;
 * if every known size is over the limit we take the smallest, which at least has
 * a chance of being sent.
 */
function pickSendableVideo(videos: MediaItem[]): MediaItem {
	const sized = videos.filter((v): v is MediaItem & { filesize: number } => typeof v.filesize === 'number' && v.filesize > 0);
	if (!sized.length) return videos[0];
	const fitting = sized.filter((v) => v.filesize <= MAX_SENDABLE_BYTES);
	if (fitting.length) return fitting.reduce((best, v) => (v.filesize > best.filesize ? v : best));
	return sized.reduce((smallest, v) => (v.filesize < smallest.filesize ? v : smallest));
}

export class YouTubeProvider implements IDownloaderProvider {
	readonly platforms = ['youtube.com', 'youtu.be', 'music.youtube.com'];

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		let timedOut = false;
		try {
			const res = await btchFetch('youtube', url, true, YOUTUBE_TIMEOUT_MS);
			const caption = buildCaption(res.title);
			const thumbnail = res.thumbnail;
			if (mode === 'audio' && isUrl(res.mp3))
				return { status: 'success', media: [{ type: 'audio', url: res.mp3 }], caption, title: res.title, thumbnail };
			if (isUrl(res.mp4)) {
				return {
					status: 'success',
					media: [{ type: 'video', url: res.mp4 }],
					caption,
					title: res.title,
					thumbnail,
					mp3Url: isUrl(res.mp3) ? res.mp3 : undefined,
				};
			}
		} catch (e) {
			if (isTimeoutError(e)) timedOut = true; /* fall through to AIO */
		}

		try {
			const aio = await btchFetch('aio', url, true, YOUTUBE_TIMEOUT_MS);
			const data = aio.data;
			if (data?.links) {
				const caption = buildCaption(data.title);
				const thumbnail = data.thumbnail;
				const audioItems = parseLinksSection(data.links.audio, 'audio');
				const mp3Url = audioItems[0]?.url;
				if (mode === 'audio') {
					if (audioItems.length) return { status: 'success', media: [audioItems[0]], caption, title: data.title, thumbnail };
				}
				const videos: MediaItem[] = parseLinksSection(data.links.video, 'video');
				if (videos.length) {
					if (mode !== 'auto' && mode !== 'audio') {
						const match = videos.find((v) => v.quality?.includes(mode));
						if (match) return { status: 'success', media: [match], caption, title: data.title, thumbnail, mp3Url };
					}
					return { status: 'success', media: [pickSendableVideo(videos)], caption, title: data.title, thumbnail, mp3Url };
				}
			}
			// btch AIO for YouTube sometimes returns { mp4, mp3, title } at the top level
			const flatTitle = aio.title || data?.title;
			const flatCaption = buildCaption(flatTitle);
			const flatThumb = aio.thumbnail || data?.thumbnail;
			if (isUrl(aio.mp4)) {
				return {
					status: 'success',
					media: [{ type: 'video', url: aio.mp4 }],
					caption: flatCaption,
					title: flatTitle,
					thumbnail: flatThumb,
					mp3Url: isUrl(aio.mp3) ? aio.mp3 : undefined,
				};
			}
			if (isUrl(aio.mp3)) {
				return {
					status: 'success',
					media: [{ type: 'audio', url: aio.mp3 }],
					caption: flatCaption,
					title: flatTitle,
					thumbnail: flatThumb,
				};
			}
		} catch (e) {
			if (isTimeoutError(e)) timedOut = true; /* all failed */
		}

		if (timedOut) {
			return { status: 'error', error: 'YouTube is still processing this video', retryable: true };
		}
		return { status: 'error', error: 'No YouTube media found' };
	}
}
