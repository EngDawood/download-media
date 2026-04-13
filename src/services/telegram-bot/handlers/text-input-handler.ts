import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { getAdminState, setAdminState, clearAdminState } from '../storage/admin-state';
import { detectMediaUrl, isBlockedDomain, getDirectFileMediaType } from '../../../utils/url-detector';
import { CACHE_PREFIX_BLOCKED_URL } from '../../../constants';
import { downloadAndSendMedia } from './download-and-send';
import { fetchFacebookInfo, fetchTikTokInfo } from '../../media-downloader';
import { checkSubscriptionGate } from './subscription-gate';
import { incrementLinkStats, isUserBlocked, isDomainAllowlisted } from '../../../utils/stats';
import { t, getLocale } from '../../../i18n';

const IG_RESERVED = ['p', 'reel', 'tv', 'explore', 'accounts', 'stories', 'direct', 'ar', 'live'];

/**
 * Returns the Instagram username if the URL is a profile page (instagram.com/username),
 * or null for posts, reels, stories, and other non-profile paths.
 */
function extractInstagramProfileUsername(url: string): string | null {
	try {
		const u = new URL(url);
		if (!u.hostname.replace(/^www\./, '').endsWith('instagram.com')) return null;
		const parts = u.pathname.split('/').filter(Boolean);
		if (parts.length !== 1) return null;
		const username = parts[0];
		if (IG_RESERVED.includes(username.toLowerCase())) return null;
		if (!/^[a-zA-Z0-9._]{1,30}$/.test(username)) return null;
		return username;
	} catch {
		return null;
	}
}

/**
 * Register the main text handler to process URL detection and download flows.
 */
export function registerTextInputHandler(bot: Bot, env: Env, kv: KVNamespace): void {
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);
	const telegraphToken = env.TELEGRAPH_ACCESS_TOKEN;

	bot.on('message:text', async (ctx) => {
		const text = ctx.message.text;
		if (text.startsWith('/')) return;

		const userId = ctx.from?.id;
		const locale = getLocale(ctx);

		// Handle awaiting_story_username state (any user)
		if (userId) {
			const userState = await getAdminState(kv, userId);
			if (userState?.action === 'awaiting_story_username') {
				await clearAdminState(kv, userId);
				const storyMatch = text.match(/instagram\.com\/stories\/([^/?]+)/i)
					?? text.match(/instagram\.com\/([^/?]+)/i);
				const cleaned = text.startsWith('@') ? text.slice(1).trim() : text.trim();
				const username = storyMatch
					? (!['p', 'reel', 'tv', 'explore', 'accounts', 'stories'].includes(storyMatch[1]) ? storyMatch[1] : null) ?? storyMatch[1]
					: /^[a-zA-Z0-9._]{1,30}$/.test(cleaned) ? cleaned : null;
				if (!username) {
					await ctx.reply(t(locale, 'story.invalid'), { parse_mode: 'HTML' });
					return;
				}
				const isAdmin = userId === adminId;
				const storyUrl = `https://www.instagram.com/stories/${username}/`;
				const userLink = `<a href="https://www.instagram.com/${username}/">@${username}</a>`;
				const statusMsg = await ctx.reply(
					t(locale, 'download.status_stories', { userLink }),
					{ parse_mode: 'HTML' },
				);
				await downloadAndSendMedia(bot, ctx.chat!.id, storyUrl, 'Instagram', 'auto', statusMsg.message_id, false, {
					kv,
					adminId: isAdmin ? adminId : undefined,
					guestMode: !isAdmin,
					userId,
					firstName: ctx.from?.first_name,
					username: ctx.from?.username,
					locale,
				});
				return;
			}
		}

		const detected = detectMediaUrl(text);
		if (detected) {
			const { platform, url } = detected;
			const isAdmin = ctx.from?.id === adminId;
			const userId = ctx.from?.id;
			const firstName = ctx.from?.first_name;
			const username = ctx.from?.username;
			const locale = getLocale(ctx);

			// Block adult content domains for non-admin users
			if (!isAdmin && isBlockedDomain(url) && !(await isDomainAllowlisted(kv, url))) {
				if (userId) {
					await kv.put(`${CACHE_PREFIX_BLOCKED_URL}${userId}`, url, { expirationTtl: 3600 });
				}
				const keyboard = new InlineKeyboard().text(t(locale, 'input.blocked_domain_btn'), 'report:notadult');
				await ctx.reply(t(locale, 'input.blocked_domain'), { reply_markup: keyboard });
				return;
			}

			if (userId) {
				incrementLinkStats(kv, { userId, firstName: firstName || '', platform }).catch(() => {});
			}

			if (!isAdmin && userId) {
				const blocked = await isUserBlocked(kv, userId);
				if (blocked) {
					await ctx.reply(t(locale, 'input.blocked'));
					return;
				}
			}

			// Instagram stories URL (instagram.com/stories/username) or profile URL → download their stories
				const igStoriesUsername = url.match(/instagram\.com\/stories\/([^/?]+)/i)?.[1] ?? null;
				const igProfileUsername = igStoriesUsername ? null : extractInstagramProfileUsername(url);
				const igStoriesTarget = igStoriesUsername ?? igProfileUsername;
				if (igStoriesTarget) {
					const storyUrl = `https://www.instagram.com/stories/${igStoriesTarget}/`;
					const userLink = `<a href="https://www.instagram.com/${igStoriesTarget}/">@${igStoriesTarget}</a>`;
					const statusMsg = await ctx.reply(
						t(locale, 'download.status_stories', { userLink }),
						{ parse_mode: 'HTML' },
					);
					await downloadAndSendMedia(bot, ctx.chat!.id, storyUrl, 'Instagram', 'auto', statusMsg.message_id, false, {
						kv,
						adminId: isAdmin ? adminId : undefined,
						guestMode: !isAdmin,
						analytics: env.ANALYTICS,
						userId,
						firstName,
						username,
						locale,
						telegraphToken,
					});
					return;
				}

				if (!isAdmin) {
					const gateBlocked = await checkSubscriptionGate(ctx, kv, bot, env.ANALYTICS, platform);
					if (gateBlocked) return;

					const directMediaType = getDirectFileMediaType(url);
					if (directMediaType) {
						await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', undefined, true, {
							guestMode: true, kv, analytics: env.ANALYTICS, userId, firstName, username, locale, mediaType: directMediaType, telegraphToken,
						});
						return;
					}

					const mode = (platform === 'SoundCloud' || platform === 'Spotify') ? 'audio' : 'auto';
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, mode, undefined, undefined, {
						guestMode: true, kv, analytics: env.ANALYTICS, userId, firstName, username, locale, telegraphToken,
					});
					return;
				}

				// YouTube
				if (platform === 'YouTube') {
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', undefined, undefined, {
						kv, adminId, analytics: env.ANALYTICS, userId, firstName, username, locale, telegraphToken,
					});
					return;
				}

				// TikTok
				if (platform === 'TikTok') {
					const statusMsg = await ctx.reply(t(locale, 'input.fetching_post'));
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', statusMsg.message_id, undefined, {
						kv, adminId, analytics: env.ANALYTICS, userId, firstName, username, locale, telegraphToken,
					});
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
						await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', statusMsg.message_id, undefined, {
							kv, adminId, analytics: env.ANALYTICS, userId, firstName, username, locale, telegraphToken,
						});
					}
					return;
				}

				// All other platforms
				const directMediaType = getDirectFileMediaType(url);
				if (directMediaType) {
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', undefined, true, {
						kv, adminId, analytics: env.ANALYTICS, userId, firstName, username, locale, mediaType: directMediaType, telegraphToken,
					});
					return;
				}

				const mode = (platform === 'SoundCloud' || platform === 'Spotify') ? 'audio' : 'auto';
				await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, mode, undefined, undefined, {
					kv, adminId, analytics: env.ANALYTICS, userId, firstName, username, locale, telegraphToken,
				});
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
