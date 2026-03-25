import type { Context } from 'hono';
import { Bot } from 'grammy';

type HonoEnv = { Bindings: Env };

// Shown to all users
const GUEST_COMMANDS = [
	{ command: 'start', description: 'Show supported platforms' },
	{ command: 'help', description: 'How to use the bot' },
	{ command: 'lang', description: 'Change bot language' },
	{ command: 'cancel', description: 'Cancel current action' },
];

const GUEST_COMMANDS_AR = [
	{ command: 'start', description: 'عرض المنصات المدعومة' },
	{ command: 'help', description: 'طريقة استخدام البوت' },
	{ command: 'lang', description: 'تغيير لغة البوت' },
	{ command: 'cancel', description: 'إلغاء الإجراء الحالي' },
];

// Shown only in the admin's chat (overrides the global list for that chat)
const ADMIN_COMMANDS = [
	{ command: 'start', description: 'Show supported platforms' },
	{ command: 'help', description: 'How to use the bot' },
	{ command: 'lang', description: 'Change bot language' },
	{ command: 'cancel', description: 'Cancel current action' },
	{ command: 'setchannel', description: 'Set required subscription channel' },
	{ command: 'setfreeuses', description: 'Set free downloads before gate' },
	{ command: 'stats', description: 'View usage statistics' },
	{ command: 'block', description: 'Block a user by ID' },
	{ command: 'unblock', description: 'Unblock a user by ID' },
	{ command: 'allowlist', description: 'Manage whitelisted domains' },
	{ command: 'broadcast', description: 'Send a message to all users' },
];

const ADMIN_COMMANDS_AR = [
	{ command: 'start', description: 'عرض المنصات المدعومة' },
	{ command: 'help', description: 'طريقة استخدام البوت' },
	{ command: 'lang', description: 'تغيير لغة البوت' },
	{ command: 'cancel', description: 'إلغاء الإجراء الحالي' },
	{ command: 'setchannel', description: 'تعيين قناة الاشتراك' },
	{ command: 'setfreeuses', description: 'تعيين عدد التحميلات المجانية' },
	{ command: 'stats', description: 'عرض إحصائيات الاستخدام' },
	{ command: 'block', description: 'حظر مستخدم عبر المعرف' },
	{ command: 'unblock', description: 'فك حظر مستخدم عبر المعرف' },
	{ command: 'allowlist', description: 'إدارة النطاقات المسموح بها' },
	{ command: 'broadcast', description: 'إرسال رسالة لجميع المستخدمين' },
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
	const adminScope = { type: 'chat' as const, chat_id: adminId };

	const [botInfo] = await Promise.all([
		bot.api.getMe(),
		// Global: guests see only the public commands
		bot.api.setMyCommands(GUEST_COMMANDS),
		bot.api.setMyCommands(GUEST_COMMANDS_AR, { language_code: 'ar' }),
		// Admin chat: override with full command list
		bot.api.setMyCommands(ADMIN_COMMANDS, { scope: adminScope }),
		bot.api.setMyCommands(ADMIN_COMMANDS_AR, { scope: adminScope, language_code: 'ar' }),
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
	return c.json({ ok: true, commands: GUEST_COMMANDS.length });
}
