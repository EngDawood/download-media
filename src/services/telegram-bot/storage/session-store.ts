import { getSession, setSession, deleteSession } from '../../../utils/db';
import type { AdminState } from '../../../types/telegram';

export async function getAdminState(db: D1Database, userId: number): Promise<AdminState | null> {
	const raw = await getSession(db, 'state', userId);
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export async function setAdminState(db: D1Database, userId: number, state: AdminState): Promise<void> {
	await setSession(db, 'state', userId, JSON.stringify(state), 3600);
}

export async function clearAdminState(db: D1Database, userId: number): Promise<void> {
	await deleteSession(db, 'state', userId);
}

export async function acquireLock(db: D1Database, userId: number): Promise<boolean> {
	const existing = await getSession(db, 'lock', userId);
	if (existing) return false;
	await setSession(db, 'lock', userId, '1');
	return true;
}

export async function releaseLock(db: D1Database, userId: number): Promise<void> {
	await deleteSession(db, 'lock', userId);
}

export async function getUsageCount(db: D1Database, userId: number): Promise<number> {
	const raw = await getSession(db, 'usage', userId);
	return raw ? parseInt(raw, 10) : 0;
}

export async function setUsageCount(db: D1Database, userId: number, count: number): Promise<void> {
	await setSession(db, 'usage', userId, String(count), 90 * 24 * 3600);
}

export async function setBlockedUrl(db: D1Database, userId: number, url: string): Promise<void> {
	await setSession(db, 'blocked_url', userId, url, 3600);
}

export async function getBlockedUrl(db: D1Database, userId: number): Promise<string | null> {
	return getSession(db, 'blocked_url', userId);
}

export async function deleteBlockedUrl(db: D1Database, userId: number): Promise<void> {
	await deleteSession(db, 'blocked_url', userId);
}

export async function setReportData(db: D1Database, userId: number, data: object): Promise<void> {
	await setSession(db, 'report', userId, JSON.stringify(data), 3600);
}

export async function getReportData(db: D1Database, userId: number): Promise<Record<string, unknown> | null> {
	const raw = await getSession(db, 'report', userId);
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export async function deleteReportData(db: D1Database, userId: number): Promise<void> {
	await deleteSession(db, 'report', userId);
}

export async function setReportSent(db: D1Database, userId: number): Promise<void> {
	await setSession(db, 'report_sent', userId, '1', 600);
}

export async function isReportSent(db: D1Database, userId: number): Promise<boolean> {
	return (await getSession(db, 'report_sent', userId)) !== null;
}

export async function setReportPending(db: D1Database, userId: number, data: object): Promise<void> {
	await setSession(db, 'report_pending', userId, JSON.stringify(data), 86400);
}

export async function getReportPending(db: D1Database, userId: number): Promise<Record<string, unknown> | null> {
	const raw = await getSession(db, 'report_pending', userId);
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export async function deleteReportPending(db: D1Database, userId: number): Promise<void> {
	await deleteSession(db, 'report_pending', userId);
}
