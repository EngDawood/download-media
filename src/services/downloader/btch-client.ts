import { log } from '../../utils/logger';

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

/** Returns true when an error came from an aborted/timed-out fetch (cold extraction taking too long). */
export function isTimeoutError(err: any): boolean {
	if (err?.isTimeout) return true;
	const name = err?.name || '';
	const msg = (err?.message || '').toLowerCase();
	return name === 'TimeoutError' || name === 'AbortError' || msg.includes('aborted') || msg.includes('timeout');
}

/**
 * Fetch from btch API, racing all backends in parallel.
 * Returns the first successful response; throws if all fail.
 * A thrown error caused by all backends timing out carries `.isTimeout = true`.
 */
export async function btchFetch(endpoint: string, url: string, _retryOn4xx = false, timeoutMs = 8_000): Promise<any> {
	const fetchFromServer = async (server: string): Promise<any> => {
		const res = await fetch(`${server}/api/downloader/${endpoint}?url=${encodeURIComponent(url)}`, {
			headers: BTCH_HEADERS,
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!res.ok) {
			log('warn', `btch:${endpoint}`, `${res.status}`, { server });
			throw new Error(`btch ${endpoint} returned ${res.status}`);
		}
		const data: any = await res.json();
		if (typeof data === 'string') throw new Error(`btch ${endpoint}: ${data}`);
		if (isBtchLimitError(data)) {
			log('warn', `btch:${endpoint}`, 'limit/maintenance', { server, msg: data.msg });
			throw new Error(`btch ${endpoint}: ${data.msg || 'limit reached'}`);
		}
		if (data.error) throw new Error(`btch ${endpoint}: ${data.error}`);
		return data;
	};

	try {
		return await Promise.any(BTCH_SERVERS.map(fetchFromServer));
	} catch (err) {
		if (err instanceof AggregateError) {
			const chosen = err.errors[err.errors.length - 1] ?? new Error(`btch ${endpoint}: all servers failed`);
			if (err.errors.some(isTimeoutError)) (chosen as any).isTimeout = true;
			throw chosen;
		}
		throw err;
	}
}
