import { log } from '../../utils/logger';
import { DownloadError, classifyError, kindFromStatus, mostPermanent, type FailureKind } from './failure';

/**
 * cobalt (imputnet/cobalt) instances that answer without any auth, verified by
 * live extraction tests on November 11, 2026 — real MP3 bytes for YouTube
 * audio, a playable MP4 for YouTube video, and (except rue) a Facebook MP4.
 *
 * Everything else in the public directory is unusable from a Worker today:
 * the official imput.net hosts sit behind a Cloudflare bot wall (403), and
 * nearly every other community instance now demands a session JWT
 * (`error.api.auth.jwt.missing`). Community instances are volatile — they
 * gain auth, die, or come back — so this pool is tried in order and a dead
 * entry only costs one short attempt before the next is asked.
 */
export const COBALT_API_URLS = ['https://cobaltapi.cjs.nz', 'https://api.cobalt.liubquanti.click', 'https://rue-cobalt.xenon.zone'];

export interface CobaltRequest {
	downloadMode?: 'auto' | 'audio' | 'mute';
	audioFormat?: 'mp3';
	audioBitrate?: '128' | '256' | '320';
	videoQuality?: string;
	youtubeVideoCodec?: 'h264' | 'av1' | 'vp9';
}

export interface CobaltMedia {
	url: string;
	filename?: string;
}

/**
 * The height cobalt actually delivered, read from its filename suffix
 * ("Title (720p, h264).mp4"). Null when the filename carries no quality
 * marker — audio files and some services' names never do.
 */
export function cobaltQualityOf(filename?: string): number | null {
	const match = filename?.match(/\((\d{3,4})p, [^)]+\)\.[a-z0-9]+$/i);
	return match ? parseInt(match[1], 10) : null;
}

/** cobalt error code → failure classification. Content/fetch failures mean the link yielded nothing. */
function kindForCobaltError(code: string): FailureKind {
	if (code.includes('rate')) return 'rate_limited';
	return 'gone';
}

/** One instance's attempt. Throws a `DownloadError` (or a raw fetch error) on any failure. */
async function cobaltFetchFrom(apiUrl: string, url: string, request: CobaltRequest, timeoutMs: number): Promise<CobaltMedia> {
	const res = await fetch(`${apiUrl}/`, {
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		body: JSON.stringify({ url, ...request }),
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!res.ok) {
		log('warn', 'cobalt', `${res.status}`, { apiUrl, url });
		throw new DownloadError(`cobalt returned ${res.status}`, kindFromStatus(res.status));
	}
	const data: any = await res.json().catch(() => null);
	if (data?.status === 'tunnel' || data?.status === 'redirect') {
		if (typeof data.url === 'string' && data.url) return { url: data.url, filename: data.filename };
		throw new DownloadError('cobalt: response carried no url', 'gone');
	}
	if (data?.status === 'picker') {
		const first = Array.isArray(data.picker) ? data.picker.find((p: any) => typeof p?.url === 'string' && p.url) : null;
		if (first) return { url: first.url, filename: data.filename };
		throw new DownloadError('cobalt: empty picker', 'gone');
	}
	const code = data?.error?.code ?? 'unknown';
	log('warn', 'cobalt', String(code), { apiUrl, url });
	throw new DownloadError(`cobalt: ${code}`, kindForCobaltError(String(code)));
}

/**
 * Ask the cobalt pool to process one page URL, trying instances in order.
 * `timeoutMs` is the TOTAL budget across the pool — each instance gets an
 * equal slice, so a dead instance cannot eat the whole chain's time.
 * Resolves with the downloadable URL: a short-lived tunnel link for processed
 * media (YouTube), a direct CDN link for `redirect` answers (Facebook), or the
 * first item of a `picker`. When every instance fails it throws the most
 * permanent failure seen, classified like every other backend's.
 */
export async function cobaltFetch(url: string, request: CobaltRequest, timeoutMs: number): Promise<CobaltMedia> {
	const perInstanceMs = Math.max(5_000, Math.floor(timeoutMs / COBALT_API_URLS.length));
	const failures: FailureKind[] = [];
	let lastError: unknown;
	for (const apiUrl of COBALT_API_URLS) {
		try {
			return await cobaltFetchFrom(apiUrl, url, request, perInstanceMs);
		} catch (e) {
			lastError = e;
			failures.push(classifyError(e));
		}
	}
	const kind = mostPermanent(failures);
	throw new DownloadError(lastError instanceof Error ? lastError.message : 'cobalt: all instances failed', kind);
}
