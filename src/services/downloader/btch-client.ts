import { log } from '../../utils/logger';
import { DownloadError, classifyError, kindFromStatus, mostPermanent } from './failure';

const BTCH_SERVERS = [
	'https://backend2.tioo.eu.org',
	'https://backend3.tioo.eu.org',
	'https://backend4.tioo.eu.org',
	'https://backend1.tioo.eu.org',
];

const BTCH_HEADERS = {
	'User-Agent': 'btch/6.0.25',
	'X-Client-Version': '6.0.25',
	'Content-Type': 'application/json',
};

/** Returns true when a btch API response indicates a rate limit or maintenance state. */
export function isBtchLimitError(data: any): boolean {
	// `mess` is what the AIO endpoint uses for throttling ({"status":"ok","mess":"Too many requests..."});
	// without it that body looks like a success with no payload.
	const msg = (data.msg || data.message || data.mess || '').toLowerCase();
	return data.code === -1 || msg.includes('limit') || msg.includes('maintenance') || msg.includes('too many requests');
}

/**
 * Fetch from btch API, racing all backends in parallel.
 * Returns the first successful response; throws a `DownloadError` if all fail, carrying
 * the classification of whichever failure was most permanent across the four servers.
 *
 * Default 12s (was 8s): D1 stats showed a large timeout bucket for extractors that
 * consistently return in 9–11s under load. Providers that need longer (YouTube 20s,
 * Facebook share/ 15s) still pass their own value.
 */
export async function btchFetch(endpoint: string, url: string, timeoutMs = 12_000): Promise<any> {
	const fetchFromServer = async (server: string): Promise<any> => {
		const res = await fetch(`${server}/api/downloader/${endpoint}?url=${encodeURIComponent(url)}`, {
			headers: BTCH_HEADERS,
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!res.ok) {
			log('warn', `btch:${endpoint}`, `${res.status}`, { server });
			throw new DownloadError(`btch ${endpoint} returned ${res.status}`, kindFromStatus(res.status));
		}
		const data: any = await res.json();
		if (typeof data === 'string') throw new DownloadError(`btch ${endpoint}: ${data}`, 'gone');
		if (isBtchLimitError(data)) {
			log('warn', `btch:${endpoint}`, 'limit/maintenance', { server, msg: data.msg });
			throw new DownloadError(`btch ${endpoint}: ${data.msg || 'limit reached'}`, 'rate_limited');
		}
		if (data.error) throw new DownloadError(`btch ${endpoint}: ${data.error}`, 'gone');
		return data;
	};

	try {
		return await Promise.any(BTCH_SERVERS.map(fetchFromServer));
	} catch (err) {
		if (!(err instanceof AggregateError)) throw err;
		const kinds = err.errors.map(classifyError);
		const kind = mostPermanent(kinds);
		// Report a message belonging to the winning category. Picking an arbitrary error
		// (this used to take the last one) routinely described a different failure than
		// the one we were about to act on.
		const representative = err.errors[kinds.indexOf(kind)] as Error | undefined;
		throw new DownloadError(representative?.message ?? `btch ${endpoint}: all servers failed`, kind);
	}
}
