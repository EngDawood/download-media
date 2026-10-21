import { log } from '../../utils/logger';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../types/downloader';
import { buildCaption, isUrl } from './media-helpers';

const TIKWM_ENDPOINT = 'https://www.tikwm.com/api/';

export const TIKWM_TIMEOUT_MS = 8_000;

/** The free tier allows 1 request/second; one short wait covers a collision, anything more falls through to btch. */
const TIKWM_RETRY_DELAY_MS = 1_100;

export interface TikwmData {
	title?: string;
	cover?: string;
	origin_cover?: string;
	/** Standard-quality no-watermark video. */
	play?: string;
	/** HD no-watermark video — present only when requested with `hd=1` and the post has one. */
	hdplay?: string;
	music?: string;
	/** Slideshow posts list their photos here and carry no video. */
	images?: string[];
}

interface TikwmResponse {
	code?: number;
	msg?: string;
	data?: TikwmData;
}

async function requestTikwm(url: string, timeoutMs: number): Promise<TikwmResponse> {
	const res = await fetch(TIKWM_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ url, hd: '1' }),
		signal: AbortSignal.timeout(timeoutMs),
	});
	return (await res.json()) as TikwmResponse;
}

/**
 * Raw TikWM payload for a TikTok URL (short links included), or `null` when the service has
 * nothing to give. Never throws: TikWM is tried ahead of the btch fleet, so every failure
 * here — rate limit, timeout, unparseable URL — just hands the request on to the next source.
 */
export async function fetchTikwm(url: string, timeoutMs = TIKWM_TIMEOUT_MS): Promise<TikwmData | null> {
	try {
		let body = await requestTikwm(url, timeoutMs);
		if (body.code !== 0 && /limit/i.test(body.msg ?? '')) {
			await new Promise((r) => setTimeout(r, TIKWM_RETRY_DELAY_MS));
			body = await requestTikwm(url, timeoutMs);
		}
		if (body.code !== 0 || !body.data) {
			log('warn', 'tikwm', body.msg ?? 'no data', { url });
			return null;
		}
		return body.data;
	} catch (e) {
		log('warn', 'tikwm', 'request failed', { url, error: (e as Error)?.message });
		return null;
	}
}

/** TikTok extraction via TikWM. Returns `null` to fall through to the btch backends. */
export async function tryTikwm(url: string, mode: DownloaderMode): Promise<DownloaderResult | null> {
	const data = await fetchTikwm(url);
	if (!data) return null;

	const caption = buildCaption(data.title);
	const thumbnail = isUrl(data.cover) ? data.cover : isUrl(data.origin_cover) ? data.origin_cover : undefined;

	const photos: MediaItem[] = (data.images ?? []).filter(isUrl).map((u) => ({ type: 'photo', url: u }));
	if (photos.length) return { status: 'success', media: photos, caption, thumbnail };

	if (mode === 'audio' && isUrl(data.music)) {
		return { status: 'success', media: [{ type: 'audio', url: data.music }], caption, title: data.title, thumbnail };
	}

	const video = isUrl(data.hdplay) ? data.hdplay : data.play;
	if (!isUrl(video)) return null;
	return {
		status: 'success',
		media: [{ type: 'video', url: video }],
		caption,
		thumbnail,
		mp3Url: isUrl(data.music) ? data.music : undefined,
	};
}
