import { describe, it, expect } from 'vitest';
import { isBtchLimitError } from '../src/services/downloader/btch-client';

describe('isBtchLimitError()', () => {
	it('returns true when code is -1', () => {
		expect(isBtchLimitError({ code: -1, msg: 'Error' })).toBe(true);
		expect(isBtchLimitError({ code: -1, message: 'Something went wrong' })).toBe(true);
	});

	it('returns true when msg contains limit or maintenance', () => {
		expect(isBtchLimitError({ code: 0, msg: 'API limit reached' })).toBe(true);
		expect(isBtchLimitError({ code: 200, message: 'Server is undergoing maintenance' })).toBe(true);
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
