/**
 * Daily usage summary, sent to the admin by the 23:00 Riyadh cron
 * (20:00 UTC, `0 20 * * *` in wrangler.bot.jsonc).
 *
 * Headline numbers come from `daily_stats` (exact per-day counters). The
 * top-platform / top-user / top-failure lists read the rolling
 * `download_history` (last 100 rows) and `failed_downloads` (last 200),
 * so on a very busy day they describe the recent window, not the whole day.
 */
import { createBot } from './bot-factory';
import { getUserLang } from '../../utils/db';
import { getStatsReport } from '../../utils/stats-d1';
import { t, DEFAULT_LOCALE, type Locale } from '../../i18n';
import { log } from '../../utils/logger';

/** The cron expression in wrangler.bot.jsonc; the scheduled handler only runs for it. */
export const DAILY_SUMMARY_CRON = '0 20 * * *';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function startOfTodayUtc(): number {
	const d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	return d.getTime();
}

function todayDateUtc(): string {
	return new Date().toISOString().slice(0, 10);
}

export async function getNewUsersToday(db: D1Database): Promise<number> {
	const row = await db.prepare(`SELECT COUNT(*) AS n FROM user_stats WHERE first_seen >= ?`).bind(startOfTodayUtc()).first<{ n: number }>();
	return row?.n ?? 0;
}

export async function getTopPlatformsToday(db: D1Database, limit = 3): Promise<Array<{ platform: string; count: number }>> {
	const result = await db
		.prepare(`SELECT platform, COUNT(*) AS n FROM download_history WHERE timestamp >= ? GROUP BY platform ORDER BY n DESC LIMIT ?`)
		.bind(startOfTodayUtc(), limit)
		.all<{ platform: string; n: number }>();
	return result.results.map((r) => ({ platform: r.platform, count: r.n }));
}

export async function getTopUsersToday(
	db: D1Database,
	limit = 3,
): Promise<Array<{ userId: number; firstName: string; username?: string; count: number }>> {
	const result = await db
		.prepare(
			`SELECT user_id, first_name, username, COUNT(*) AS n FROM download_history WHERE timestamp >= ? GROUP BY user_id ORDER BY n DESC LIMIT ?`,
		)
		.bind(startOfTodayUtc(), limit)
		.all<{ user_id: number; first_name: string; username: string | null; n: number }>();
	return result.results.map((r) => ({
		userId: r.user_id,
		firstName: r.first_name,
		username: r.username ?? undefined,
		count: r.n,
	}));
}

export async function getTopFailureToday(db: D1Database): Promise<{ reason: string; count: number } | null> {
	const row = await db
		.prepare(`SELECT error_reason, COUNT(*) AS n FROM failed_downloads WHERE timestamp >= ? GROUP BY error_reason ORDER BY n DESC LIMIT 1`)
		.bind(startOfTodayUtc())
		.first<{ error_reason: string; n: number }>();
	return row ? { reason: row.error_reason, count: row.n } : null;
}

export async function buildDailySummaryText(db: D1Database, locale: Locale): Promise<string> {
	const [report, newUsers, topPlatforms, topUsers, topFailure] = await Promise.all([
		getStatsReport(db),
		getNewUsersToday(db),
		getTopPlatformsToday(db),
		getTopUsersToday(db),
		getTopFailureToday(db),
	]);

	const lines: string[] = [t(locale, 'daily_summary.header', { date: todayDateUtc() }), ''];
	lines.push(t(locale, 'daily_summary.links', { links: String(report.today.links) }));
	lines.push(t(locale, 'daily_summary.success', { success: String(report.today.success) }));
	lines.push(t(locale, 'daily_summary.errors', { errors: String(report.today.errors) }));
	lines.push(t(locale, 'daily_summary.new_users', { count: String(newUsers) }));
	lines.push(
		t(locale, 'daily_summary.gate', {
			blocked: String(report.today.gateBlocked),
			verified: String(report.today.gateVerified),
		}),
	);

	if (report.today.links === 0) {
		lines.push(t(locale, 'daily_summary.empty'));
	} else {
		if (topPlatforms.length > 0) {
			lines.push('', t(locale, 'daily_summary.top_platforms'));
			for (const p of topPlatforms) {
				lines.push(t(locale, 'daily_summary.row', { name: escapeHtml(p.platform), count: String(p.count) }));
			}
		}
		if (topUsers.length > 0) {
			lines.push('', t(locale, 'daily_summary.top_users'));
			for (const u of topUsers) {
				const name = u.username ? `${u.firstName} (@${u.username})` : u.firstName;
				lines.push(t(locale, 'daily_summary.row', { name: escapeHtml(name), count: String(u.count) }));
			}
		}
		if (topFailure) {
			lines.push('', t(locale, 'daily_summary.top_failure', { reason: escapeHtml(topFailure.reason), count: String(topFailure.count) }));
		}
	}

	lines.push(
		'',
		t(locale, 'daily_summary.total', {
			links: String(report.global.totalLinks),
			users: String(report.global.totalUniqueUsers),
		}),
	);
	return lines.join('\n');
}

/** Build the summary in the admin's language and DM it to the admin. */
export async function sendDailySummary(env: Env): Promise<void> {
	const db = env.download_media_bot_db;
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);
	const storedLang = await getUserLang(db, adminId).catch(() => null);
	const locale: Locale = storedLang === 'ar' || storedLang === 'en' ? storedLang : DEFAULT_LOCALE;
	const text = await buildDailySummaryText(db, locale);
	const bot = createBot(env);
	await bot.api.sendMessage(adminId, text, { parse_mode: 'HTML' });
	log('info', 'daily-summary', 'Daily summary sent', { adminId });
}
