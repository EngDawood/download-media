import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { getAdminState, setAdminState } from '../storage/admin-state';
import { detectMediaUrl } from '../../../utils/url-detector';
import { downloadAndSendMedia } from './download-and-send';
import { fetchYouTubeQualities, fetchFacebookInfo, fetchTikTokInfo } from '../../media-downloader';
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

			if (!isAdmin) {
				const blocked = await checkSubscriptionGate(ctx, kv, bot, env.ANALYTICS, platform);
				if (blocked) return;

				const mode = (platform === 'SoundCloud' || platform === 'Spotify') ? 'audio' : 'auto';
				await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, mode, undefined, undefined, { guestMode: true, analytics: env.ANALYTICS, userId });
				return;
			}

			// YouTube — fetch qualities and show picker
			if (platform === 'YouTube') {
				const statusMsg = await ctx.reply('Fetching available qualities...');
				const ytInfo = await fetchYouTubeQualities(url);
				if (ytInfo && ytInfo.qualities.length > 0) {
					const keyboard = new InlineKeyboard();
					// Add quality buttons (max 4 per row)
					for (const q of ytInfo.qualities.slice(0, 4)) {
						const label = q.size ? `${q.quality} (${q.size})` : q.quality;
						keyboard.text(label, `dl:yt:${q.quality}`);
					}
					keyboard.row().text('Audio', 'dl:audio');
					await bot.api.editMessageText(
						ctx.chat!.id,
						statusMsg.message_id,
						`<b>${platform}</b> — Choose quality:`,
						{ parse_mode: 'HTML', reply_markup: keyboard }
					);
					await setAdminState(kv, adminId, {
						action: 'downloading_media',
						context: {
							downloadUrl: url,
							downloadPlatform: platform,
							qualities: ytInfo.qualities,
							downloadCaption: ytInfo.caption,
						},
					});
				} else {
					// Fallback: simple video/audio picker
					const keyboard = new InlineKeyboard()
						.text('Video', 'dl:video')
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

			// TikTok — image posts download directly; video posts show Video / Audio picker
			if (platform === 'TikTok') {
				const statusMsg = await ctx.reply('Fetching post info...');
				const ttInfo = await fetchTikTokInfo(url);
				if (ttInfo?.isImagePost) {
					// Slideshow — auto-download, no picker needed
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', statusMsg.message_id, undefined, { kv, adminId, analytics: env.ANALYTICS, userId });
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
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', statusMsg.message_id, undefined, { kv, adminId, analytics: env.ANALYTICS, userId });
				}
				return;
			}

			// Automatic download for other platforms
			const mode = (platform === 'SoundCloud' || platform === 'Spotify') ? 'audio' : 'auto';
			await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, mode, undefined, undefined, { kv, adminId, analytics: env.ANALYTICS, userId });
			return;
		}

		const state = await getAdminState(kv, adminId);
		if (!state) {
			await ctx.reply('No active action. Send a supported URL to download media.');
			return;
		}
	});
}
