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

/**
 * Instagram-capable ordering of the same pool. Only liubquanti and rue can
 * extract Instagram at all — their operators configured IG session cookies,
 * so reels resolve to direct CDN links; cjs.nz has no cookies and answers
 * `error.api.fetch.empty` for every IG link (verified November 11, 2026).
 * It stays in the list last as a spare. Neither working instance resolves
 * IG photo posts, so callers must keep a non-cobalt fallback for those.
 */
export const COBALT_API_URLS_INSTAGRAM = [
	'https://api.cobalt.liubquanti.click',
	'https://rue-cobalt.xenon.zone',
	'https://cobaltapi.cjs.nz',
];

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
	/** Media kind cobalt itself declared for a `picker` item ('photo' | 'video'). */
	pickerType?: string;
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

/** First byte must arrive within this long, or the tunnel counts as dead. Good tunnels answer in ~1s; an empty one ends immediately. */
const TUNNEL_PROBE_TIMEOUT_MS = 8_000;

/**
 * A cobalt answer is only a promise, not a file: rue-cobalt issued HTTP 200
 * tunnels for two YouTube videos whose bodies were empty (verified live,
 * November 13, 2026), and the bot then uploaded 0 bytes to Telegram. Read
 * the first chunk with a plain GET — never Range, which tunnels reject —
 * and cancel: re-fetching the same tunnel URL afterwards still returns the
 * full file (verified live), so the probe costs one round trip, not the file.
 */
async function tunnelServesBytes(url: string): Promise<boolean> {
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
			signal: AbortSignal.timeout(TUNNEL_PROBE_TIMEOUT_MS),
		});
		if (!res.ok || !res.body) return false;
		const reader = res.body.getReader();
		try {
			const { done, value } = await reader.read();
			return !done && (value?.byteLength ?? 0) > 0;
		} finally {
			await reader.cancel().catch(() => {});
		}
	} catch {
		return false;
	}
}

/** One instance's attempt. Throws a `DownloadError` (or a raw fetch error) on any failure. */
async function cobaltFetchFrom(
	apiUrl: string,
	url: string,
	request: CobaltRequest,
	timeoutMs: number,
	verifyBytes: boolean,
): Promise<CobaltMedia[]> {
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
	let items: CobaltMedia[];
	if (data?.status === 'tunnel' || data?.status === 'redirect') {
		if (typeof data.url === 'string' && data.url) items = [{ url: data.url, filename: data.filename }];
		else throw new DownloadError('cobalt: response carried no url', 'gone');
	} else if (data?.status === 'picker') {
		items = Array.isArray(data.picker)
			? data.picker
					.filter((p: any) => typeof p?.url === 'string' && p.url)
					.map((p: any) => ({ url: p.url, pickerType: typeof p.type === 'string' ? p.type : undefined }))
			: [];
		if (items.length === 0) throw new DownloadError('cobalt: empty picker', 'gone');
	} else {
		const code = data?.error?.code ?? 'unknown';
		log('warn', 'cobalt', String(code), { apiUrl, url });
		throw new DownloadError(`cobalt: ${code}`, kindForCobaltError(String(code)));
	}
	if (verifyBytes && !(await tunnelServesBytes(items[0].url))) {
		log('warn', 'cobalt', 'empty tunnel', { apiUrl, url });
		throw new DownloadError('cobalt: tunnel served no bytes', 'gone');
	}
	return items;
}

/**
 * Ask the cobalt pool to process one page URL, trying instances in order.
 * `timeoutMs` is the PER-INSTANCE cap, not a total budget: the liubquanti
 * relay needs 15-23s to answer a max-quality probe (7-18s for 720p, measured
 * November 13, 2026), and slicing a 25s total three ways capped it at 8.3s,
 * so it always timed out and the fast-but-sometimes-empty rue instance won
 * by default. A hanging instance can now cost the full cap before the next
 * is tried; that is the price of reaching the slow relay at all. Resolves
 * with every downloadable item: a single entry for `tunnel` / `redirect`
 * answers (YouTube, Facebook), or all of a `picker`'s items (Instagram
 * carousels). `apiUrls` overrides the pool and its order for services only
 * some instances can serve. When every instance fails it throws the most
 * permanent failure seen, classified like every other backend's.
 */
export async function cobaltFetchMany(
	url: string,
	request: CobaltRequest,
	timeoutMs: number,
	apiUrls: string[] = COBALT_API_URLS,
	verifyBytes = false,
): Promise<CobaltMedia[]> {
	const perInstanceMs = Math.max(5_000, timeoutMs);
	const failures: FailureKind[] = [];
	let lastError: unknown;
	for (const apiUrl of apiUrls) {
		try {
			return await cobaltFetchFrom(apiUrl, url, request, perInstanceMs, verifyBytes);
		} catch (e) {
			lastError = e;
			failures.push(classifyError(e));
		}
	}
	const kind = mostPermanent(failures);
	throw new DownloadError(lastError instanceof Error ? lastError.message : 'cobalt: all instances failed', kind);
}

/**
 * Single-media form of {@link cobaltFetchMany}: the tunnel/redirect URL, or a picker's first item.
 * The returned URL is verified to serve bytes first (see `tunnelServesBytes`),
 * unless the caller opts out — a ladder probe only reads the filename, so it
 * skips the check and never pays for a download it will throw away.
 */
export async function cobaltFetch(
	url: string,
	request: CobaltRequest,
	timeoutMs: number,
	apiUrls: string[] = COBALT_API_URLS,
	options: { verifyBytes?: boolean } = {},
): Promise<CobaltMedia> {
	const items = await cobaltFetchMany(url, request, timeoutMs, apiUrls, options.verifyBytes ?? true);
	return items[0];
}
