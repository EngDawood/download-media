import { Bot } from 'grammy';
import { registerInfoCommands } from './commands/info-commands';
import { registerAdminCommands } from './commands/admin-commands';
import { registerTextInputHandler } from './handlers/text-input-handler';
import { registerDownloadCallbacks } from './callbacks/download-callbacks';
import { registerSubscriptionCallbacks } from './callbacks/subscription-callbacks';

/**
 * Create and configure Telegram bot instance with all handlers.
 * @param env - Cloudflare Workers environment with secrets and bindings
 * @returns Configured grammY Bot instance
 */
export function createBot(env: Env): Bot {
	const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);
	const kv = env.DOWNLOAD_CACHE;

	// Global error handler
	bot.catch(async (err) => {
		console.error('Bot error:', err);
		const ctx = err.ctx;
		if (ctx.callbackQuery) {
			try {
				await ctx.answerCallbackQuery({ text: '⚠️ Error occurred. Please try again.' });
			} catch (e) {
				console.error('Failed to send error callback notification:', e);
			}
		} else {
			try {
				await ctx.reply('⚠️ An unexpected error occurred. Please try again.');
			} catch (e) {
				console.error('Failed to send error reply:', e);
			}
		}
	});

	// Debug logging for all incoming updates (middleware)
	bot.use(async (ctx, next) => {
		if (ctx.callbackQuery) {
			console.log('[DEBUG] Incoming Callback:', ctx.callbackQuery.data, '| from:', ctx.from?.id, '| adminId:', adminId);
		}
		await next();
	});

	// Admin authentication middleware
	bot.use(async (ctx, next) => {
		if (isNaN(adminId)) {
			console.warn('[WARN] ADMIN_TELEGRAM_ID not configured — auth check skipped');
			await next();
			return;
		}
		// Allow subscription verify for all users
		if (ctx.callbackQuery?.data === 'subscription:verify') {
			await next();
			return;
		}
		if (ctx.from?.id !== adminId && ctx.callbackQuery) {
			console.log('[AUTH] Blocked non-admin callback:', ctx.from?.id);
			await ctx.answerCallbackQuery({ text: 'Unauthorized' });
			return;
		}
		await next();
	});

	// Register info commands: /start, /help, /cancel
	registerInfoCommands(bot, env, kv);

	// Register admin commands: /setchannel
	registerAdminCommands(bot, env, kv);

	// Register subscription callbacks: subscription:verify
	registerSubscriptionCallbacks(bot, kv);

	// Register text input handler (URL detection + multi-step download flows)
	registerTextInputHandler(bot, env, kv);

	// Register download callback query handlers
	bot.on('callback_query:data', async (ctx, next) => {
		console.log('[DEBUG] Received callback:', ctx.callbackQuery.data);
		await next();
	});

	registerDownloadCallbacks(bot, env, kv);

	// Debug: catch unmatched callback queries
	bot.on('callback_query:data', async (ctx) => {
		console.log('[DEBUG] Unmatched callback:', ctx.callbackQuery.data);
		await ctx.answerCallbackQuery({ text: `Unknown: ${ctx.callbackQuery.data?.substring(0, 30)}` });
	});

	return bot;
}
