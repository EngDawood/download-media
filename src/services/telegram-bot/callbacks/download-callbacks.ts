import type { Bot } from 'grammy';
import { getAdminState, clearAdminState } from '../storage/admin-state';
import { downloadAndSendMedia } from '../handlers/download-and-send';
import { t, getLocale } from '../../../i18n';

/**
 * Register callback handlers for media download buttons.
 * Supports: dl:video, dl:audio, dl:hd, dl:sd, dl:yt:<quality>, dl:cancel
 */
export function registerDownloadCallbacks(bot: Bot, env: Env, kv: KVNamespace): void {
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);

	// Handle all dl: callbacks with a single regex
	bot.callbackQuery(/^dl:(.+)$/, async (ctx) => {
		const action = ctx.match[1]; // e.g. 'video', 'audio', 'hd', 'sd', 'yt:720p', 'confirm', 'cancel'
		const chatId = ctx.chat!.id;
		const msgId = ctx.callbackQuery.message?.message_id;
		const userId = ctx.from?.id ?? adminId;
		const firstName = ctx.from?.first_name;
		const username = ctx.from?.username;
		const locale = getLocale(ctx);
		// MP3 button is available to all users — read state from the button presser's slot.
		// All other callbacks are admin-only, so always read from adminId.
		const stateOwner = action === 'yt:mp3' ? userId : adminId;
		const state = await getAdminState(kv, stateOwner);

		if (!state || state.action !== 'downloading_media' || !state.context?.downloadUrl) {
			await ctx.answerCallbackQuery({ text: t(locale, 'callback.session_expired') });
			return;
		}

		const { downloadUrl, downloadPlatform, qualities, mp3Url } = state.context;

		// YouTube MP3 — send the stored mp3 URL as audio (available to all users)
		if (action === 'yt:mp3' && mp3Url) {
			await clearAdminState(kv, stateOwner);
			await ctx.answerCallbackQuery();
			await downloadAndSendMedia(bot, chatId, mp3Url, downloadPlatform || 'YouTube', 'auto', msgId, true, { kv, analytics: env.ANALYTICS, userId, mediaType: 'audio', firstName, username, locale, originalUrl: downloadUrl });
			return;
		}

		// Cancel — clear state and dismiss the message
		if (action === 'cancel') {
			await clearAdminState(kv, adminId);
			await ctx.answerCallbackQuery({ text: t(locale, 'callback.cancelled') });
			if (msgId) await bot.api.editMessageText(chatId, msgId, t(locale, 'callback.cancelled'));
			return;
		}

		await clearAdminState(kv, stateOwner);
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
			// YouTube quality selection — find the matching quality URL and download directly
			const selectedQuality = action.slice(3); // e.g. '720p' or 'Audio'
			const match = qualities.find(q => q.quality === selectedQuality);
			if (match) {
				const mediaType = selectedQuality === 'Audio' ? 'audio' as const : 'video' as const;
				await downloadAndSendMedia(
					bot,
					chatId,
					match.url,
					downloadPlatform || 'YouTube',
					'auto',
					msgId,
					true, // directUrl flag — skip platform detection, download this URL directly
					{ kv, adminId, analytics: env.ANALYTICS, userId: adminId, mediaType, firstName, username, locale, originalUrl: downloadUrl },
				);
				return;
			}
			// Fallback if quality not found
			mode = 'auto';
		}

		await downloadAndSendMedia(bot, chatId, downloadUrl, downloadPlatform || 'Unknown', mode, msgId, undefined, { kv, adminId, analytics: env.ANALYTICS, userId: adminId, firstName, username, locale });
	});
}
