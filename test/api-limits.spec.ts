import { describe, it, expect } from 'vitest';
import { apiMaxFileBytes, DEFAULT_API_MAX_FILE_MB, TELEGRAM_UPLOAD_LIMIT_BYTES } from '../src/constants';

describe('apiMaxFileBytes', () => {
	it('defaults to 150 MB when the var is unset', () => {
		expect(apiMaxFileBytes({})).toBe(150 * 1024 * 1024);
	});

	it('parses the worker var', () => {
		expect(apiMaxFileBytes({ API_MAX_FILE_MB: '200' })).toBe(200 * 1024 * 1024);
		expect(apiMaxFileBytes({ API_MAX_FILE_MB: 200 })).toBe(200 * 1024 * 1024);
	});

	it('falls back to the default on invalid values', () => {
		const fallback = DEFAULT_API_MAX_FILE_MB * 1024 * 1024;
		expect(apiMaxFileBytes({ API_MAX_FILE_MB: 'nope' })).toBe(fallback);
		expect(apiMaxFileBytes({ API_MAX_FILE_MB: '0' })).toBe(fallback);
		expect(apiMaxFileBytes({ API_MAX_FILE_MB: '-5' })).toBe(fallback);
		expect(apiMaxFileBytes({ API_MAX_FILE_MB: '' })).toBe(fallback);
	});

	it('keeps the Telegram bot limit at 50 MB', () => {
		expect(TELEGRAM_UPLOAD_LIMIT_BYTES).toBe(50 * 1024 * 1024);
		expect(DEFAULT_API_MAX_FILE_MB).toBe(150);
	});
});
