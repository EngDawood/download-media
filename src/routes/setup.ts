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

export async function handleSetup(c: Context<HonoEnv>): Promise<Response> {
	const bot = new Bot(c.env.TELEGRAM_BOT_TOKEN);
	const adminId = parseInt(c.env.ADMIN_TELEGRAM_ID, 10);

	const [botInfo] = await Promise.all([
		bot.api.getMe(),
		bot.api.setMyCommands(BOT_COMMANDS),
		bot.api.setChatMenuButton({ menu_button: { type: 'commands' } }),
	]);

	const now = new Date();
	const deployTime = now.toUTCString();

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

	return c.json({ ok: true, commands: BOT_COMMANDS.length, bot: botInfo.username });
}
