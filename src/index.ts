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

	// Auto-setup: run once per deploy (compare build-time ID against KV)
	const storedId = await c.env.DOWNLOAD_CACHE.get(DEPLOY_KV_KEY);
	if (storedId !== DEPLOY_ID) {
		const isLocal = new URL(c.req.url).hostname === 'localhost' || new URL(c.req.url).hostname === '127.0.0.1';
		c.executionCtx.waitUntil(
			c.env.DOWNLOAD_CACHE.put(DEPLOY_KV_KEY, DEPLOY_ID).then(() =>
				runSetup(c.env, !isLocal)
			).catch(err => console.error('[auto-setup] Failed:', err))
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
