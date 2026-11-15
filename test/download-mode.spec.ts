import { describe, it, expect } from 'vitest';
import { resolveDownloadMode } from '../src/services/telegram-bot/download-mode';
import { getUserDownloadMode, setUserDownloadMode, type DownloadMode } from '../src/utils/db';
import { t } from '../src/i18n';

// ─── resolveDownloadMode ─────────────────────────────────────────────────────

describe('resolveDownloadMode', () => {
	it('defaults to video (auto) when no preference is stored', () => {
		expect(resolveDownloadMode(null, 'YouTube')).toBe('auto');
		expect(resolveDownloadMode(undefined, 'YouTube')).toBe('auto');
	});

	it('returns auto for an explicit video preference', () => {
		expect(resolveDownloadMode('video', 'YouTube')).toBe('auto');
		expect(resolveDownloadMode('video', 'TikTok')).toBe('auto');
	});

	it('returns audio for an mp3 preference on YouTube and TikTok', () => {
		expect(resolveDownloadMode('mp3', 'YouTube')).toBe('audio');
		expect(resolveDownloadMode('mp3', 'TikTok')).toBe('audio');
	});

	it('ignores the mp3 preference where no audio track exists to prefer', () => {
		// Instagram, Facebook and X ignore the audio mode in their providers,
		// so asking for audio there would only mislabel the status message.
		expect(resolveDownloadMode('mp3', 'Instagram')).toBe('auto');
		expect(resolveDownloadMode('mp3', 'Facebook')).toBe('auto');
		expect(resolveDownloadMode('mp3', 'Twitter')).toBe('auto');
	});

	it('forces audio for SoundCloud and Spotify regardless of preference', () => {
		expect(resolveDownloadMode('video', 'SoundCloud')).toBe('audio');
		expect(resolveDownloadMode('video', 'Spotify')).toBe('audio');
		expect(resolveDownloadMode(null, 'SoundCloud')).toBe('audio');
	});

	it('treats an unknown stored value as video', () => {
		expect(resolveDownloadMode('hd' as DownloadMode, 'YouTube')).toBe('auto');
	});
});

// ─── getUserDownloadMode / setUserDownloadMode ───────────────────────────────

function fakeDb(
	initial: Record<number, string> = {},
	throwOnSelect = false,
	throwOnRun = false,
): { db: D1Database; rows: Map<number, string> } {
	const rows = new Map<number, string>(Object.entries(initial).map(([k, v]) => [Number(k), v]));
	const db = {
		prepare(sql: string) {
			return {
				bind(...args: unknown[]) {
					return {
						first: async () => {
							if (throwOnSelect) throw new Error('no such column: download_mode');
							if (!sql.includes('SELECT')) return null;
							const value = rows.get(args[0] as number);
							return value === undefined ? null : { download_mode: value };
						},
						run: async () => {
							if (throwOnRun) throw new Error('no such column: download_mode');
							if (sql.includes('INSERT')) rows.set(args[0] as number, args[1] as string);
						},
					};
				},
			};
		},
	} as unknown as D1Database;
	return { db, rows };
}

describe('getUserDownloadMode', () => {
	it('returns the stored preference', async () => {
		const { db } = fakeDb({ 801062947: 'mp3' });
		expect(await getUserDownloadMode(db, 801062947)).toBe('mp3');
	});

	it('returns null when the user has no row yet', async () => {
		const { db } = fakeDb();
		expect(await getUserDownloadMode(db, 801062947)).toBeNull();
	});

	it('returns null for an unknown stored value', async () => {
		const { db } = fakeDb({ 801062947: 'hd' });
		expect(await getUserDownloadMode(db, 801062947)).toBeNull();
	});

	it('returns null when the column does not exist yet (migration not applied)', async () => {
		const { db } = fakeDb({ 801062947: 'mp3' }, true);
		expect(await getUserDownloadMode(db, 801062947)).toBeNull();
	});
});

describe('setUserDownloadMode', () => {
	it('stores the preference and returns true', async () => {
		const { db, rows } = fakeDb();
		expect(await setUserDownloadMode(db, 801062947, 'mp3')).toBe(true);
		expect(rows.get(801062947)).toBe('mp3');
		expect(await getUserDownloadMode(db, 801062947)).toBe('mp3');
	});

	it('ignores an invalid mode instead of storing it', async () => {
		const { db, rows } = fakeDb();
		expect(await setUserDownloadMode(db, 801062947, 'hd')).toBe(false);
		expect(rows.has(801062947)).toBe(false);
	});

	it('returns false when the column does not exist yet (migration not applied)', async () => {
		const { db } = fakeDb({}, false, true);
		expect(await setUserDownloadMode(db, 801062947, 'mp3')).toBe(false);
	});
});

// ─── i18n ────────────────────────────────────────────────────────────────────

describe('mode i18n keys', () => {
	for (const key of ['mode.current', 'mode.pick', 'mode.changed', 'mode.save_failed', 'mode.video', 'mode.mp3'] as const) {
		it(`resolves ${key} in English and Arabic`, () => {
			expect(t('en', key)).not.toBe(key);
			expect(t('ar', key)).not.toBe(key);
		});
	}
});
