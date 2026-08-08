import { describe, it, expect } from 'vitest';
import { DownloadError, classifyError, isRetryable, isTimeoutError, kindFromStatus, mostPermanent } from '../src/services/downloader/failure';

describe('kindFromStatus()', () => {
	it('treats 404 and 410 as gone', () => {
		expect(kindFromStatus(404)).toBe('gone');
		expect(kindFromStatus(410)).toBe('gone');
	});

	it('treats 429 and 5xx as rate_limited — an unhealthy backend says nothing about the link', () => {
		expect(kindFromStatus(429)).toBe('rate_limited');
		expect(kindFromStatus(500)).toBe('rate_limited');
		expect(kindFromStatus(503)).toBe('rate_limited');
	});

	it('falls back to gone for any other non-OK status', () => {
		expect(kindFromStatus(400)).toBe('gone');
		expect(kindFromStatus(403)).toBe('gone');
	});
});

describe('isTimeoutError()', () => {
	it('recognises the abort shapes AbortSignal.timeout produces', () => {
		expect(isTimeoutError(new DOMException('The operation timed out', 'TimeoutError'))).toBe(true);
		expect(isTimeoutError(new DOMException('The operation was aborted', 'AbortError'))).toBe(true);
		expect(isTimeoutError(new Error('The operation was aborted'))).toBe(true);
	});

	it('does not fire on unrelated errors', () => {
		expect(isTimeoutError(new Error('btch aio returned 404'))).toBe(false);
		expect(isTimeoutError(undefined)).toBe(false);
		expect(isTimeoutError(null)).toBe(false);
	});
});

describe('mostPermanent()', () => {
	it('ranks gone above unsupported above rate_limited above timeout', () => {
		expect(mostPermanent(['timeout', 'gone'])).toBe('gone');
		expect(mostPermanent(['timeout', 'unsupported'])).toBe('unsupported');
		expect(mostPermanent(['timeout', 'rate_limited'])).toBe('rate_limited');
		expect(mostPermanent(['gone', 'unsupported', 'rate_limited', 'timeout'])).toBe('gone');
	});

	it('returns timeout only when every observed failure was a timeout', () => {
		expect(mostPermanent(['timeout', 'timeout', 'timeout'])).toBe('timeout');
	});

	it('defaults to gone when nothing was observed, so an unexplained failure never auto-retries', () => {
		expect(mostPermanent([])).toBe('gone');
	});
});

describe('classifyError()', () => {
	it('lets a DownloadError answer for itself', () => {
		expect(classifyError(new DownloadError('throttled', 'rate_limited'))).toBe('rate_limited');
		expect(classifyError(new DownloadError('deleted', 'gone'))).toBe('gone');
	});

	it('classifies aborted fetches as timeout', () => {
		expect(classifyError(new DOMException('timed out', 'TimeoutError'))).toBe('timeout');
	});

	it('defaults unrecognised errors to gone rather than guessing transient', () => {
		expect(classifyError(new Error('something unexpected'))).toBe('gone');
		expect(classifyError('a bare string')).toBe('gone');
	});

	it('resolves an AggregateError by permanence — one real 404 outranks three timeouts', () => {
		const err = new AggregateError([
			new DOMException('timed out', 'TimeoutError'),
			new DOMException('timed out', 'TimeoutError'),
			new DownloadError('btch aio returned 404', 'gone'),
			new DOMException('timed out', 'TimeoutError'),
		]);
		expect(classifyError(err)).toBe('gone');
	});

	it('reports timeout when every racer in the AggregateError timed out', () => {
		const err = new AggregateError([
			new DOMException('timed out', 'TimeoutError'),
			new DOMException('timed out', 'TimeoutError'),
		]);
		expect(classifyError(err)).toBe('timeout');
	});

	it('prefers rate_limited over timeout, so a throttled fleet is not mistaken for a slow one', () => {
		const err = new AggregateError([
			new DOMException('timed out', 'TimeoutError'),
			new DownloadError('btch aio: Too many requests', 'rate_limited'),
		]);
		expect(classifyError(err)).toBe('rate_limited');
	});
});

describe('isRetryable()', () => {
	it('is true only for timeout', () => {
		expect(isRetryable('timeout')).toBe(true);
		expect(isRetryable('rate_limited')).toBe(false);
		expect(isRetryable('gone')).toBe(false);
		expect(isRetryable('unsupported')).toBe(false);
	});
});
