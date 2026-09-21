import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { t, getLocale } from '../../../i18n';
import { downloadAndSendMedia } from '../handlers/download-and-send';
import {
	isReportSent,
	setReportSent,
	getReportData,
	deleteReportData,
	setReportPending,
	getReportPending,
	getBlockedUrl,
	deleteBlockedUrl,
} from '../storage/session-store';
import { setAdminState } from '../storage/admin-state';
import { detectMediaUrl } from '../../../utils/url-detector';

export function registerReportCallbacks(bot: Bot, db: D1Database, adminId: number, telegraphToken?: string): void {
	bot.callbackQuery('report:issue', async (ctx) => {
		const userId = ctx.from?.id;
		const locale = getLocale(ctx);

		if (!userId) {
			await ctx.answerCallbackQuery({ text: t(locale, 'error.general') });
			return;
		}

		if (await isReportSent(db, userId)) {
			await ctx.answerCallbackQuery({ text: t(locale, 'report.already_sent') });
			return;
		}

		const reportData = await getReportData(db, userId);
		if (!reportData) {
			await ctx.answerCallbackQuery({ text: t(locale, 'callback.session_expired') });
			return;
		}

		const {
			url,
			platform,
			error,
			firstName,
			username,
			userId: reporterId,
		} = reportData as {
			url: string;
			platform: string;
			error: string;
			firstName: string;
			username?: string;
			userId?: number;
		};

		const resolvedId = reporterId ?? userId;
		const userLink = `<a href="tg://user?id=${resolvedId}">${username ? `@${username}` : firstName || `ID:${resolvedId}`}</a>`;
		const report = t('en', 'download.admin_error_report', { user: userLink, platform, url, error });

		setReportPending(db, userId, { url, platform, chatId: userId }).catch(() => {});
		setReportSent(db, userId).catch(() => {});

		const keyboard = new InlineKeyboard()
			.text(t('en', 'reply.btn'), `report:reply:${resolvedId}`)
			.row()
			.text(t('en', 'report.btn_retry_for_user'), `report:retry:${userId}`);
		await bot.api.sendMessage(adminId, report, { parse_mode: 'HTML', reply_markup: keyboard });

		deleteReportData(db, userId).catch(() => {});

		await ctx.answerCallbackQuery({ text: t(locale, 'download.report_sent') });
	});

	bot.callbackQuery(/^report:retry:(\d+)$/, async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t('en', 'stats.admin_only') });
			return;
		}

		const targetUserId = parseInt(ctx.match[1], 10);
		const pending = await getReportPending(db, targetUserId);
		if (!pending) {
			await ctx.answerCallbackQuery({ text: t('en', 'report.retry_expired') });
			return;
		}

		const { url, platform } = pending as { url: string; platform: string; chatId: number };
		await ctx.answerCallbackQuery();

		try {
			await downloadAndSendMedia(bot, targetUserId, url, platform, 'auto', undefined, undefined, { db, telegraphToken });
			await ctx.reply(t('en', 'report.retry_done'));
		} catch (e: any) {
			await ctx.reply(t('en', 'report.retry_failed', { error: e.message || 'unknown' }));
		}
	});

	// Replies go out as the bot so the admin's personal account stays out of the user's DMs.
	bot.callbackQuery(/^report:reply:(\d+)$/, async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t('en', 'stats.admin_only') });
			return;
		}
		const targetUserId = parseInt(ctx.match[1], 10);
		await setAdminState(db, adminId, { action: 'awaiting_reply', context: { replyTargetId: targetUserId } });
		await ctx.answerCallbackQuery();
		await ctx.reply(t(getLocale(ctx), 'reply.prompt', { userId: String(targetUserId) }), { parse_mode: 'HTML' });
	});

	// Domain reports keep the URL in the blocked-url slot, not report-pending, so they need their own retry.
	bot.callbackQuery(/^report:dlblocked:(\d+)$/, async (ctx) => {
		if (ctx.from?.id !== adminId) {
			await ctx.answerCallbackQuery({ text: t('en', 'stats.admin_only') });
			return;
		}
		const targetUserId = parseInt(ctx.match[1], 10);
		const url = await getBlockedUrl(db, targetUserId);
		const detected = url ? detectMediaUrl(url) : null;
		if (!url || !detected) {
			await ctx.answerCallbackQuery({ text: t('en', 'report.retry_expired') });
			return;
		}
		await ctx.answerCallbackQuery();

		try {
			await downloadAndSendMedia(bot, targetUserId, detected.url, detected.platform, 'auto', undefined, undefined, { db, telegraphToken });
			await deleteBlockedUrl(db, targetUserId);
			await ctx.reply(t('en', 'report.retry_done'));
		} catch (e: any) {
			await ctx.reply(t('en', 'report.retry_failed', { error: e.message || 'unknown' }));
		}
	});
}
