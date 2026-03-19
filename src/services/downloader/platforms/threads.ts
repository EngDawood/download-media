import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { buildCaption, isUrl } from '../media-helpers';

export class ThreadsProvider implements IDownloaderProvider {
	readonly platforms = ['threads.net', 'threads.com'];

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		try {
			const aioResult = await tryAIO(url, mode);
			if (aioResult?.media) {
				const videos = aioResult.media.filter(m => m.type === 'video');
				if (videos.length > 1) return { ...aioResult, media: [videos[0]] };
				return aioResult;
			}
		} catch { /* fall through */ }

		const res = await btchFetch('threads', url, true);
		const hasVideo = res.type === 'video' && isUrl(res.video);
		const hasImage = (res.type === 'image' || res.type === 'mixed') && isUrl(res.image);
		const cap = buildCaption(res.title);

		if (mode === 'audio' && hasVideo) return { status: 'success', media: [{ type: 'audio', url: res.video }], caption: cap };

		if (res.type === 'mixed') {
			const media: MediaItem[] = [];
			if (isUrl(res.video)) media.push({ type: 'video', url: res.video });
			if (isUrl(res.image)) media.push({ type: 'photo', url: res.image });
			if (media.length) return { status: 'success', media, caption: cap };
		}
		if (hasVideo) return { status: 'success', media: [{ type: 'video', url: res.video }], caption: cap };
		if (hasImage) return { status: 'success', media: [{ type: 'photo', url: res.image }], caption: cap };
		if (isUrl(res.download)) return { status: 'success', media: [{ type: 'video', url: res.download }], caption: cap };
		return { status: 'error', error: 'No Threads media found' };
	}
}
