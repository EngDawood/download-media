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
 * Fetch from btch API, racing all backends in parallel.
 * Returns the first successful response; throws if all fail.
 */
export async function btchFetch(endpoint: string, url: string, retryOn4xx = false): Promise<any> {
	const fetchFromServer = async (server: string): Promise<any> => {
		const res = await fetch(`${server}/api/downloader/${endpoint}?url=${encodeURIComponent(url)}`, {
			headers: BTCH_HEADERS,
			signal: AbortSignal.timeout(8_000),
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
			throw err.errors[err.errors.length - 1] ?? new Error(`btch ${endpoint}: all servers failed`);
		}
		throw err;
	}
}
