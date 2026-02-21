import { Hono } from 'hono';
import { createBot } from './services/telegram-bot/bot-factory';
import { handleSetup } from './routes/setup';

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true }));
app.get('/setup', handleSetup);

app.post('/telegram', async (c) => {
	const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
	if (c.env.TELEGRAM_WEBHOOK_SECRET && secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	const bot = createBot(c.env);
	await bot.init();
	const update = await c.req.json();
	c.executionCtx.waitUntil(bot.handleUpdate(update));
	return c.json({ ok: true });
});

export default app;
