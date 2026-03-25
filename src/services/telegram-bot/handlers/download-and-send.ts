import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { downloadMedia, formatFileSize } from '../../media-downloader';
import { sendMediaToChannel, sendWithCaption } from './send-media';
import { setAdminState, clearAdminState } from '../storage/admin-state';
import type { TelegramMediaMessage } from '../../../types/telegram';
import { trackEvent } from '../../../utils/analytics';
import { incrementSuccessStats, incrementErrorStats, addDownloadHistory, addFailedDownload } from '../../../utils/stats';
import { t, DEFAULT_LOCALE, type Locale } from '../../../i18n';
import { CACHE_PREFIX_REPORT, KV_KEY_INSTAGRAM_FOOTER, DEFAULT_INSTAGRAM_FOOTER } from '../../../constants';
import { log } from '../../../utils/logger';

/**
 * Download media from a URL and send it to a chat.
 * Used by both direct text input and callback buttons.
 *
 * @param directUrl When true, treat `url` as a direct media URL (skip platform detection)
 * @param options   When provided with kv + adminId, enables interactive mode:
 *                  if Telegram can't fetch the URL directly, shows a Download/Cancel picker
 *                  instead of auto-downloading through the Worker.
 */
export async function downloadAndSendMedia(
	bot: Bot,
	chatId: number,
	url: string,
	platform: string,
	mode: 'auto' | 'audio' | 'hd' | 'sd' = 'auto',
	statusMessageId?: number,
	directUrl?: boolean,
	options?: { kv?: KVNamespace; adminId?: number; guestMode?: boolean; analytics?: AnalyticsEngineDataset; userId?: number; mediaType?: 'video' | 'audio' | 'photo' | 'document'; firstName?: string; username?: string; locale?: Locale; originalUrl?: string; telegraphToken?: string },
): Promise<void> {
	const userType = options?.guestMode ? 'guest' : 'admin';
	const userId = options?.userId ?? 0;
	const locale = options?.locale ?? DEFAULT_LOCALE;
	const modeText = t(locale, mode === 'audio' ? 'download.mode_audio' : 'download.mode_media');
	const storyUsername = platform === 'Instagram' ? url.match(/instagram\.com\/stories\/([^/?]+)/i)?.[1] : undefined;
	const statusText = storyUsername
		? t(locale, 'download.status_stories', { userLink: `<a href="https://www.instagram.com/${storyUsername}/">@${storyUsername}</a>` })
		: t(locale, 'download.status', { modeText, platform });

	// Helper to record success + history
	const recordSuccess = async () => {
		if (!options?.kv || !userId) return;
		await Promise.all([
			incrementSuccessStats(options.kv, { userId, firstName: options?.firstName || '', platform }),
			addDownloadHistory(options.kv, {
				url,
				platform,
				userId,
				username: options?.username,
				firstName: options?.firstName || '',
				success: true,
			}),
		]);
	};

	// Helper to record error + history, and clear stale KV state
	const recordError = async (errorReason: string) => {
		if (!options?.kv) return;
		// Clear admin state on failure to prevent stale state causing wrong downloads
		if (options.adminId) {
			clearAdminState(options.kv, options.adminId).catch(() => {});
		}
		await Promise.all([
			incrementErrorStats(options.kv, platform),
			userId
				? addDownloadHistory(options.kv, {
						url,
						platform,
						userId,
						username: options?.username,
						firstName: options?.firstName || '',
						success: false,
					})
				: Promise.resolve(),
			addFailedDownload(options.kv, {
				url,
				platform,
				errorReason,
				userId,
				firstName: options?.firstName || '',
				username: options?.username,
				mode,
			}),
		]);
	};

	// Helper to edit the status message with an error.
	// Admin: [🔄 Retry] [Cancelled]
	// Guest: [🔄 Retry] [📬 Report to Admin] — stores context in KV so the report callback can send it
	const showError = async (errorText: string, parseMode?: 'HTML', rawError?: string) => {
		if (!options?.guestMode && options?.kv && options?.adminId) {
			// Admin — retry + cancel
			await setAdminState(options.kv, options.adminId, {
				action: 'downloading_media',
				context: { downloadUrl: options?.originalUrl ?? url, downloadPlatform: platform, downloadMode: mode },
			});
			const keyboard = new InlineKeyboard()
				.text(t(locale, 'download.btn_retry'), 'dl:retry')
				.text(t(locale, 'callback.cancelled'), 'dl:cancel');
			await bot.api.editMessageText(chatId, statusMessageId!, errorText, {
				...(parseMode ? { parse_mode: parseMode } : {}),
				reply_markup: keyboard,
			});
		} else {
			// Guest — store report context in KV, show Retry + Report buttons
			if (options?.kv && userId) {
				const reportData = JSON.stringify({
					url,
					platform,
					error: rawError || errorText.replace(/<[^>]+>/g, ''),
					firstName: options.firstName || '',
					username: options.username,
					userId,
				});
				options.kv.put(`${CACHE_PREFIX_REPORT}${userId}`, reportData, { expirationTtl: 3600 }).catch(() => {});
			}
			const contactInfo = t(locale, 'download.contact_admin');
			const fullText = `${errorText}\n\n${contactInfo}`;
			const keyboard = new InlineKeyboard()
				.text(t(locale, 'download.btn_retry'), 'dl:retry')
				.text(t(locale, 'download.btn_report_admin'), 'report:issue');
			await bot.api.editMessageText(chatId, statusMessageId!, fullText, {
				parse_mode: 'HTML',
				reply_markup: keyboard,
			});
		}
	};

	if (statusMessageId) {
		try {
			await bot.api.editMessageText(chatId, statusMessageId, statusText, { parse_mode: 'HTML' });
		} catch (e: any) {
			const alreadyShowing = e?.description?.includes('message is not modified') || e?.message?.includes('message is not modified');
			if (!alreadyShowing) {
				// Edit failed for a real reason — send a new message and track its ID instead
				const fallback = await bot.api.sendMessage(chatId, statusText, { parse_mode: 'HTML' });
				statusMessageId = fallback.message_id;
			}
			// If alreadyShowing, the message is already correct — keep existing statusMessageId
		}
	} else {
		const msg = await bot.api.sendMessage(chatId, statusText, { parse_mode: 'HTML' });
		statusMessageId = msg.message_id;
	}

	// Track result outside try-catch so error handlers can access mp3Url/thumbnail/caption
	let result: Awaited<ReturnType<typeof downloadMedia>> | undefined;

	try {
		// If directUrl, send the URL directly (used for YouTube quality selection)
		if (directUrl) {
			const msg: TelegramMediaMessage = { type: options?.mediaType || 'video', url, caption: '' };
			await sendMediaToChannel(bot, chatId, msg);
			await recordSuccess();
			await bot.api.editMessageText(chatId, statusMessageId!, t(locale, 'download.done'));
			return;
		}

		result = await downloadMedia(url, mode, platform, { TELEGRAPH_ACCESS_TOKEN: options?.telegraphToken });

		if (result.status === 'error') {
			trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
			await recordError(result.error || 'API error');
			const safeError = (result.error || 'unknown error').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			await showError(t(locale, 'download.failed', { error: safeError, url }), 'HTML', result.error);
			return;
		}

		if (result.media && result.media.length > 0) {
			let caption = result.caption || '';
			// Append Instagram footer (custom if set, otherwise default)
			if (platform === 'Instagram') {
				const footer = options?.kv ? (await options.kv.get(KV_KEY_INSTAGRAM_FOOTER)) ?? DEFAULT_INSTAGRAM_FOOTER : DEFAULT_INSTAGRAM_FOOTER;
				caption = caption ? `${caption}\n\n${footer}` : footer;
			}
			// Build size/quality info for the "Done" message
			const sizeInfo = result.media
				.map(m => {
					const parts: string[] = [];
					if (m.quality) parts.push(m.quality);
					if (m.filesize) parts.push(formatFileSize(m.filesize));
					return parts.join(' ');
				})
				.filter(Boolean)
				.join(', ');
			const doneText = sizeInfo ? t(locale, 'download.done_info', { info: sizeInfo }) : t(locale, 'download.done');

			if (result.media.length > 1) {
				const groupableItems = result.media.filter(m => m.type === 'photo' || m.type === 'video');

				if (groupableItems.length > 1) {
					// Telegram media group limit is 10 — chunk and send sequentially
					for (let i = 0; i < groupableItems.length; i += 4) {
						const chunk = groupableItems.slice(i, i + 4);
						const msg: TelegramMediaMessage = {
							type: 'mediagroup',
							caption: caption,
							media: chunk.map((item, index) => ({
								type: item.type as 'photo' | 'video',
								media: item.url,
								caption: i === 0 && index === 0 ? caption : '',
								parse_mode: 'HTML',
							})),
						};
						await sendMediaToChannel(bot, chatId, msg);
					}
					trackEvent(options?.analytics, { userId, platform, userType, action: 'download_success' });
					await recordSuccess();
					await bot.api.editMessageText(chatId, statusMessageId!, t(locale, 'download.sent_album', { count: groupableItems.length }));
				} else {
					for (const item of result.media.slice(0, 10)) {
						const msg: TelegramMediaMessage = {
							type: item.type,
							url: item.url,
							caption: caption,
						};
						await sendMediaToChannel(bot, chatId, msg);
					}
					trackEvent(options?.analytics, { userId, platform, userType, action: 'download_success' });
					await recordSuccess();
					await bot.api.editMessageText(chatId, statusMessageId!, doneText);
				}
			} else {
				const item = result.media[0];
				const msg: TelegramMediaMessage = {
					type: item.type,
					url: item.url,
					caption: caption,
				};
				await sendMediaToChannel(bot, chatId, msg);
				trackEvent(options?.analytics, { userId, platform, userType, action: 'download_success' });
				await recordSuccess();

				// YouTube & TikTok: show MP3 button after successful video send
				if (result.mp3Url && options?.kv && (platform === 'YouTube' || platform === 'TikTok')) {
					const mp3Keyboard = new InlineKeyboard().text(t(locale, 'download.btn_mp3'), 'dl:yt:mp3');
					await setAdminState(options.kv, options.adminId || userId, {
						action: 'downloading_media',
						context: { downloadUrl: url, downloadPlatform: platform, mp3Url: result.mp3Url },
					});
					await bot.api.editMessageText(chatId, statusMessageId!, doneText, { reply_markup: mp3Keyboard });
				} else {
					await bot.api.editMessageText(chatId, statusMessageId!, doneText);
				}
			}
			return;
		}

		trackEvent(options?.analytics, { userId, platform, userType, action: 'download_empty' });
		await recordError('No media found');
		await showError(t(locale, 'download.no_media', { url }), undefined, 'No media found');
	} catch (err: any) {
		// YouTube: send thumbnail + mp4/mp3 URLs when file is too large
		if (result?.mp3Url && result?.thumbnail && /too large/i.test(err.message || '')) {
			trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
			await recordError('File too large (YouTube)');
			const caption = result.caption || '';
			const mp4Url = result.media?.[0]?.url || url;
			const sorry = options?.firstName
				? t(locale, 'download.too_large_name', { firstName: options.firstName })
				: t(locale, 'download.too_large');
			const keyboard = new InlineKeyboard()
				.url(t(locale, 'download.btn_urluploadxbot'), 'https://t.me/urluploadxbot');
			const photoCaption = `${caption}\n\n${sorry}\n\n${t(locale, 'download.copy_url_hint')}\n\n🎬 Video:\n<code>${mp4Url}</code>\n\n🎵 Audio:\n<code>${result.mp3Url}</code>`;

			// Send with caption logic (splits if too long for photo, falls back to text if photo fails)
			try {
				await sendWithCaption(
					(cap) =>
						bot.api.sendPhoto(chatId, result!.thumbnail!, {
							caption: cap,
							parse_mode: 'HTML',
							reply_markup: keyboard,
						}),
					bot,
					chatId,
					photoCaption,
					false,
				);
			} catch {
				// Entire photo operation failed — fall back to plain text
				await bot.api.sendMessage(chatId, photoCaption, {
					parse_mode: 'HTML',
					reply_markup: keyboard,
				});
			}
			// Clean up the status message
			try { await bot.api.deleteMessage(chatId, statusMessageId!); } catch { /* ignore */ }
			return;
		}

		log('error', 'download-and-send', 'Download and send error', { error: err?.message, platform, url });
		trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
		await recordError(err.message || 'Unknown error');
		const msg = err.message || 'Unknown error';
		// If file is too large for Telegram, send the link as text instead
		if (msg.includes('too large') || msg.includes('Too large')) {
			const sorry = options?.firstName
				? t(locale, 'download.too_large_limit_name', { firstName: options.firstName })
				: t(locale, 'download.too_large_limit');
			const mediaUrl = result?.media?.[0]?.url || url;
			const keyboard = new InlineKeyboard()
				.url(t(locale, 'download.btn_urluploadxbot'), 'https://t.me/urluploadxbot')
				.url(t(locale, 'download.btn_browser'), url);
			await bot.api.editMessageText(
				chatId,
				statusMessageId!,
				`${sorry}\n\n${t(locale, 'download.copy_url_hint')}\n\n<code>${mediaUrl}</code>`,
				{ parse_mode: 'HTML', reply_markup: keyboard },
			);
		} else {
			await showError(t(locale, 'download.error', { url }), undefined, msg);
		}
	}
}
