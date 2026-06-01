import { Hono } from 'hono';
import { createBot } from './services/telegram-bot/bot-factory';
import { handleSetup, runSetup } from './routes/setup';
import { DEPLOY_ID } from './_deploy-id';

const DEPLOY_KV_KEY = 'deploy:id';

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true }));
app.get('/setup', handleSetup);

app.post('/telegram', async (c) => {
	const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
	if (c.env.TELEGRAM_WEBHOOK_SECRET && secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	// Auto-setup: run once per deploy (compare build-time ID against D1 config)
	const db = c.env.download_media_bot_db;
	const storedIdRow = await db.prepare(`SELECT value FROM app_config WHERE key = ?`).bind(DEPLOY_KV_KEY).first<{ value: string }>().catch(() => null);
	if (storedIdRow?.value !== DEPLOY_ID) {
		const isLocal = new URL(c.req.url).hostname === 'localhost' || new URL(c.req.url).hostname === '127.0.0.1';
		c.executionCtx.waitUntil(
			db.prepare(`INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
				.bind(DEPLOY_KV_KEY, DEPLOY_ID).run()
				.then(() => runSetup(c.env, !isLocal))
				.catch(err => console.error('[auto-setup] Failed:', err))
		);
	}

	const bot = createBot(c.env);
	await bot.init();
	const update = await c.req.json();
	c.executionCtx.waitUntil(
		bot.handleUpdate(update).catch(err => console.error('[webhook] Unhandled update error:', err))
	);
	return c.json({ ok: true });
});

export default app;
