import { log } from '../../utils/logger';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../types/downloader';
import { BROWSER_UA, buildCaption, isUrl } from './media-helpers';

const PAGE_TIMEOUT_MS = 10_000;
const MEDIA_TIMEOUT_MS = 25_000;

/** Telegram bots cannot send more than 50MB, so a bigger file is not worth buffering. */
const MAX_BUFFER_BYTES = 50 * 1024 * 1024;

const REHYDRATION_RE = /id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s;

interface TiktokItem {
	desc?: string;
	video?: { playAddr?: string; downloadAddr?: string; cover?: string; originCover?: string };
	music?: { playUrl?: string };
	imagePost?: { images?: { imageURL?: { urlList?: string[] } }[] };
}

interface TiktokPage {
	item: TiktokItem;
	/** Cookies the CDN wants back with the media request; without them it answers 403. */
	cookie: string;
}

/** The post's own JSON, from the web page TikTok serves to a browser. `null` on any failure. */
async function fetchPage(url: string): Promise<TiktokPage | null> {
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' },
			redirect: 'follow',
			signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
		});
		if (!res.ok) return null;
		const json = (await res.text()).match(REHYDRATION_RE)?.[1];
		if (!json) return null;
		const item = JSON.parse(json)?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct as TiktokItem | undefined;
		if (!item) return null;
		const cookie = res.headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		return { item, cookie };
	} catch (e) {
		log('warn', 'tiktok-direct', 'page fetch failed', { url, error: (e as Error)?.message });
		return null;
	}
}

/**
 * The CDN rejects a bare link (403), so Telegram cannot fetch it by URL. Download the
 * bytes here with the page's cookies and a TikTok Referer and hand them over as a buffer.
 */
async function downloadBytes(mediaUrl: string, cookie: string): Promise<Uint8Array | null> {
	try {
		const res = await fetch(mediaUrl, {
			headers: { 'User-Agent': BROWSER_UA, Referer: 'https://www.tiktok.com/', ...(cookie ? { Cookie: cookie } : {}) },
			signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
		});
		if (!res.ok || Number(res.headers.get('content-length') ?? 0) > MAX_BUFFER_BYTES) return null;
		return new Uint8Array(await res.arrayBuffer());
	} catch (e) {
		log('warn', 'tiktok-direct', 'media download failed', { error: (e as Error)?.message });
		return null;
	}
}

async function toItem(type: 'video' | 'audio', url: string, cookie: string): Promise<MediaItem> {
	const buffer = await downloadBytes(url, cookie);
	return buffer ? { type, url, buffer, filename: type === 'video' ? 'tiktok.mp4' : 'tiktok.mp3' } : { type, url };
}

/** TikTok extraction straight from the post page. Returns `null` to fall through to the btch backends. */
export async function tryTiktokDirect(url: string, mode: DownloaderMode): Promise<DownloaderResult | null> {
	const page = await fetchPage(url);
	if (!page) return null;
	const { item, cookie } = page;

	const caption = buildCaption(item.desc);
	const cover = item.video?.cover ?? item.video?.originCover;
	const thumbnail = isUrl(cover) ? cover : undefined;

	const photos: MediaItem[] = (item.imagePost?.images ?? [])
		.map((img) => img.imageURL?.urlList?.[0])
		.filter(isUrl)
		.map((u) => ({ type: 'photo', url: u }));
	if (photos.length) return { status: 'success', media: photos, caption, thumbnail };

	const music = item.music?.playUrl;
	if (mode === 'audio' && isUrl(music)) {
		return { status: 'success', media: [await toItem('audio', music, cookie)], caption, title: item.desc, thumbnail };
	}

	const video = item.video?.playAddr || item.video?.downloadAddr;
	if (!isUrl(video)) return null;
	return { status: 'success', media: [await toItem('video', video, cookie)], caption, thumbnail, mp3Url: isUrl(music) ? music : undefined };
}
