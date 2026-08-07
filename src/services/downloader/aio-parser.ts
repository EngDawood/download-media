import { log } from '../../utils/logger';
import type { MediaItem, DownloaderResult } from '../../types/downloader';
import { btchFetch } from './btch-client';
import { isUrl, detectMediaType, buildCaption } from './media-helpers';

/** Extracts MediaItems from a btch AIO gallery response (carousels, slideshows). */
export function parseAioGallery(items: any[]): MediaItem[] {
	return items
		.map((item: any) => {
			const src = item.resources?.[0]?.src ?? item.urls?.url ?? null;
			return isUrl(src) ? { type: detectMediaType(src), url: src } as MediaItem : null;
		})
		.filter((item): item is MediaItem => item !== null);
}

/** Extracts MediaItems from a btch AIO links section (video/audio/photo). */
export function parseLinksSection(links: unknown, type: MediaItem['type']): MediaItem[] {
	if (!links) return [];
	const entries: any[] = Array.isArray(links) ? links : Object.values(links as object);
	return entries
		.filter((e: any) => isUrl(e?.url))
		.map((e: any) => ({ type, url: e.url, quality: e.q_text || e.resolution } as MediaItem));
}

/**
 * Try AIO endpoint first — returns richer data (caption, author, gallery, quality options).
 * Returns null if AIO fails or has no media, so caller can fall back to platform-specific endpoint.
 */
export async function tryAIO(url: string, mode: string = 'auto'): Promise<DownloaderResult | null> {
	try {
		const res = await btchFetch('aio', url);
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
			return { status: 'success', media, caption, thumbnail };
		}
	} catch (e) {
		log('warn', 'downloader:AIO', 'tryAIO failed', { error: (e as Error).message });
	}
	return null;
}
