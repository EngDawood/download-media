export type SessionKeyType = 'state' | 'lock' | 'lock_pending' | 'usage' | 'blocked_url' | 'report' | 'report_sent' | 'report_pending';

export async function getSession(db: D1Database, keyType: SessionKeyType, userId: number): Promise<string | null> {
	const now = Date.now();
	const row = await db
		.prepare(`SELECT value, expires_at FROM session_store WHERE key_type = ? AND user_id = ?`)
		.bind(keyType, userId)
		.first<{ value: string; expires_at: number | null }>();
	if (!row) return null;
	if (row.expires_at !== null && row.expires_at <= now) {
		db.prepare(`DELETE FROM session_store WHERE key_type = ? AND user_id = ?`)
			.bind(keyType, userId)
			.run()
			.catch(() => {});
		return null;
	}
	return row.value;
}

export async function setSession(
	db: D1Database,
	keyType: SessionKeyType,
	userId: number,
	value: string,
	ttlSeconds?: number,
): Promise<void> {
	const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
	await db
		.prepare(
			`INSERT INTO session_store (key_type, user_id, value, expires_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(key_type, user_id) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
		)
		.bind(keyType, userId, value, expiresAt)
		.run();
}

export async function deleteSession(db: D1Database, keyType: SessionKeyType, userId: number): Promise<void> {
	await db.prepare(`DELETE FROM session_store WHERE key_type = ? AND user_id = ?`).bind(keyType, userId).run();
}

export async function getConfig(db: D1Database, key: string): Promise<string | null> {
	const row = await db.prepare(`SELECT value FROM app_config WHERE key = ?`).bind(key).first<{ value: string }>();
	return row?.value ?? null;
}

export async function setConfig(db: D1Database, key: string, value: string): Promise<void> {
	await db
		.prepare(`INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
		.bind(key, value)
		.run();
}

export async function deleteConfig(db: D1Database, key: string): Promise<void> {
	await db.prepare(`DELETE FROM app_config WHERE key = ?`).bind(key).run();
}

export async function getUserLang(db: D1Database, userId: number): Promise<string | null> {
	const row = await db.prepare(`SELECT lang FROM user_settings WHERE user_id = ?`).bind(userId).first<{ lang: string }>();
	return row?.lang ?? null;
}

export async function setUserLang(db: D1Database, userId: number, lang: string): Promise<void> {
	await db
		.prepare(
			`INSERT INTO user_settings (user_id, lang) VALUES (?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET lang = excluded.lang`,
		)
		.bind(userId, lang)
		.run();
}
