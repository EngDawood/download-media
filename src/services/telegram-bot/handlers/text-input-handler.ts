import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { getAdminState, setAdminState } from '../storage/admin-state';
import { detectMediaUrl, isBlockedDomain } from '../../../utils/url-detector';
import { CACHE_PREFIX_BLOCKED_URL } from '../../../constants';
import { downloadAndSendMedia } from './download-and-send';
import { fetchFacebookInfo, fetchTikTokInfo } from '../../media-downloader';
import { checkSubscriptionGate } from './subscription-gate';
import { incrementLinkStats, isUserBlocked, isDomainAllowlisted } from '../../../utils/stats';
import { t, getLocale } from '../../../i18n';

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
			const username = ctx.from?.username;
			const locale = getLocale(ctx);

			// Instagram Stories are not supported — notify user and stop
			if (platform === 'Instagram' && url.includes('/stories/')) {
				await ctx.reply(t(locale, 'input.instagram_story_unsupported'));
				return;
			}

			// Block adult content domains for non-admin users (skip if allowlisted)
			if (!isAdmin && isBlockedDomain(url) && !(await isDomainAllowlisted(kv, url))) {
				if (userId) {
					await kv.put(`${CACHE_PREFIX_BLOCKED_URL}${userId}`, url, { expirationTtl: 3600 });
				}
				const keyboard = new InlineKeyboard().text(t(locale, 'input.blocked_domain_btn'), 'report:notadult');
				await ctx.reply(t(locale, 'input.blocked_domain'), { reply_markup: keyboard });
				return;
			}

			// Track link submission (fire-and-forget — don't block the download flow)
			if (userId) {
				incrementLinkStats(kv, { userId, firstName: firstName || '', platform }).catch(() => {});
			}

			// Check if user is blocked (skip for admin)
			if (!isAdmin && userId) {
				const blocked = await isUserBlocked(kv, userId);
				if (blocked) {
					await ctx.reply(t(locale, 'input.blocked'));
					return;
				}
			}

			if (!isAdmin) {
				const gateBlocked = await checkSubscriptionGate(ctx, kv, bot, env.ANALYTICS, platform);
				if (gateBlocked) return;

				const mode = (platform === 'SoundCloud' || platform === 'Spotify') ? 'audio' : 'auto';
				await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, mode, undefined, undefined, { guestMode: true, kv, analytics: env.ANALYTICS, userId, firstName, username, locale });
				return;
			}

			// YouTube — auto-download (same as guest)
			if (platform === 'YouTube') {
				await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', undefined, undefined, { kv, adminId, analytics: env.ANALYTICS, userId, firstName, username, locale });
				return;
			}

			// TikTok — image posts download directly; video posts show Video / Audio picker
			if (platform === 'TikTok') {
				const statusMsg = await ctx.reply(t(locale, 'input.fetching_post'));
				const ttInfo = await fetchTikTokInfo(url);
				if (ttInfo?.isImagePost) {
					// Slideshow — auto-download, no picker needed
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', statusMsg.message_id, undefined, { kv, adminId, analytics: env.ANALYTICS, userId, firstName, username, locale });
				} else if (ttInfo === null) {
					// Info fetch timed out or failed — best-effort auto-download
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', statusMsg.message_id, undefined, { kv, adminId, analytics: env.ANALYTICS, userId, firstName, username, locale });
				} else {
					const keyboard = new InlineKeyboard()
						.text(t(locale, 'input.btn_video'), 'dl:sd')
						.text(t(locale, 'input.btn_audio'), 'dl:audio');
					await bot.api.editMessageText(
						ctx.chat!.id,
						statusMsg.message_id,
						t(locale, 'input.choose_format', { platform }),
						{ parse_mode: 'HTML', reply_markup: keyboard },
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
				const statusMsg = await ctx.reply(t(locale, 'input.fetching_video'));
				const fbInfo = await fetchFacebookInfo(url);
				if (fbInfo) {
					const keyboard = new InlineKeyboard()
						.text(fbInfo.hdLabel, 'dl:hd')
						.text(fbInfo.sdLabel, 'dl:sd');
					await bot.api.editMessageText(
						ctx.chat!.id,
						statusMsg.message_id,
						t(locale, 'input.choose_quality', { platform }),
						{ parse_mode: 'HTML', reply_markup: keyboard },
					);
					await setAdminState(kv, adminId, {
						action: 'downloading_media',
						context: { downloadUrl: url, downloadPlatform: platform },
					});
				} else {
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', statusMsg.message_id, undefined, { kv, adminId, analytics: env.ANALYTICS, userId, firstName, username, locale });
				}
				return;
			}

			// Automatic download for other platforms
			const mode = (platform === 'SoundCloud' || platform === 'Spotify') ? 'audio' : 'auto';
			await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, mode, undefined, undefined, { kv, adminId, analytics: env.ANALYTICS, userId, firstName, username, locale });
			return;
		}

		const state = await getAdminState(kv, adminId);

		// Handle broadcast message input
		if (state?.action === 'awaiting_broadcast' && ctx.from?.id === adminId) {
			const locale = getLocale(ctx);
			await setAdminState(kv, adminId, {
				action: 'awaiting_broadcast',
				context: { broadcastMessage: text },
			});
			const keyboard = new InlineKeyboard()
				.text(t(locale, 'broadcast.btn_confirm'), 'broadcast:confirm')
				.text(t(locale, 'broadcast.btn_cancel'), 'broadcast:cancel');
			await ctx.reply(
				t(locale, 'broadcast.preview', { message: text }),
				{ parse_mode: 'HTML', reply_markup: keyboard },
			);
			return;
		}

		if (!state) {
			const locale = getLocale(ctx);
			await ctx.reply(t(locale, 'input.no_action'));
			return;
		}
	});
}
