import type { Bot } from 'grammy';
import { CACHE_PREFIX_REPORT } from '../../../constants';
import { t, getLocale } from '../../../i18n';

/**
 * Register the report:issue callback — allows any user to anonymously report
 * a failed download to the admin. Error context is stored in KV by showError()
 * when the error message is shown to the user.
 */
export function registerReportCallbacks(bot: Bot, kv: KVNamespace, adminId: number): void {
	bot.callbackQuery('report:issue', async (ctx) => {
		const userId = ctx.from?.id;
		const locale = getLocale(ctx);

		if (!userId) {
			await ctx.answerCallbackQuery({ text: t(locale, 'error.general') });
			return;
		}

		const raw = await kv.get(`${CACHE_PREFIX_REPORT}${userId}`);
		if (!raw) {
			await ctx.answerCallbackQuery({ text: t(locale, 'callback.session_expired') });
			return;
		}

		const { url, platform, error, firstName, username } = JSON.parse(raw) as {
			url: string;
			platform: string;
			error: string;
			firstName: string;
			username?: string;
		};

		const userRef = username ? `@${username}` : (firstName || `ID:${userId}`);
		const report = t('en', 'download.admin_error_report', { user: userRef, platform, url, error });

		await bot.api.sendMessage(adminId, report, { parse_mode: 'HTML' });

		// Clean up the stored context
		kv.delete(`${CACHE_PREFIX_REPORT}${userId}`).catch(() => {});

		await ctx.answerCallbackQuery({ text: t(locale, 'download.report_sent') });
	});
}
