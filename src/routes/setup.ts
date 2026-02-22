import type { Context } from 'hono';
import { Bot } from 'grammy';

type HonoEnv = { Bindings: Env };

const BOT_COMMANDS = [
	{ command: 'start', description: 'Show supported platforms' },
	{ command: 'help', description: 'How to use the bot' },
	{ command: 'cancel', description: 'Cancel current action' },
	{ command: 'setchannel', description: 'Set required subscription channel (admin only)' },
];

const SUPPORTED_PLATFORMS = [
	'TikTok', 'Instagram', 'X / Twitter', 'YouTube',
	'Facebook', 'Threads', 'SoundCloud', 'Spotify', 'Pinterest',
];

/**
 * Core setup logic — registers bot commands and sends deploy notification.
 * Used by both the /setup route (manual) and auto-setup (on first webhook request).
 */
export async function runSetup(env: Env, sendNotification: boolean = true): Promise<void> {
	const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);

	const [botInfo] = await Promise.all([
		bot.api.getMe(),
		bot.api.setMyCommands(BOT_COMMANDS),
		bot.api.setChatMenuButton({ menu_button: { type: 'commands' } }),
	]);

	if (!sendNotification) return;

	const deployTime = new Date().toUTCString();

	const message = [
		`🚀 <b>Worker Deployed</b>`,
		``,
		`🤖 Bot: @${botInfo.username}`,
		`🕐 Time: <code>${deployTime}</code>`,
		`⚙️ Worker: <code>download-media-bot</code>`,
		``,
		`📦 Platforms (${SUPPORTED_PLATFORMS.length}):`,
		SUPPORTED_PLATFORMS.map(p => `  • ${p}`).join('\n'),
		``,
		`✅ Commands & webhook ready`,
	].join('\n');

	await bot.api.sendMessage(adminId, message, { parse_mode: 'HTML' });
}

/** GET /setup — manual setup route (kept as fallback). */
export async function handleSetup(c: Context<HonoEnv>): Promise<Response> {
	await runSetup(c.env, true);
	return c.json({ ok: true, commands: BOT_COMMANDS.length });
}
