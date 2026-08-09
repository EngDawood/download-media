import { Hono } from 'hono';
import { createBot } from './services/telegram-bot/bot-factory';
import { handleSetup, runSetup } from './routes/setup';
import { DEPLOY_ID } from './_deploy-id';
import { localOnlyGuard, handleGetDashboard, handleGetTestUrls, handlePostTestUrls, handleTestDownload } from './routes/test-dashboard';
import { handleApiDownload } from './routes/api';
import { handleMcp, handleMcpMethodNotAllowed, handleMcpOptions } from './routes/mcp';

const DEPLOY_KV_KEY = 'deploy:id';

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true }));
app.get('/setup', handleSetup);

// Public download API (key-protected) — lets external apps download without the bot
app.post('/api/download', handleApiDownload);

// MCP server (key-protected) — same pipeline, exposed to AI agents over Streamable HTTP.
// The /mcp/:token form carries the key in the URL for clients that cannot send
// custom headers (claude.ai custom connectors); both forms are the same handler.
app.post('/mcp', handleMcp);
app.options('/mcp', handleMcpOptions);
app.get('/mcp', handleMcpMethodNotAllowed);
app.delete('/mcp', handleMcpMethodNotAllowed);
app.post('/mcp/:token', handleMcp);
app.options('/mcp/:token', handleMcpOptions);
app.get('/mcp/:token', handleMcpMethodNotAllowed);
app.delete('/mcp/:token', handleMcpMethodNotAllowed);

// Dev-only manual testing dashboard and APIs
app.get('/test', localOnlyGuard, handleGetDashboard);
app.get('/api/test-urls', localOnlyGuard, handleGetTestUrls);
app.post('/api/test-urls', localOnlyGuard, handlePostTestUrls);
app.post('/api/test-download', localOnlyGuard, handleTestDownload);

app.post('/telegram', async (c) => {
	const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
	if (c.env.TELEGRAM_WEBHOOK_SECRET && secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	// Auto-setup: run once per deploy (compare build-time ID against D1 config)
	const db = c.env.download_media_bot_db;
	const storedIdRow = await db
		.prepare(`SELECT value FROM app_config WHERE key = ?`)
		.bind(DEPLOY_KV_KEY)
		.first<{ value: string }>()
		.catch(() => null);
	if (storedIdRow?.value !== DEPLOY_ID) {
		const isLocal = new URL(c.req.url).hostname === 'localhost' || new URL(c.req.url).hostname === '127.0.0.1';
		c.executionCtx.waitUntil(
			db
				.prepare(`INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
				.bind(DEPLOY_KV_KEY, DEPLOY_ID)
				.run()
				.then(() => runSetup(c.env, !isLocal))
				.catch((err) => console.error('[auto-setup] Failed:', err)),
		);
	}

	const bot = createBot(c.env);
	await bot.init();
	const update = await c.req.json();
	c.executionCtx.waitUntil(bot.handleUpdate(update).catch((err) => console.error('[webhook] Unhandled update error:', err)));
	return c.json({ ok: true });
});

export default app;
