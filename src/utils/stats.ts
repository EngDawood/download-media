import {
	KV_KEY_STATS_GLOBAL,
	KV_KEY_STATS_DAY_PREFIX,
	KV_KEY_STATS_USER_PREFIX,
	KV_KEY_STATS_STARTED_PREFIX,
	KV_KEY_DOWNLOAD_HISTORY,
	KV_KEY_BLOCKED_USERS,
	KV_KEY_DOMAIN_ALLOWLIST,
	DOWNLOAD_HISTORY_LIMIT,
	KV_KEY_FAILED_DOWNLOADS,
	FAILED_DOWNLOAD_LIMIT,
} from '../constants';

interface GlobalStats {
	totalLinks: number;
	totalSuccess: number;
	totalErrors: number;
	totalUniqueUsers: number;
	totalStartUsers: number;
	platforms: Record<string, number>;
	platformErrors?: Record<string, number>;
	topUsers: Array<{ userId: number; firstName: string; count: number }>;
}

interface DayStats {
	links: number;
	success: number;
}

interface UserStats {
	count: number;
	firstName: string;
}

export interface DownloadHistoryEntry {
	url: string;
	platform: string;
	userId: number;
	username?: string;
	firstName: string;
	timestamp: number;
	success: boolean;
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
	global: GlobalStats;
	today: DayStats;
}

const TOP_USERS_LIMIT = 10;
const DAY_TTL_SECONDS = 30 * 24 * 3600;

function defaultGlobal(): GlobalStats {
	return { totalLinks: 0, totalSuccess: 0, totalErrors: 0, totalUniqueUsers: 0, totalStartUsers: 0, platforms: {}, topUsers: [] };
}

function getTodayKey(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	return `${KV_KEY_STATS_DAY_PREFIX}${yyyy}-${mm}-${dd}`;
}

async function readGlobal(kv: KVNamespace): Promise<GlobalStats> {
	const raw = await kv.get(KV_KEY_STATS_GLOBAL);
	if (!raw) return defaultGlobal();
	try {
		return JSON.parse(raw) as GlobalStats;
	} catch {
		return defaultGlobal();
	}
}

async function writeGlobal(kv: KVNamespace, stats: GlobalStats): Promise<void> {
	await kv.put(KV_KEY_STATS_GLOBAL, JSON.stringify(stats));
}

async function updateDay(kv: KVNamespace, field: 'links' | 'success'): Promise<void> {
	const key = getTodayKey();
	const raw = await kv.get(key);
	const day: DayStats = raw ? (JSON.parse(raw) as DayStats) : { links: 0, success: 0 };
	day[field]++;
	await kv.put(key, JSON.stringify(day), { expirationTtl: DAY_TTL_SECONDS });
}

/**
 * Called when a supported URL is detected — counts link submissions and unique users.
 */
export async function incrementLinkStats(
	kv: KVNamespace,
	opts: { userId: number; firstName: string; platform: string },
): Promise<void> {
	const userKey = `${KV_KEY_STATS_USER_PREFIX}${opts.userId}`;
	const [global, userRaw] = await Promise.all([readGlobal(kv), kv.get(userKey), updateDay(kv, 'links')]);

	global.totalLinks++;
	if (!userRaw) {
		global.totalUniqueUsers++;
	}

	await writeGlobal(kv, global);
}

/**
 * Called on a successful download — counts successes, per-platform, and top users.
 */
export async function incrementSuccessStats(
	kv: KVNamespace,
	opts: { userId: number; firstName: string; platform: string },
): Promise<void> {
	const userKey = `${KV_KEY_STATS_USER_PREFIX}${opts.userId}`;
	const [global, userRaw] = await Promise.all([readGlobal(kv), kv.get(userKey), updateDay(kv, 'success')]);

	global.totalSuccess++;
	global.platforms[opts.platform] = (global.platforms[opts.platform] ?? 0) + 1;

	const existingIdx = global.topUsers.findIndex((u) => u.userId === opts.userId);
	if (existingIdx >= 0) {
		global.topUsers[existingIdx].count++;
		global.topUsers[existingIdx].firstName = opts.firstName;
	} else {
		global.topUsers.push({ userId: opts.userId, firstName: opts.firstName, count: 1 });
	}
	global.topUsers.sort((a, b) => b.count - a.count);
	global.topUsers = global.topUsers.slice(0, TOP_USERS_LIMIT);

	const userStats: UserStats = userRaw ? (JSON.parse(userRaw) as UserStats) : { count: 0, firstName: opts.firstName };
	userStats.count++;
	userStats.firstName = opts.firstName;

	await Promise.all([writeGlobal(kv, global), kv.put(userKey, JSON.stringify(userStats))]);
}

/**
 * Called on a failed or empty download.
 */
export async function incrementErrorStats(kv: KVNamespace, platform?: string): Promise<void> {
	const global = await readGlobal(kv);
	global.totalErrors++;
	if (platform) {
		global.platformErrors = global.platformErrors ?? {};
		global.platformErrors[platform] = (global.platformErrors[platform] ?? 0) + 1;
	}
	await writeGlobal(kv, global);
}

/**
 * Increments the count of unique users who have used /start.
 * Only counts each user once.
 */
export async function incrementStartUsers(kv: KVNamespace, userId: number): Promise<void> {
	const startedKey = `${KV_KEY_STATS_STARTED_PREFIX}${userId}`;
	const [global, alreadyStarted] = await Promise.all([readGlobal(kv), kv.get(startedKey)]);
	if (alreadyStarted) return;
	global.totalStartUsers = (global.totalStartUsers ?? 0) + 1;
	await Promise.all([writeGlobal(kv, global), kv.put(startedKey, '1')]);
}

/**
 * Returns stats for the last N days (most recent first).
 */
export async function getDailyStats(kv: KVNamespace, days = 7): Promise<Array<{ date: string; links: number; success: number }>> {
	const dates: string[] = [];
	for (let i = 0; i < days; i++) {
		const d = new Date();
		d.setUTCDate(d.getUTCDate() - i);
		const yyyy = d.getUTCFullYear();
		const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
		const dd = String(d.getUTCDate()).padStart(2, '0');
		dates.push(`${yyyy}-${mm}-${dd}`);
	}
	const results = await Promise.all(dates.map((date) => kv.get(`${KV_KEY_STATS_DAY_PREFIX}${date}`)));
	return dates.map((date, i) => {
		const raw = results[i];
		if (!raw) return { date, links: 0, success: 0 };
		try {
			const day = JSON.parse(raw) as DayStats;
			return { date, links: day.links, success: day.success };
		} catch {
			return { date, links: 0, success: 0 };
		}
	});
}

/**
 * Returns global stats + today's summary for the /stats command.
 */
export async function getStatsReport(kv: KVNamespace): Promise<StatsReport> {
	const [global, dayRaw] = await Promise.all([readGlobal(kv), kv.get(getTodayKey())]);
	const today: DayStats = dayRaw ? (JSON.parse(dayRaw) as DayStats) : { links: 0, success: 0 };
	return { global, today };
}

/**
 * Add a download entry to the history log.
 */
export async function addDownloadHistory(
	kv: KVNamespace,
	entry: Omit<DownloadHistoryEntry, 'timestamp'>,
): Promise<void> {
	const raw = await kv.get(KV_KEY_DOWNLOAD_HISTORY);
	const history: DownloadHistoryEntry[] = raw ? JSON.parse(raw) : [];
	history.unshift({ ...entry, timestamp: Date.now() });
	// Keep only last N entries
	const trimmed = history.slice(0, DOWNLOAD_HISTORY_LIMIT);
	await kv.put(KV_KEY_DOWNLOAD_HISTORY, JSON.stringify(trimmed));
}

/**
 * Get download history for today (most recent first).
 */
export async function getTodayDownloadHistory(kv: KVNamespace, limit = 50): Promise<DownloadHistoryEntry[]> {
	const raw = await kv.get(KV_KEY_DOWNLOAD_HISTORY);
	if (!raw) return [];
	const history: DownloadHistoryEntry[] = JSON.parse(raw);
	const startOfDay = new Date();
	startOfDay.setUTCHours(0, 0, 0, 0);
	const startTs = startOfDay.getTime();
	return history.filter((e) => e.timestamp >= startTs).slice(0, limit);
}

/**
 * Get download history (most recent first).
 */
export async function getDownloadHistory(kv: KVNamespace, limit = 20): Promise<DownloadHistoryEntry[]> {
	const raw = await kv.get(KV_KEY_DOWNLOAD_HISTORY);
	if (!raw) return [];
	const history: DownloadHistoryEntry[] = JSON.parse(raw);
	return history.slice(0, limit);
}

/**
 * Block a user by ID.
 */
export async function blockUser(
	kv: KVNamespace,
	userId: number,
	info: { username?: string; firstName: string },
): Promise<void> {
	const raw = await kv.get(KV_KEY_BLOCKED_USERS);
	const blocked: Record<string, { username?: string; firstName: string; blockedAt: number }> = raw
		? JSON.parse(raw)
		: {};
	blocked[String(userId)] = { ...info, blockedAt: Date.now() };
	await kv.put(KV_KEY_BLOCKED_USERS, JSON.stringify(blocked));
}

/**
 * Unblock a user by ID.
 */
export async function unblockUser(kv: KVNamespace, userId: number): Promise<boolean> {
	const raw = await kv.get(KV_KEY_BLOCKED_USERS);
	if (!raw) return false;
	const blocked: Record<string, unknown> = JSON.parse(raw);
	if (!blocked[String(userId)]) return false;
	delete blocked[String(userId)];
	await kv.put(KV_KEY_BLOCKED_USERS, JSON.stringify(blocked));
	return true;
}

/**
 * Add a hostname to the permanent domain allowlist.
 */
export async function addDomainToAllowlist(kv: KVNamespace, hostname: string): Promise<void> {
	const raw = await kv.get(KV_KEY_DOMAIN_ALLOWLIST);
	const list: string[] = raw ? JSON.parse(raw) : [];
	if (!list.includes(hostname)) {
		list.push(hostname);
		await kv.put(KV_KEY_DOMAIN_ALLOWLIST, JSON.stringify(list));
	}
}

/**
 * Remove a hostname from the permanent domain allowlist.
 * Returns true if it was found and removed.
 */
export async function removeDomainFromAllowlist(kv: KVNamespace, hostname: string): Promise<boolean> {
	const raw = await kv.get(KV_KEY_DOMAIN_ALLOWLIST);
	if (!raw) return false;
	const list: string[] = JSON.parse(raw);
	const idx = list.indexOf(hostname);
	if (idx === -1) return false;
	list.splice(idx, 1);
	await kv.put(KV_KEY_DOMAIN_ALLOWLIST, JSON.stringify(list));
	return true;
}

/**
 * Get all hostnames in the permanent domain allowlist.
 */
export async function getAllowlist(kv: KVNamespace): Promise<string[]> {
	const raw = await kv.get(KV_KEY_DOMAIN_ALLOWLIST);
	return raw ? JSON.parse(raw) : [];
}

/**
 * Check if a URL's hostname is in the permanent allowlist.
 */
export async function isDomainAllowlisted(kv: KVNamespace, url: string): Promise<boolean> {
	try {
		const hostname = new URL(url).hostname.replace(/^www\./, '');
		const raw = await kv.get(KV_KEY_DOMAIN_ALLOWLIST);
		if (!raw) return false;
		const list: string[] = JSON.parse(raw);
		return list.includes(hostname);
	} catch {
		return false;
	}
}

/**
 * Check if a user is blocked.
 */
export async function isUserBlocked(kv: KVNamespace, userId: number): Promise<boolean> {
	const raw = await kv.get(KV_KEY_BLOCKED_USERS);
	if (!raw) return false;
	const blocked: Record<string, unknown> = JSON.parse(raw);
	return !!blocked[String(userId)];
}

/**
 * Get list of blocked users.
 */
export async function getBlockedUsers(
	kv: KVNamespace,
): Promise<Array<{ userId: number; username?: string; firstName: string; blockedAt: number }>> {
	const raw = await kv.get(KV_KEY_BLOCKED_USERS);
	if (!raw) return [];
	const blocked: Record<string, { username?: string; firstName: string; blockedAt: number }> = JSON.parse(raw);
	return Object.entries(blocked).map(([id, info]) => ({
		userId: parseInt(id, 10),
		...info,
	}));
}

/**
 * Add a failed download entry to the failures log.
 */
export async function addFailedDownload(
	kv: KVNamespace,
	entry: Omit<FailedDownloadEntry, 'timestamp'>,
): Promise<void> {
	const raw = await kv.get(KV_KEY_FAILED_DOWNLOADS);
	const list: FailedDownloadEntry[] = raw ? JSON.parse(raw) : [];
	list.unshift({ ...entry, timestamp: Date.now() });
	await kv.put(KV_KEY_FAILED_DOWNLOADS, JSON.stringify(list.slice(0, FAILED_DOWNLOAD_LIMIT)));
}

/**
 * Get failed downloads log (most recent first).
 */
export async function getFailedDownloads(kv: KVNamespace, limit = 20): Promise<FailedDownloadEntry[]> {
	const raw = await kv.get(KV_KEY_FAILED_DOWNLOADS);
	if (!raw) return [];
	return (JSON.parse(raw) as FailedDownloadEntry[]).slice(0, limit);
}
