import { describe, it, expect } from 'vitest';
import {
	buildDailySummaryText,
	getNewUsersToday,
	getTopFailureToday,
	getTopPlatformsToday,
	getTopUsersToday,
} from '../src/services/telegram-bot/daily-summary';

// Fake D1 routing on SQL substrings, mirroring test/download-mode.spec.ts.
function fakeDb(data: {
	global: Record<string, unknown>;
	today: Record<string, unknown>;
	totalUsers: number;
	newUsers: number;
	topPlatforms: Array<{ platform: string; n: number }>;
	topUsers: Array<{ user_id: number; first_name: string; username: string | null; n: number }>;
	topFailure: { error_reason: string; n: number } | null;
}): D1Database {
	const db = {
		prepare(sql: string) {
			// Real D1 statements expose first/all/run directly AND via bind().
			// getStatsReport calls .first() without bind; the helpers bind first.
			const stmt = {
				bind(..._args: unknown[]) {
					return stmt;
				},
				first: async () => {
					if (sql.includes('FROM global_stats')) return data.global;
					if (sql.includes('FROM daily_stats')) return data.today;
					if (sql.includes('first_seen')) return { n: data.newUsers };
					if (sql.includes('FROM user_stats WHERE count > 0')) return { n: data.totalUsers };
					if (sql.includes('FROM failed_downloads')) return data.topFailure;
					return null;
				},
				all: async () => {
					if (sql.includes("scope = 'global'")) {
						return {
							results: [
								{ platform: 'YouTube', count: 60 },
								{ platform: 'TikTok', count: 40 },
							],
						};
					}
					if (sql.includes('FROM download_history') && sql.includes('GROUP BY platform')) {
						return { results: data.topPlatforms };
					}
					if (sql.includes('FROM download_history') && sql.includes('GROUP BY user_id')) {
						return { results: data.topUsers };
					}
					return { results: [] };
				},
				run: async () => ({ meta: { changes: 0 } }),
			};
			return stmt;
		},
		batch: async () => [],
	};
	return db as unknown as D1Database;
}

const HOURS = `[${new Array(24).fill(0).join(',')}]`;

const busyDay = () =>
	fakeDb({
		global: {
			total_links: 100,
			total_success: 90,
			total_errors: 10,
			total_start_users: 80,
			total_gate_blocked: 5,
			total_gate_verified: 12,
			total_gate_still_blocked: 2,
			hourly_distribution: HOURS,
		},
		today: { links: 5, success: 4, errors: 1, gate_blocked: 1, gate_verified: 3 },
		totalUsers: 50,
		newUsers: 2,
		topPlatforms: [
			{ platform: 'YouTube', n: 3 },
			{ platform: 'TikTok', n: 2 },
		],
		topUsers: [
			{ user_id: 1, first_name: 'Dawood', username: 'dawood', n: 2 },
			{ user_id: 2, first_name: 'Sara', username: null, n: 1 },
		],
		topFailure: { error_reason: 'No media found', n: 1 },
	});

const quietDay = () =>
	fakeDb({
		global: {
			total_links: 100,
			total_success: 90,
			total_errors: 10,
			total_start_users: 80,
			total_gate_blocked: 5,
			total_gate_verified: 12,
			total_gate_still_blocked: 2,
			hourly_distribution: HOURS,
		},
		today: { links: 0, success: 0, errors: 0, gate_blocked: 0, gate_verified: 0 },
		totalUsers: 50,
		newUsers: 0,
		topPlatforms: [],
		topUsers: [],
		topFailure: null,
	});

describe('daily summary helpers', () => {
	it('reads new users, top platforms, top users and top failure for today', async () => {
		const db = busyDay();
		await expect(getNewUsersToday(db)).resolves.toBe(2);
		await expect(getTopPlatformsToday(db)).resolves.toEqual([
			{ platform: 'YouTube', count: 3 },
			{ platform: 'TikTok', count: 2 },
		]);
		await expect(getTopUsersToday(db)).resolves.toEqual([
			{ userId: 1, firstName: 'Dawood', username: 'dawood', count: 2 },
			{ userId: 2, firstName: 'Sara', username: undefined, count: 1 },
		]);
		await expect(getTopFailureToday(db)).resolves.toEqual({ reason: 'No media found', count: 1 });
	});

	it('returns null for the top failure when nothing failed today', async () => {
		await expect(getTopFailureToday(quietDay())).resolves.toBeNull();
	});
});

describe('buildDailySummaryText', () => {
	it('renders the busy day in English', async () => {
		const text = await buildDailySummaryText(busyDay(), 'en');
		const today = new Date().toISOString().slice(0, 10);
		expect(text).toContain(`Daily summary — ${today}`);
		expect(text).toContain('📥 Links today: <b>5</b>');
		expect(text).toContain('✅ Successful: <b>4</b>');
		expect(text).toContain('❌ Failed: <b>1</b>');
		expect(text).toContain('🆕 New users today: <b>2</b>');
		expect(text).toContain('🚪 Gate: <b>1</b> blocked · <b>3</b> verified');
		expect(text).toContain('YouTube — <b>3</b>');
		expect(text).toContain('Dawood (@dawood) — <b>2</b>');
		expect(text).toContain('Sara — <b>1</b>');
		expect(text).toContain('⚠️ Most common failure: No media found (<b>1</b>)');
		expect(text).toContain('📈 All time: <b>100</b> links · <b>50</b> users');
	});

	it('renders the busy day in Arabic', async () => {
		const text = await buildDailySummaryText(busyDay(), 'ar');
		expect(text).toContain('ملخص اليوم');
		expect(text).toContain('📥 روابط اليوم: <b>5</b>');
		expect(text).toContain('✅ ناجح: <b>4</b>');
		expect(text).toContain('📱 <b>أهم المنصات:</b>');
	});

	it('renders the quiet day without top sections', async () => {
		const text = await buildDailySummaryText(quietDay(), 'en');
		expect(text).toContain('No downloads yet today.');
		expect(text).not.toContain('Top platforms');
		expect(text).not.toContain('Top users');
		expect(text).not.toContain('Most common failure');
		expect(text).toContain('📈 All time: <b>100</b> links · <b>50</b> users');
	});
});
