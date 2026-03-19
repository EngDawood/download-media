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
	const msg = (data.msg || data.message || '').toLowerCase();
	return data.code === -1 || msg.includes('limit') || msg.includes('maintenance');
}

/**
 * Fetch from btch API with server failover.
 * Tries each backend in order; moves to next on 5xx or network error.
 */
export async function btchFetch(endpoint: string, url: string, retryOn4xx = false): Promise<any> {
	let lastError: Error | null = null;
	for (const server of BTCH_SERVERS) {
		try {
			const res = await fetch(`${server}/api/downloader/${endpoint}?url=${encodeURIComponent(url)}`, {
				headers: BTCH_HEADERS,
				signal: AbortSignal.timeout(30_000),
			});
			if (res.status >= 500) {
				log('warn', `btch:${endpoint}`, '5xx, trying next server', { server, status: res.status });
				lastError = new Error(`btch ${endpoint} returned ${res.status}`);
				continue;
			}
			if (!res.ok) {
				if (retryOn4xx) {
					log('warn', `btch:${endpoint}`, '4xx, trying next server', { server, status: res.status });
					lastError = new Error(`btch ${endpoint} returned ${res.status}`);
					continue;
				}
				throw new Error(`btch ${endpoint} returned ${res.status}`);
			}
			const data: any = await res.json();
			if (typeof data === 'string') throw new Error(`btch ${endpoint}: ${data}`);

			if (isBtchLimitError(data)) {
				log('warn', `btch:${endpoint}`, 'limit/maintenance reached, trying next server', { server, msg: data.msg });
				lastError = new Error(`btch ${endpoint}: ${data.msg || 'limit reached'}`);
				continue;
			}

			if (data.error) throw new Error(`btch ${endpoint}: ${data.error}`);
			return data;
		} catch (err: any) {
			const isTimeout = err.name === 'TimeoutError';
			const is5xx = err.message?.includes('returned 5');
			const is4xx = err.message?.includes('returned 4');
			const errLabel = isTimeout ? 'timeout' : err.message;
			log('warn', `btch:${endpoint}`, errLabel, { server });
			lastError = err;
			if (isTimeout || is5xx) continue;
			if (is4xx && retryOn4xx) continue;
			throw err;
		}
	}
	throw lastError || new Error(`btch ${endpoint}: all servers failed`);
}
