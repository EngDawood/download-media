import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { getAdminState, setAdminState } from '../storage/admin-state';
import { detectMediaUrl } from '../../../utils/url-detector';
import { downloadAndSendMedia } from './download-and-send';
import { fetchFacebookInfo, fetchTikTokInfo } from '../../media-downloader';
import { checkSubscriptionGate } from './subscription-gate';

/**
 * Register the main text handler to process URL detection and download flows.
 */
export function registerTextInputHandler(bot: Bot, env: Env, kv: KVNamespace): void {
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);

	bot.on('message:text', async (ctx) => {
		const text = ctx.message.text;
		if (text.startsWith('/')) return;

		// Detect supported media URLs before checking admin state
		const detected = detectMediaUrl(text);
		if (detected) {
			const { platform, url } = detected;
			const isAdmin = ctx.from?.id === adminId;
			const userId = ctx.from?.id;
			const firstName = ctx.from?.first_name;

			if (!isAdmin) {
				const blocked = await checkSubscriptionGate(ctx, kv, bot, env.ANALYTICS, platform);
				if (blocked) return;

				const mode = (platform === 'SoundCloud' || platform === 'Spotify') ? 'audio' : 'auto';
				await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, mode, undefined, undefined, { guestMode: true, analytics: env.ANALYTICS, userId, firstName });
				return;
			}

			// YouTube — auto-download (same as guest)
			if (platform === 'YouTube') {
				await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', undefined, undefined, { kv, adminId, analytics: env.ANALYTICS, userId, firstName });
				return;
			}

			// TikTok — image posts download directly; video posts show Video / Audio picker
			if (platform === 'TikTok') {
				const statusMsg = await ctx.reply('Fetching post info...');
				const ttInfo = await fetchTikTokInfo(url);
				if (ttInfo?.isImagePost) {
					// Slideshow — auto-download, no picker needed
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', statusMsg.message_id, undefined, { kv, adminId, analytics: env.ANALYTICS, userId, firstName });
				} else {
					const keyboard = new InlineKeyboard()
						.text('Video', 'dl:sd')
						.text('Audio', 'dl:audio');
					await bot.api.editMessageText(
						ctx.chat!.id,
						statusMsg.message_id,
						`<b>${platform}</b> — Choose format:`,
						{ parse_mode: 'HTML', reply_markup: keyboard }
					);
					await setAdminState(kv, adminId, {
						action: 'downloading_media',
						context: { downloadUrl: url, downloadPlatform: platform },
					});
				}
				return;
			}

			// Facebook — show HD/SD picker if multiple qualities available
			if (platform === 'Facebook') {
				const statusMsg = await ctx.reply('Fetching video info...');
				const fbInfo = await fetchFacebookInfo(url);
				if (fbInfo) {
					const keyboard = new InlineKeyboard()
						.text(fbInfo.hdLabel, 'dl:hd')
						.text(fbInfo.sdLabel, 'dl:sd');
					await bot.api.editMessageText(
						ctx.chat!.id,
						statusMsg.message_id,
						`<b>${platform}</b> — Choose quality:`,
						{ parse_mode: 'HTML', reply_markup: keyboard }
					);
					await setAdminState(kv, adminId, {
						action: 'downloading_media',
						context: { downloadUrl: url, downloadPlatform: platform },
					});
				} else {
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', statusMsg.message_id, undefined, { kv, adminId, analytics: env.ANALYTICS, userId, firstName });
				}
				return;
			}

			// Automatic download for other platforms
			const mode = (platform === 'SoundCloud' || platform === 'Spotify') ? 'audio' : 'auto';
			await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, mode, undefined, undefined, { kv, adminId, analytics: env.ANALYTICS, userId, firstName });
			return;
		}

		const state = await getAdminState(kv, adminId);
		if (!state) {
			await ctx.reply('No active action. Send a supported URL to download media.');
			return;
		}
	});
}
