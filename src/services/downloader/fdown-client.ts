import { log } from '../../utils/logger';
import type { DownloaderMode, DownloaderResult } from '../../types/downloader';
import { DownloadError, kindFromStatus } from './failure';
import { buildCaption, isUrl } from './media-helpers';

// Public instance of sh13y/Facebook-Video-Download-API — a yt-dlp + ffmpeg service.
// https://github.com/sh13y/Facebook-Video-Download-API
const FDOWN_ENDPOINT = 'https://fdown.isuru.eu.org/download';

/**
 * Shorter than the Facebook budget on purpose. Warm responses measured 4–5s across
 * share/v, share/r and /reel/ links; the instance is on a free tier that sleeps, so a
 * cold hit blows past any budget we could sensibly wait out. Capping it here means a
 * sleeping backend costs 12s before the chain falls through to AIO, not 25s.
 */
export const FDOWN_TIMEOUT_MS = 12_000;

/**
 * `best` and `worst` are the only two rungs worth asking for: the service resolves them
 * against whatever the post actually carries, whereas a literal `720p` silently falls
 * back to best when the post has no 720p rendition — a request that cannot be honoured
 * is worse than one that was never specific.
 */
function qualityFor(mode: DownloaderMode): 'best' | 'worst' {
	return mode === 'sd' ? 'worst' : 'best';
}

interface FdownResponse {
	status?: string;
	video_info?: { title?: string; thumbnail?: string; uploader?: string };
	download_url?: string | null;
	/**
	 * Read for its `quality` labels only, never its URLs. These are yt-dlp's raw DASH
	 * renditions — every `format_id` ends in `v` and the streams carry no `soun` track, so
	 * sending one would hand Telegram silent video. `download_url` is the only field here
	 * that has been through ffmpeg's audio/video merge. The labels still answer a useful
	 * question: whether the post holds more than one rendition at all.
	 */
	available_formats?: Array<{ quality?: string }>;
}

/**
 * The rungs `download()` can actually deliver, or none.
 *
 * Only `best` and `worst` are offerable. The service's `360p`/`720p`/`1080p` values select
 * `best[height<=N][ext=mp4]+bestaudio[ext=m4a]`, and Facebook posts carry no progressive
 * mp4 at those heights and no separate m4a audio, so all three fail — reported, misleadingly,
 * as "This video is private or not available for download". Verified against several public
 * reels: `best` and `worst` succeed, the three fixed heights never do.
 *
 * Gated on the post listing more than one distinct height, so a single-rendition post does
 * not get a button that would hand back the same file.
 */
function altQualitiesFor(data: FdownResponse): DownloaderResult['altQualities'] {
	const heights = new Set((data.available_formats ?? []).map((f) => f?.quality).filter((q): q is string => typeof q === 'string'));
	if (heights.size < 2) return undefined;
	return [
		{ label: 'HD', mode: 'hd' },
		{ label: 'SD', mode: 'sd' },
	];
}

/**
 * Facebook extraction via fdown, tried ahead of the btch fleet.
 *
 * Returns `null` when the service answers but has nothing to give — a 400 (yt-dlp calls
 * the URL unsupported) or a 200 carrying no `download_url`. That is deliberately not a
 * recorded failure: yt-dlp's opinion is not authoritative for links the btch backends
 * extract fine, and letting a `gone` from here win the permanence ranking would tell the
 * user their link is dead when the later stages merely timed out.
 *
 * Throws a `DownloadError` for failures that describe the service rather than the link
 * (429 rate limit, 5xx, timeout) so those do count toward the final classification.
 */
export async function tryFdown(url: string, mode: DownloaderMode, timeoutMs = FDOWN_TIMEOUT_MS): Promise<DownloaderResult | null> {
	const res = await fetch(FDOWN_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url, quality: qualityFor(mode) }),
		signal: AbortSignal.timeout(timeoutMs),
	});

	if (!res.ok) {
		// The service rate-limits at 10 requests per 60s per IP.
		if (res.status === 429 || res.status >= 500) {
			log('warn', 'fdown', `${res.status}`, { url });
			throw new DownloadError(`fdown returned ${res.status}`, kindFromStatus(res.status));
		}
		log('warn', 'fdown', `${res.status} — falling through`, { url });
		return null;
	}

	const data = (await res.json()) as FdownResponse;
	if (data.status !== 'success' || !isUrl(data.download_url)) return null;

	const info = data.video_info;
	return {
		status: 'success',
		media: [{ type: 'video', url: data.download_url }],
		caption: buildCaption(info?.title),
		title: info?.title,
		thumbnail: isUrl(info?.thumbnail) ? info.thumbnail : undefined,
		altQualities: altQualitiesFor(data),
	};
}
