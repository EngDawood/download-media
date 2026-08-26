import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { btchFetch } from '../btch-client';
import { tryAIO } from '../aio-parser';
import { classifyError, mostPermanent, type FailureKind } from '../failure';
import { buildCaption, isUrl } from '../media-helpers';

// Douyin shares TikTok's backend, so btch's `tiktok` endpoint frequently accepts
// douyin.com URLs and returns the same shape (data.play / data.music / data.images).
// AIO catches the rest — including qishui.douyin.com (Soda Music) audio shares —
// when it can. `v.douyin.com` short links redirect to the canonical form; btch
// resolves those server-side.
export class DouyinProvider implements IDownloaderProvider {
	readonly platforms = ['douyin.com', 'iesdouyin.com'];

	async download(url: string, mode: DownloaderMode): Promise<DownloaderResult> {
		const failures: FailureKind[] = [];
		try {
			const res = await btchFetch('tiktok', url);
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
				if (mode === 'audio' && isUrl(data.music))
					return { status: 'success', media: [{ type: 'audio', url: data.music }], caption, title: data.title, thumbnail };
				if (isUrl(data.play)) {
					return {
						status: 'success',
						media: [{ type: 'video', url: data.play }],
						caption,
						thumbnail,
						mp3Url: isUrl(data.music) ? data.music : undefined,
					};
				}
			}
		} catch (e) {
			failures.push(classifyError(e));
		}

		const aio = await tryAIO(url, mode, failures);
		if (aio) return aio;

		const kind = mostPermanent(failures);
		const message =
			kind === 'timeout' || kind === 'rate_limited'
				? 'Download service temporarily unavailable. Please try again or use the Retry button.'
				: 'No Douyin media found';
		return { status: 'error', error: message, failureKind: kind };
	}
}
