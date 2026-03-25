import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { CACHE_PREFIX_REPORT, CACHE_PREFIX_REPORT_SENT, CACHE_PREFIX_REPORT_PENDING } from '../../../constants';
import { t, getLocale } from '../../../i18n';
import { downloadAndSendMedia } from '../handlers/download-and-send';

/**
 * Register the report:issue callback — allows any user to anonymously report
 * a failed download to the admin. Error context is stored in KV by showError()
 * when the error message is shown to the user.
 *
 * Also registers report:retry:<userId> — lets admin re-download and send to user.
 */
export function registerReportCallbacks(bot: Bot, kv: KVNamespace, adminId: number, telegraphToken?: string): void {
	bot.callbackQuery('report:issue', async (ctx) => {
		const userId = ctx.from?.id;
		const locale = getLocale(ctx);

		if (!userId) {
			await ctx.answerCallbackQuery({ text: t(locale, 'error.general') });
			return;
		}

		// Deduplication: block repeat reports within 10 minutes
		const dedupKey = `${CACHE_PREFIX_REPORT_SENT}${userId}`;
		const alreadySent = await kv.get(dedupKey);
		if (alreadySent) {
			await ctx.answerCallbackQuery({ text: t(locale, 'report.already_sent') });
			return;
		}

		const raw = await kv.get(`${CACHE_PREFIX_REPORT}${userId}`);
		if (!raw) {
			await ctx.answerCallbackQuery({ text: t(locale, 'callback.session_expired') });
			return;
		}

		const { url, platform, error, firstName, username, userId: reporterId } = JSON.parse(raw) as {
			url: string;
			platform: string;
			error: string;
			firstName: string;
			username?: string;
			userId?: number;
		};

		const resolvedId = reporterId ?? userId;
		// Build tappable user link for admin — tg://user?id= opens the chat in the Telegram client
		const userLink = `<a href="tg://user?id=${resolvedId}">${username ? `@${username}` : (firstName || `ID:${resolvedId}`)}</a>`;
		const report = t('en', 'download.admin_error_report', { user: userLink, platform, url, error });

		// Store pending entry so admin can retry the download for the user (24h TTL)
		kv.put(`${CACHE_PREFIX_REPORT_PENDING}${userId}`, JSON.stringify({ url, platform, chatId: userId }), { expirationTtl: 86400 }).catch(() => {});

		// Set dedup key (10-minute cooldown)
		kv.put(dedupKey, '1', { expirationTtl: 600 }).catch(() => {});

		// Admin keyboard: reply link + retry download button
		const keyboard = new InlineKeyboard()
			.url('💬 Reply to User', `tg://user?id=${resolvedId}`)
			.row()
			.text(t('en', 'report.btn_retry_for_user'), `report:retry:${userId}`);
		await bot.api.sendMessage(adminId, report, { parse_mode: 'HTML', reply_markup: keyboard });

		// Clean up the stored context
		kv.delete(`${CACHE_PREFIX_REPORT}${userId}`).catch(() => {});

		await ctx.answerCallbackQuery({ text: t(locale, 'download.report_sent') });
	});

	// Admin taps "🔁 Download for User" — re-downloads and sends media directly to user's chat
	bot.callbackQuery(/^report:retry:(\d+)$/, async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t('en', 'stats.admin_only') });
			return;
		}

		const targetUserId = parseInt(ctx.match[1], 10);
		const raw = await kv.get(`${CACHE_PREFIX_REPORT_PENDING}${targetUserId}`);
		if (!raw) {
			await ctx.answerCallbackQuery({ text: t('en', 'report.retry_expired') });
			return;
		}

		const { url, platform } = JSON.parse(raw) as { url: string; platform: string; chatId: number };
		await ctx.answerCallbackQuery();

		try {
			await downloadAndSendMedia(bot, targetUserId, url, platform, 'auto', undefined, undefined, { kv, telegraphToken });
			await ctx.reply(t('en', 'report.retry_done'));
		} catch (e: any) {
			await ctx.reply(t('en', 'report.retry_failed', { error: e.message || 'unknown' }));
		}
	});
}
