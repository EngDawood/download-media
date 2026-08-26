import { log } from '../../utils/logger';
import type { MediaItem, DownloaderResult } from '../../types/downloader';
import { btchFetch } from './btch-client';
import { classifyError, type FailureKind } from './failure';
import { isUrl, detectMediaType, buildCaption } from './media-helpers';

/** Extracts MediaItems from a btch AIO gallery response (carousels, slideshows). */
export function parseAioGallery(items: any[]): MediaItem[] {
	return items
		.map((item: any) => {
			const src = item.resources?.[0]?.src ?? item.urls?.url ?? null;
			return isUrl(src) ? ({ type: detectMediaType(src), url: src } as MediaItem) : null;
		})
		.filter((item): item is MediaItem => item !== null);
}

/**
 * Extracts MediaItems from a btch AIO links section (video/audio/photo).
 * `size` (bytes) is carried through when present so callers can pick a variant
 * that fits Telegram's upload limit instead of blindly taking the first one.
 */
export function parseLinksSection(links: unknown, type: MediaItem['type']): MediaItem[] {
	if (!links) return [];
	const entries: any[] = Array.isArray(links) ? links : Object.values(links as object);
	return entries
		.filter((e: any) => isUrl(e?.url))
		.map((e: any) => {
			const item: MediaItem = { type, url: e.url, quality: e.q_text || e.resolution };
			if (typeof e.size === 'number' && e.size > 0) item.filesize = e.size;
			return item;
		});
}

/**
 * Try AIO endpoint first — returns richer data (caption, author, gallery, quality options).
 * Returns null if AIO fails or has no media, so caller can fall back to platform-specific endpoint.
 *
 * Because the failure is swallowed to allow that fallback, the reason would otherwise be lost.
 * Callers that end up reporting an error can pass `failures` to collect it.
 */
export async function tryAIO(
	url: string,
	mode: string = 'auto',
	failures?: FailureKind[],
	timeoutMs?: number,
): Promise<DownloaderResult | null> {
	try {
		const res = await btchFetch('aio', url, timeoutMs);
		const data = res.data;
		if (!data) return null;

		const caption = buildCaption(data.title);
		const thumbnail = data.thumbnail;
		const media: MediaItem[] = [];

		if (data.gallery?.items?.length > 0) {
			media.push(...parseAioGallery(data.gallery.items));
		}

		if (media.length === 0 && data.links) {
			if (mode === 'audio') {
				media.push(...parseLinksSection(data.links.audio, 'audio'));
			}
			if (media.length === 0) {
				media.push(...parseLinksSection(data.links.video, 'video'));
			}
			if (media.length === 0) {
				const photoLinks = data.links.photo || data.links.image;
				if (photoLinks) {
					const entries: any[] = Array.isArray(photoLinks) ? photoLinks : Object.values(photoLinks);
					for (const p of entries) {
						if (isUrl(p?.url)) media.push({ type: 'photo', url: p.url });
						else if (typeof p === 'string' && isUrl(p)) media.push({ type: 'photo', url: p });
					}
				}
			}
		}

		if (media.length > 0) {
			return { status: 'success', media, caption, title: data.title, thumbnail };
		}
	} catch (e) {
		failures?.push(classifyError(e));
		log('warn', 'downloader:AIO', 'tryAIO failed', { error: (e as Error).message });
	}
	return null;
}
