import { describe, it, expect } from 'vitest';
import { t } from '../src/i18n';
import type { Locale } from '../src/i18n';

/**
 * Regression test for the subscription-gate silence bug (2026-11-05):
 * the Arabic `gate.blocked` template sent with parse_mode MarkdownV2 had
 * unescaped `.` and `!` characters, so Telegram rejected the reply with
 * "can't parse entities", the handler threw, and non-subscribers received
 * no message at all. The English template was escaped correctly.
 *
 * Telegram reserves these characters in MarkdownV2 outside link URLs:
 * _ * [ ] ( ) ~ ` > # + - = | { } . !
 * This test renders the gate message for every locale the same way the
 * gate does and asserts no reserved `.`/`!` reaches Telegram unescaped.
 */
const LOCALES: Locale[] = ['en', 'ar'];

function renderGateBlocked(locale: Locale): string {
	return t(locale, 'gate.blocked', { freeUses: 3, channelName: 'testchannel' });
}

describe('gate.blocked MarkdownV2 safety', () => {
	for (const locale of LOCALES) {
		it(`renders without unescaped '.' or '!' outside the link URL (${locale})`, () => {
			const text = renderGateBlocked(locale);
			// The (https://...) part of the inline link is exempt from escaping.
			const withoutUrl = text.replace(/\(https:\/\/[^)]*\)/g, '');
			expect(withoutUrl).not.toMatch(/(?<!\\)[.!]/);
		});

		it(`keeps the channel link intact (${locale})`, () => {
			const text = renderGateBlocked(locale);
			expect(text).toContain('[t\\.me/testchannel](https://t.me/testchannel)');
		});
	}
});
