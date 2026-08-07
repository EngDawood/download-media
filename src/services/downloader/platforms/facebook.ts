import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { buildCaption, isUrl, formatFileSize } from '../media-helpers';

export class FacebookProvider implements IDownloaderProvider {
	readonly platforms = ['facebook.com', 'fb.watch'];

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		try {
			const aioResult = await tryAIO(url);
			if (aioResult?.media?.length) {
				const videos = aioResult.media.filter(m => m.type === 'video');
				if (videos.length > 1) {
					const selected = mode === 'sd' ? videos[videos.length - 1] : videos[0];
					return { ...aioResult, media: [selected] };
				}
				return aioResult;
			}
		} catch { /* fall through */ }

		const res = await btchFetch('fbdown', url, true);
		const videoUrl = isUrl(res.HD) ? res.HD : isUrl(res.Normal_video) ? res.Normal_video : null;
		if (videoUrl) {
			return { status: 'success', media: [{ type: 'video', url: videoUrl }], caption: buildCaption(res.title) };
		}
		return { status: 'error', error: 'No Facebook media found' };
	}

	async fetchInfo(url: string): Promise<{ hdLabel: string; sdLabel: string } | null> {
		try {
			const res = await btchFetch('aio', url);
			const data = res.data;
			if (!data?.links?.video) return null;
			const entries: any[] = Array.isArray(data.links.video) ? data.links.video : Object.values(data.links.video);
			if (entries.length < 2) return null;
			const buildLabel = (e: any, def: string) => {
				const q = e?.resolution || e?.q_text || def;
				const s = typeof e?.size === 'number' && e.size > 0 ? ` (${formatFileSize(e.size)})` : '';
				return `${q}${s}`;
			};
			return { hdLabel: buildLabel(entries[0], 'HD'), sdLabel: buildLabel(entries[entries.length - 1], 'SD') };
		} catch { return null; }
	}
}
