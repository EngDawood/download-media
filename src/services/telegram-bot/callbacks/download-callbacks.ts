import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { getAdminState, clearAdminState } from '../storage/admin-state';
import { downloadAndSendMedia } from '../handlers/download-and-send';
import { t, getLocale } from '../../../i18n';

export function registerDownloadCallbacks(bot: Bot, env: Env, db: D1Database): void {
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);
	const telegraphToken = env.TELEGRAPH_ACCESS_TOKEN;

	bot.callbackQuery(/^dl:(.+)$/, async (ctx) => {
		const action = ctx.match[1];
		const chatId = ctx.chat!.id;
		const msgId = ctx.callbackQuery.message?.message_id;
		const userId = ctx.from?.id ?? adminId;
		const firstName = ctx.from?.first_name;
		const username = ctx.from?.username;
		const locale = getLocale(ctx);
		// Quality picking, like the mp3 button, is offered to guests too, so its state lives
		// under the tapping user rather than the admin.
		const perUserAction = action === 'yt:mp3' || action === 'q' || action.startsWith('q:');
		const stateOwner = perUserAction ? userId : adminId;
		const state = await getAdminState(db, stateOwner);

		if (!state || state.action !== 'downloading_media' || !state.context?.downloadUrl) {
			await ctx.answerCallbackQuery({ text: t(locale, 'callback.session_expired') });
			return;
		}

		const { downloadUrl, downloadPlatform, qualities, mp3Url, mediaTitle } = state.context;

		// YouTube MP3 — available to all users
		if (action === 'yt:mp3' && mp3Url) {
			await clearAdminState(db, stateOwner);
			await ctx.answerCallbackQuery();
			await downloadAndSendMedia(bot, chatId, mp3Url, downloadPlatform || 'YouTube', 'auto', msgId, true, {
				db,
				analytics: env.ANALYTICS,
				userId,
				mediaType: 'audio',
				mediaTitle,
				firstName,
				username,
				locale,
				originalUrl: downloadUrl,
				telegraphToken,
			});
			return;
		}

		// A ladder tap that outlived its stored qualities must say so, not fall through to the
		// generic handler below and silently re-download the original.
		if (perUserAction && action !== 'yt:mp3' && !qualities?.length) {
			await ctx.answerCallbackQuery({ text: t(locale, 'callback.session_expired') });
			return;
		}

		// Quality ladder — expand the button into the full list of renditions.
		// State is left in place so the list can be reopened and picked from more than once.
		if (action === 'q' && qualities?.length) {
			await ctx.answerCallbackQuery();
			const keyboard = new InlineKeyboard();
			qualities.forEach((q, index) => {
				keyboard.text(q.size ? `${q.quality} · ${q.size}` : q.quality, `dl:q:${index}`);
				if (index % 2 === 1) keyboard.row();
			});
			if (msgId) await bot.api.editMessageReplyMarkup(chatId, msgId, { reply_markup: keyboard });
			return;
		}

		// Quality ladder — send the chosen rendition. The stored URL is already a direct CDN
		// link, so this re-sends rather than re-running the extractor.
		if (action.startsWith('q:') && qualities?.length) {
			const picked = qualities[Number(action.slice(2))];
			if (!picked) {
				await ctx.answerCallbackQuery({ text: t(locale, 'callback.session_expired') });
				return;
			}
			await ctx.answerCallbackQuery();
			await downloadAndSendMedia(bot, chatId, picked.url, downloadPlatform || 'X', 'auto', undefined, true, {
				db,
				analytics: env.ANALYTICS,
				userId,
				mediaType: 'video',
				mediaTitle,
				firstName,
				username,
				locale,
				originalUrl: downloadUrl,
				telegraphToken,
			});
			return;
		}

		// Cancel
		if (action === 'cancel') {
			await clearAdminState(db, adminId);
			await ctx.answerCallbackQuery({ text: t(locale, 'callback.cancelled') });
			if (msgId) await bot.api.editMessageText(chatId, msgId, t(locale, 'callback.cancelled'));
			return;
		}

		await clearAdminState(db, stateOwner);
		await ctx.answerCallbackQuery();

		let mode: 'auto' | 'audio' | 'hd' | 'sd' = 'auto';

		if (action === 'retry') {
			mode = (state.context?.downloadMode as 'auto' | 'audio' | 'hd' | 'sd') || 'auto';
		} else if (action === 'audio') {
			mode = 'audio';
		} else if (action === 'hd') {
			mode = 'hd';
		} else if (action === 'sd') {
			mode = 'sd';
		} else if (action === 'video') {
			mode = 'auto';
		} else if (action.startsWith('yt:') && qualities) {
			const selectedQuality = action.slice(3);
			const match = qualities.find((q) => q.quality === selectedQuality);
			if (match) {
				const mediaType = selectedQuality === 'Audio' ? ('audio' as const) : ('video' as const);
				await downloadAndSendMedia(bot, chatId, match.url, downloadPlatform || 'YouTube', 'auto', msgId, true, {
					db,
					adminId,
					analytics: env.ANALYTICS,
					userId: adminId,
					mediaType,
					mediaTitle,
					firstName,
					username,
					locale,
					originalUrl: downloadUrl,
					telegraphToken,
				});
				return;
			}
			mode = 'auto';
		}

		await downloadAndSendMedia(bot, chatId, downloadUrl, downloadPlatform || 'Unknown', mode, msgId, undefined, {
			db,
			adminId,
			analytics: env.ANALYTICS,
			userId: adminId,
			firstName,
			username,
			locale,
			telegraphToken,
		});
	});
}
