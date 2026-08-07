import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { getAdminState, setAdminState, clearAdminState } from '../storage/admin-state';
import { setBlockedUrl } from '../storage/session-store';
import { detectMediaUrl, isBlockedDomain, getDirectFileMediaType } from '../../../utils/url-detector';
import { downloadAndSendMedia } from './download-and-send';
import { fetchFacebookInfo, fetchTikTokInfo } from '../../media-downloader';
import { checkSubscriptionGate } from './subscription-gate';
import { incrementLinkStats, isUserBlocked, isDomainAllowlisted } from '../../../utils/stats-d1';
import { t, getLocale } from '../../../i18n';

const IG_RESERVED = ['p', 'reel', 'tv', 'explore', 'accounts', 'stories', 'direct', 'ar', 'live'];

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

export function registerTextInputHandler(bot: Bot, env: Env, db: D1Database): void {
	const adminId = parseInt(env.ADMIN_TELEGRAM_ID, 10);
	const telegraphToken = env.TELEGRAPH_ACCESS_TOKEN;

	bot.on('message:text', async (ctx) => {
		const text = ctx.message.text;
		if (text.startsWith('/')) return;

		const userId = ctx.from?.id;
		const locale = getLocale(ctx);

		if (userId) {
			const userState = await getAdminState(db, userId);
			if (userState?.action === 'awaiting_story_username') {
				await clearAdminState(db, userId);
				const storyMatch = text.match(/instagram\.com\/stories\/([^/?]+)/i) ?? text.match(/instagram\.com\/([^/?]+)/i);
				const cleaned = text.startsWith('@') ? text.slice(1).trim() : text.trim();
				const username = storyMatch
					? ((!['p', 'reel', 'tv', 'explore', 'accounts', 'stories'].includes(storyMatch[1]) ? storyMatch[1] : null) ?? storyMatch[1])
					: /^[a-zA-Z0-9._]{1,30}$/.test(cleaned)
						? cleaned
						: null;
				if (!username) {
					await ctx.reply(t(locale, 'story.invalid'), { parse_mode: 'HTML' });
					return;
				}
				const isAdmin = userId === adminId;
				const storyUrl = `https://www.instagram.com/stories/${username}/`;
				const userLink = `<a href="https://www.instagram.com/${username}/">@${username}</a>`;
				const statusMsg = await ctx.reply(t(locale, 'download.status_stories', { userLink }), { parse_mode: 'HTML' });
				await downloadAndSendMedia(bot, ctx.chat!.id, storyUrl, 'Instagram', 'auto', statusMsg.message_id, false, {
					db,
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

			if (!isAdmin && isBlockedDomain(url) && !(await isDomainAllowlisted(db, url))) {
				if (userId) {
					await setBlockedUrl(db, userId, url);
				}
				const keyboard = new InlineKeyboard().text(t(locale, 'input.blocked_domain_btn'), 'report:notadult');
				await ctx.reply(t(locale, 'input.blocked_domain'), { reply_markup: keyboard });
				return;
			}

			if (userId) {
				incrementLinkStats(db, { userId, firstName: firstName || '', platform }).catch(() => {});
			}

			if (!isAdmin && userId) {
				const blocked = await isUserBlocked(db, userId);
				if (blocked) {
					await ctx.reply(t(locale, 'input.blocked'));
					return;
				}
			}

			const igStoriesUsername = url.match(/instagram\.com\/stories\/([^/?]+)/i)?.[1] ?? null;
			const igProfileUsername = igStoriesUsername ? null : extractInstagramProfileUsername(url);
			const igStoriesTarget = igStoriesUsername ?? igProfileUsername;
			if (igStoriesTarget) {
				const storyUrl = `https://www.instagram.com/stories/${igStoriesTarget}/`;
				const userLink = `<a href="https://www.instagram.com/${igStoriesTarget}/">@${igStoriesTarget}</a>`;
				const statusMsg = await ctx.reply(t(locale, 'download.status_stories', { userLink }), { parse_mode: 'HTML' });
				await downloadAndSendMedia(bot, ctx.chat!.id, storyUrl, 'Instagram', 'auto', statusMsg.message_id, false, {
					db,
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
				const gateBlocked = await checkSubscriptionGate(ctx, db, bot, env.ANALYTICS, platform);
				if (gateBlocked) return;

				const directMediaType = getDirectFileMediaType(url);
				if (directMediaType) {
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', undefined, true, {
						guestMode: true,
						db,
						analytics: env.ANALYTICS,
						userId,
						firstName,
						username,
						locale,
						mediaType: directMediaType,
						telegraphToken,
					});
					return;
				}

				const mode = platform === 'SoundCloud' || platform === 'Spotify' ? 'audio' : 'auto';
				await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, mode, undefined, undefined, {
					guestMode: true,
					db,
					analytics: env.ANALYTICS,
					userId,
					firstName,
					username,
					locale,
					telegraphToken,
				});
				return;
			}

			if (platform === 'YouTube') {
				await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', undefined, undefined, {
					db,
					adminId,
					analytics: env.ANALYTICS,
					userId,
					firstName,
					username,
					locale,
					telegraphToken,
				});
				return;
			}

			if (platform === 'TikTok') {
				const statusMsg = await ctx.reply(t(locale, 'input.fetching_post'));
				await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', statusMsg.message_id, undefined, {
					db,
					adminId,
					analytics: env.ANALYTICS,
					userId,
					firstName,
					username,
					locale,
					telegraphToken,
				});
				return;
			}

			if (platform === 'Facebook') {
				const statusMsg = await ctx.reply(t(locale, 'input.fetching_video'));
				const fbInfo = await fetchFacebookInfo(url);
				if (fbInfo) {
					const keyboard = new InlineKeyboard().text(fbInfo.hdLabel, 'dl:hd').text(fbInfo.sdLabel, 'dl:sd');
					await bot.api.editMessageText(ctx.chat!.id, statusMsg.message_id, t(locale, 'input.choose_quality', { platform }), {
						parse_mode: 'HTML',
						reply_markup: keyboard,
					});
					await setAdminState(db, adminId, {
						action: 'downloading_media',
						context: { downloadUrl: url, downloadPlatform: platform },
					});
				} else {
					await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', statusMsg.message_id, undefined, {
						db,
						adminId,
						analytics: env.ANALYTICS,
						userId,
						firstName,
						username,
						locale,
						telegraphToken,
					});
				}
				return;
			}

			const directMediaType = getDirectFileMediaType(url);
			if (directMediaType) {
				await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, 'auto', undefined, true, {
					db,
					adminId,
					analytics: env.ANALYTICS,
					userId,
					firstName,
					username,
					locale,
					mediaType: directMediaType,
					telegraphToken,
				});
				return;
			}

			const mode = platform === 'SoundCloud' || platform === 'Spotify' ? 'audio' : 'auto';
			await downloadAndSendMedia(bot, ctx.chat!.id, url, platform, mode, undefined, undefined, {
				db,
				adminId,
				analytics: env.ANALYTICS,
				userId,
				firstName,
				username,
				locale,
				telegraphToken,
			});
			return;
		}

		const state = await getAdminState(db, adminId);

		if (state?.action === 'awaiting_broadcast' && ctx.from?.id === adminId) {
			const locale = getLocale(ctx);
			await setAdminState(db, adminId, {
				action: 'awaiting_broadcast',
				context: { broadcastMessage: text },
			});
			const keyboard = new InlineKeyboard()
				.text(t(locale, 'broadcast.btn_confirm'), 'broadcast:confirm')
				.text(t(locale, 'broadcast.btn_cancel'), 'broadcast:cancel');
			await ctx.reply(t(locale, 'broadcast.preview', { message: text }), { parse_mode: 'HTML', reply_markup: keyboard });
			return;
		}

		if (!state) {
			const locale = getLocale(ctx);
			await ctx.reply(t(locale, 'input.no_action'));
			return;
		}
	});
}
