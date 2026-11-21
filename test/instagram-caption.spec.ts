import { describe, it, expect } from 'vitest';
import { parseOgDescription } from '../src/services/downloader/instagram-caption';

// og:description of an Instagram post looks like `N likes, N comments - user on <date>: "caption"`.
// Seen live 2026-11-21 on DfCheFFjlBO, with U+200E marks around the date and at the end.
describe('parseOgDescription', () => {
	it('extracts the caption and drops the engagement prefix and bidi marks', () => {
		const og = '1 likes, 1 comments - eng_dawood7 on October 28, 2026‎: "ملخصات سهلة وقصيرة. تواصل معنا الآن". ‎';
		expect(parseOgDescription(og)).toBe('ملخصات سهلة وقصيرة. تواصل معنا الآن');
	});

	it('keeps quotes and newlines inside the caption', () => {
		const og = '1,234 likes, 56 comments - user on May 1, 2026: "He said "hi"\nsecond line".';
		expect(parseOgDescription(og)).toBe('He said "hi"\nsecond line');
	});

	it('returns empty for a description that is not the likes/comments form', () => {
		expect(parseOgDescription('Login • Instagram')).toBe('');
		expect(parseOgDescription('')).toBe('');
	});
});
