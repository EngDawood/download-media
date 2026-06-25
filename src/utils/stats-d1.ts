import { DOWNLOAD_HISTORY_LIMIT, FAILED_DOWNLOAD_LIMIT } from '../constants';

export interface UserStats {
	count: number;
	firstName: string;
	username?: string;
	platforms: Record<string, number>;
	failures: number;
	lastSeen: number;
	firstSeen: number;
}

export interface DownloadHistoryEntry {
	url: string;
	platform: string;
	userId: number;
	username?: string;
	firstName: string;
	timestamp: number;
	success: boolean;
	durationMs?: number;
	fileSizeBytes?: number;
}

export interface FailedDownloadEntry {
	url: string;
	platform: string;
	errorReason: string;
	timestamp: number;
	userId: number;
	firstName: string;
	username?: string;
	mode?: string;
}

export interface StatsReport {
	global: {
		totalLinks: number;
		totalSuccess: number;
		totalErrors: number;
		totalUniqueUsers: number;
		totalStartUsers: number;
		platforms: Record<string, number>;
		topUsers: Array<{ userId: number; firstName: string; username?: string; count: number }>;
		totalGateBlocked: number;
		totalGateVerified: number;
		totalGateStillBlocked: number;
		hourlyDistribution: number[];
	};
	today: { links: number; success: number; errors: number; gateBlocked: number; gateVerified: number };
}

const DAY_TTL_MS = 30 * 24 * 3600 * 1000;

function getTodayDate(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

export async function incrementLinkStats(
	db: D1Database,
	opts: { userId: number; firstName: string; platform: string },
): Promise<void> {
	const now = Date.now();
	const todayDate = getTodayDate();
	const expiresAt = now + DAY_TTL_MS;

	const existing = await db
		.prepare(`SELECT 1 FROM user_stats WHERE user_id = ?`)
		.bind(opts.userId)
		.first();
	const isNew = !existing;

	await db.batch([
		db.prepare(
			`INSERT INTO user_stats (user_id, first_name, count, failures, platforms, last_seen, first_seen)
			 VALUES (?, ?, 0, 0, '{}', ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET first_name = excluded.first_name`,
		).bind(opts.userId, opts.firstName, now, now),
		db.prepare(
			`UPDATE global_stats SET total_links = total_links + 1${isNew ? ', total_unique_users = total_unique_users + 1' : ''} WHERE id = 1`,
		),
		db.prepare(
			`INSERT INTO daily_stats (date, links, success, errors, gate_blocked, gate_verified, expires_at)
			 VALUES (?, 1, 0, 0, 0, 0, ?)
			 ON CONFLICT(date) DO UPDATE SET links = links + 1`,
		).bind(todayDate, expiresAt),
	]);
}

export async function incrementSuccessStats(
	db: D1Database,
	opts: { userId: number; firstName: string; platform: string; username?: string },
): Promise<void> {
	const now = Date.now();
	const hour = new Date().getUTCHours();
	const todayDate = getTodayDate();
	const expiresAt = now + DAY_TTL_MS;

	// All updates are atomic SQL — no read-modify-write, safe under concurrency.
	await db.batch([
		db.prepare(
			`INSERT INTO user_stats (user_id, first_name, username, count, failures, platforms, last_seen, first_seen)
			 VALUES (?, ?, ?, 1, 0, json_object(?, 1), ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET
			   count = count + 1,
			   first_name = excluded.first_name,
			   username = COALESCE(excluded.username, username),
			   platforms = json_set(
			     platforms, '$.' || ?,
			     COALESCE(CAST(json_extract(platforms, '$.' || ?) AS INTEGER), 0) + 1
			   ),
			   last_seen = excluded.last_seen`,
		).bind(opts.userId, opts.firstName, opts.username ?? null, opts.platform, now, now, opts.platform, opts.platform),
		db.prepare(
			`INSERT INTO platform_counts (scope, platform, count) VALUES ('global', ?, 1)
			 ON CONFLICT(scope, platform) DO UPDATE SET count = count + 1`,
		).bind(opts.platform),
		db.prepare(
			`UPDATE global_stats SET
			   total_success = total_success + 1,
			   hourly_distribution = json_set(
			     hourly_distribution, '$[' || ? || ']',
			     CAST(json_extract(hourly_distribution, '$[' || ? || ']') AS INTEGER) + 1
			   )
			 WHERE id = 1`,
		).bind(hour, hour),
		db.prepare(
			`INSERT INTO daily_stats (date, links, success, errors, gate_blocked, gate_verified, expires_at)
			 VALUES (?, 0, 1, 0, 0, 0, ?)
			 ON CONFLICT(date) DO UPDATE SET success = success + 1`,
		).bind(todayDate, expiresAt),
	]);
}

export async function incrementErrorStats(
	db: D1Database,
	opts?: { userId?: number; firstName?: string; username?: string },
): Promise<void> {
	const now = Date.now();
	const todayDate = getTodayDate();
	const expiresAt = now + DAY_TTL_MS;

	const stmts: D1PreparedStatement[] = [
		db.prepare(`UPDATE global_stats SET total_errors = total_errors + 1 WHERE id = 1`),
		db.prepare(
			`INSERT INTO daily_stats (date, links, success, errors, gate_blocked, gate_verified, expires_at)
			 VALUES (?, 0, 0, 1, 0, 0, ?)
			 ON CONFLICT(date) DO UPDATE SET errors = errors + 1`,
		).bind(todayDate, expiresAt),
	];

	if (opts?.userId) {
		stmts.push(
			db.prepare(
				`INSERT INTO user_stats (user_id, first_name, username, count, failures, platforms, last_seen, first_seen)
				 VALUES (?, ?, ?, 0, 1, '{}', ?, ?)
				 ON CONFLICT(user_id) DO UPDATE SET
				   failures = failures + 1,
				   first_name = excluded.first_name,
				   username = COALESCE(excluded.username, username),
				   last_seen = excluded.last_seen`,
			).bind(opts.userId, opts.firstName ?? '', opts.username ?? null, now, now),
		);
	}

	await db.batch(stmts);
}

export async function incrementGateBlocked(db: D1Database): Promise<void> {
	const expiresAt = Date.now() + DAY_TTL_MS;
	await db.batch([
		db.prepare(`UPDATE global_stats SET total_gate_blocked = total_gate_blocked + 1 WHERE id = 1`),
		db.prepare(
			`INSERT INTO daily_stats (date, links, success, errors, gate_blocked, gate_verified, expires_at)
			 VALUES (?, 0, 0, 0, 1, 0, ?)
			 ON CONFLICT(date) DO UPDATE SET gate_blocked = gate_blocked + 1`,
		).bind(getTodayDate(), expiresAt),
	]);
}

export async function incrementGateVerified(db: D1Database): Promise<void> {
	const expiresAt = Date.now() + DAY_TTL_MS;
	await db.batch([
		db.prepare(`UPDATE global_stats SET total_gate_verified = total_gate_verified + 1 WHERE id = 1`),
		db.prepare(
			`INSERT INTO daily_stats (date, links, success, errors, gate_blocked, gate_verified, expires_at)
			 VALUES (?, 0, 0, 0, 0, 1, ?)
			 ON CONFLICT(date) DO UPDATE SET gate_verified = gate_verified + 1`,
		).bind(getTodayDate(), expiresAt),
	]);
}

export async function incrementGateStillBlocked(db: D1Database): Promise<void> {
	await db.prepare(`UPDATE global_stats SET total_gate_still_blocked = total_gate_still_blocked + 1 WHERE id = 1`).run();
}

export async function incrementStartUsers(db: D1Database, userId: number): Promise<void> {
	const existing = await db
		.prepare(`SELECT started FROM user_stats WHERE user_id = ?`)
		.bind(userId)
		.first<{ started: number }>();
	if (existing?.started === 1) return;

	const now = Date.now();
	await db.batch([
		db.prepare(
			`INSERT INTO user_stats (user_id, first_name, count, failures, platforms, last_seen, first_seen, started)
			 VALUES (?, '', 0, 0, '{}', ?, ?, 1)
			 ON CONFLICT(user_id) DO UPDATE SET started = 1`,
		).bind(userId, now, now),
		db.prepare(`UPDATE global_stats SET total_start_users = total_start_users + 1 WHERE id = 1`),
	]);
}

export async function getStatsReport(db: D1Database): Promise<StatsReport> {
	const todayDate = getTodayDate();

	const [globalRow, todayRow, topUsersResult, platformResult] = await Promise.all([
		db.prepare(`SELECT * FROM global_stats WHERE id = 1`).first<Record<string, unknown>>(),
		db.prepare(`SELECT * FROM daily_stats WHERE date = ?`).bind(todayDate).first<Record<string, unknown>>(),
		db.prepare(`SELECT user_id, first_name, username, count FROM user_stats ORDER BY count DESC LIMIT 10`).all<{
			user_id: number; first_name: string; username: string | null; count: number;
		}>(),
		db.prepare(`SELECT platform, count FROM platform_counts WHERE scope = 'global'`).all<{
			platform: string; count: number;
		}>(),
	]);

	const platforms: Record<string, number> = {};
	for (const row of platformResult.results) {
		platforms[row.platform] = row.count;
	}

	const topUsers = topUsersResult.results.map((r) => ({
		userId: r.user_id,
		firstName: r.first_name,
		username: r.username ?? undefined,
		count: r.count,
	}));

	return {
		global: {
			totalLinks: (globalRow?.total_links as number) ?? 0,
			totalSuccess: (globalRow?.total_success as number) ?? 0,
			totalErrors: (globalRow?.total_errors as number) ?? 0,
			totalUniqueUsers: (globalRow?.total_unique_users as number) ?? 0,
			totalStartUsers: (globalRow?.total_start_users as number) ?? 0,
			platforms,
			topUsers,
			totalGateBlocked: (globalRow?.total_gate_blocked as number) ?? 0,
			totalGateVerified: (globalRow?.total_gate_verified as number) ?? 0,
			totalGateStillBlocked: (globalRow?.total_gate_still_blocked as number) ?? 0,
			hourlyDistribution: globalRow?.hourly_distribution
				? JSON.parse(globalRow.hourly_distribution as string)
				: new Array(24).fill(0),
		},
		today: {
			links: (todayRow?.links as number) ?? 0,
			success: (todayRow?.success as number) ?? 0,
			errors: (todayRow?.errors as number) ?? 0,
			gateBlocked: (todayRow?.gate_blocked as number) ?? 0,
			gateVerified: (todayRow?.gate_verified as number) ?? 0,
		},
	};
}

export async function getDailyStats(
	db: D1Database,
	days = 7,
): Promise<Array<{ date: string; links: number; success: number; errors: number; gateBlocked: number }>> {
	const dates: string[] = [];
	for (let i = 0; i < days; i++) {
		const d = new Date();
		d.setUTCDate(d.getUTCDate() - i);
		dates.push(
			`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
		);
	}

	const placeholders = dates.map(() => '?').join(',');
	const result = await db
		.prepare(
			`SELECT date, links, success, errors, gate_blocked FROM daily_stats
			 WHERE date IN (${placeholders}) AND (expires_at IS NULL OR expires_at > ?)`,
		)
		.bind(...dates, Date.now())
		.all<{ date: string; links: number; success: number; errors: number; gate_blocked: number }>();

	const rowMap: Record<string, (typeof result.results)[0]> = {};
	for (const row of result.results) rowMap[row.date] = row;

	return dates.map((date) => ({
		date,
		links: rowMap[date]?.links ?? 0,
		success: rowMap[date]?.success ?? 0,
		errors: rowMap[date]?.errors ?? 0,
		gateBlocked: rowMap[date]?.gate_blocked ?? 0,
	}));
}

function mapHistoryRow(r: Record<string, unknown>): DownloadHistoryEntry {
	return {
		url: r.url as string,
		platform: r.platform as string,
		userId: r.user_id as number,
		username: (r.username as string | null) ?? undefined,
		firstName: r.first_name as string,
		timestamp: r.timestamp as number,
		success: r.success === 1,
		durationMs: (r.duration_ms as number | null) ?? undefined,
		fileSizeBytes: (r.file_size_bytes as number | null) ?? undefined,
	};
}

export async function addDownloadHistory(
	db: D1Database,
	entry: Omit<DownloadHistoryEntry, 'timestamp'>,
): Promise<void> {
	const now = Date.now();
	await db.batch([
		db.prepare(
			`INSERT INTO download_history (url, platform, user_id, username, first_name, timestamp, success, duration_ms, file_size_bytes)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).bind(
			entry.url, entry.platform, entry.userId, entry.username ?? null, entry.firstName,
			now, entry.success ? 1 : 0, entry.durationMs ?? null, entry.fileSizeBytes ?? null,
		),
		db.prepare(
			`DELETE FROM download_history WHERE id NOT IN (SELECT id FROM download_history ORDER BY timestamp DESC LIMIT ${DOWNLOAD_HISTORY_LIMIT})`,
		),
	]);
}

export async function getDownloadHistory(db: D1Database, limit = 20): Promise<DownloadHistoryEntry[]> {
	const result = await db
		.prepare(`SELECT * FROM download_history ORDER BY timestamp DESC LIMIT ?`)
		.bind(limit)
		.all<Record<string, unknown>>();
	return result.results.map(mapHistoryRow);
}

export async function getTodayDownloadHistory(db: D1Database, limit = 50): Promise<DownloadHistoryEntry[]> {
	const startOfDay = new Date();
	startOfDay.setUTCHours(0, 0, 0, 0);
	const result = await db
		.prepare(`SELECT * FROM download_history WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?`)
		.bind(startOfDay.getTime(), limit)
		.all<Record<string, unknown>>();
	return result.results.map(mapHistoryRow);
}

export async function addFailedDownload(
	db: D1Database,
	entry: Omit<FailedDownloadEntry, 'timestamp'>,
): Promise<void> {
	const now = Date.now();
	await db.batch([
		db.prepare(
			`INSERT INTO failed_downloads (url, platform, error_reason, timestamp, user_id, first_name, username, mode)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		).bind(entry.url, entry.platform, entry.errorReason, now, entry.userId, entry.firstName, entry.username ?? null, entry.mode ?? null),
		db.prepare(
			`DELETE FROM failed_downloads WHERE id NOT IN (SELECT id FROM failed_downloads ORDER BY timestamp DESC LIMIT ${FAILED_DOWNLOAD_LIMIT})`,
		),
	]);
}

export async function getFailedDownloads(db: D1Database, limit = 20): Promise<FailedDownloadEntry[]> {
	const result = await db
		.prepare(`SELECT * FROM failed_downloads ORDER BY timestamp DESC LIMIT ?`)
		.bind(limit)
		.all<Record<string, unknown>>();
	return result.results.map((r) => ({
		url: r.url as string,
		platform: r.platform as string,
		errorReason: r.error_reason as string,
		timestamp: r.timestamp as number,
		userId: r.user_id as number,
		firstName: r.first_name as string,
		username: (r.username as string | null) ?? undefined,
		mode: (r.mode as string | null) ?? undefined,
	}));
}

export async function blockUser(
	db: D1Database,
	userId: number,
	info: { username?: string; firstName: string },
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO blocked_users (user_id, username, first_name, blocked_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name`,
		)
		.bind(userId, info.username ?? null, info.firstName, Date.now())
		.run();
}

export async function unblockUser(db: D1Database, userId: number): Promise<boolean> {
	const result = await db.prepare(`DELETE FROM blocked_users WHERE user_id = ?`).bind(userId).run();
	return result.meta.changes > 0;
}

export async function isUserBlocked(db: D1Database, userId: number): Promise<boolean> {
	const row = await db.prepare(`SELECT 1 FROM blocked_users WHERE user_id = ?`).bind(userId).first();
	return row !== null;
}

export async function getBlockedUsers(
	db: D1Database,
): Promise<Array<{ userId: number; username?: string; firstName: string; blockedAt: number }>> {
	const result = await db
		.prepare(`SELECT user_id, username, first_name, blocked_at FROM blocked_users ORDER BY blocked_at DESC`)
		.all<{ user_id: number; username: string | null; first_name: string; blocked_at: number }>();
	return result.results.map((r) => ({
		userId: r.user_id,
		username: r.username ?? undefined,
		firstName: r.first_name,
		blockedAt: r.blocked_at,
	}));
}

export async function addDomainToAllowlist(db: D1Database, hostname: string): Promise<void> {
	await db.prepare(`INSERT OR IGNORE INTO domain_allowlist (hostname) VALUES (?)`).bind(hostname).run();
}

export async function removeDomainFromAllowlist(db: D1Database, hostname: string): Promise<boolean> {
	const result = await db.prepare(`DELETE FROM domain_allowlist WHERE hostname = ?`).bind(hostname).run();
	return result.meta.changes > 0;
}

export async function getAllowlist(db: D1Database): Promise<string[]> {
	const result = await db.prepare(`SELECT hostname FROM domain_allowlist`).all<{ hostname: string }>();
	return result.results.map((r) => r.hostname);
}

export async function isDomainAllowlisted(db: D1Database, url: string): Promise<boolean> {
	try {
		const hostname = new URL(url).hostname.replace(/^www\./, '');
		const row = await db.prepare(`SELECT 1 FROM domain_allowlist WHERE hostname = ?`).bind(hostname).first();
		return row !== null;
	} catch {
		return false;
	}
}
