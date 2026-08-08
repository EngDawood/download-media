import { describe, it, expect, vi, afterEach } from 'vitest';
import { btchFetch, isBtchLimitError } from '../src/services/downloader/btch-client';
import { DownloadError } from '../src/services/downloader/failure';

describe('isBtchLimitError()', () => {
	it('returns true when code is -1', () => {
		expect(isBtchLimitError({ code: -1, msg: 'Error' })).toBe(true);
		expect(isBtchLimitError({ code: -1, message: 'Something went wrong' })).toBe(true);
	});

	it('returns true when msg contains limit or maintenance', () => {
		expect(isBtchLimitError({ code: 0, msg: 'API limit reached' })).toBe(true);
		expect(isBtchLimitError({ code: 200, message: 'Server is undergoing maintenance' })).toBe(true);
	});

	it('returns true for the AIO throttle body, which uses `mess`', () => {
		expect(isBtchLimitError({ status: 'ok', mess: 'Too many requests. Please try again later.' })).toBe(true);
	});

	it('returns false for normal successful data', () => {
		expect(isBtchLimitError({ code: 0, msg: 'Success' })).toBe(false);
		expect(isBtchLimitError({ code: 200, message: 'OK' })).toBe(false);
		expect(isBtchLimitError({ status: 'success' })).toBe(false);
	});

	it('handles null or missing fields gracefully', () => {
		expect(isBtchLimitError({})).toBe(false);
		expect(isBtchLimitError({ code: null, message: undefined })).toBe(false);
	});
});

describe('btchFetch() failure resolution', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** Stub fetch so each of the four raced backends fails in a prescribed way, in call order. */
	const stubBackends = (outcomes: Array<{ status: number } | { abort: true }>) => {
		let call = 0;
		vi.stubGlobal('fetch', async () => {
			const outcome = outcomes[call++ % outcomes.length];
			if ('abort' in outcome) throw new DOMException('The operation timed out', 'TimeoutError');
			return new Response('{}', { status: outcome.status });
		});
	};

	it('throws a DownloadError rather than a bare Error', async () => {
		stubBackends([{ abort: true }]);
		await expect(btchFetch('aio', 'https://example.com/x')).rejects.toBeInstanceOf(DownloadError);
	});

	it('reports timeout when every backend aborts', async () => {
		stubBackends([{ abort: true }]);
		await expect(btchFetch('aio', 'https://example.com/x')).rejects.toMatchObject({ kind: 'timeout' });
	});

	it('reports gone when one backend returns 404 and the rest time out', async () => {
		stubBackends([{ abort: true }, { abort: true }, { status: 404 }, { abort: true }]);
		await expect(btchFetch('aio', 'https://example.com/x')).rejects.toMatchObject({ kind: 'gone' });
	});

	it('reports rate_limited when the fleet returns 5xx', async () => {
		stubBackends([{ status: 503 }]);
		await expect(btchFetch('aio', 'https://example.com/x')).rejects.toMatchObject({ kind: 'rate_limited' });
	});

	it('carries a message belonging to the winning category, not an arbitrary one', async () => {
		stubBackends([{ abort: true }, { abort: true }, { status: 404 }, { abort: true }]);
		await expect(btchFetch('aio', 'https://example.com/x')).rejects.toThrow('returned 404');
	});
});
