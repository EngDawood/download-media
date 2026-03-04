import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { downloadMedia, formatFileSize } from '../../media-downloader';
import { sendMediaToChannel } from './send-media';
import { setAdminState } from '../storage/admin-state';
import type { TelegramMediaMessage } from '../../../types/telegram';
import { trackEvent } from '../../../utils/analytics';
import { incrementSuccessStats, incrementErrorStats, addDownloadHistory } from '../../../utils/stats';
import { t, DEFAULT_LOCALE, type Locale } from '../../../i18n';

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
	options?: { kv?: KVNamespace; adminId?: number; guestMode?: boolean; analytics?: AnalyticsEngineDataset; userId?: number; mediaType?: 'video' | 'audio'; firstName?: string; username?: string; locale?: Locale },
): Promise<void> {
	const userType = options?.guestMode ? 'guest' : 'admin';
	const userId = options?.userId ?? 0;
	const locale = options?.locale ?? DEFAULT_LOCALE;
	const modeText = t(locale, mode === 'audio' ? 'download.mode_audio' : 'download.mode_media');
	const statusText = t(locale, 'download.status', { modeText, platform });

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

	// Helper to record error + history
	const recordError = async () => {
		if (!options?.kv) return;
		await Promise.all([
			incrementErrorStats(options.kv),
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
		]);
	};

	if (statusMessageId) {
		try {
			await bot.api.editMessageText(chatId, statusMessageId, statusText);
		} catch (e) {
			// Edit failed — send a new message and track its ID instead
			const fallback = await bot.api.sendMessage(chatId, statusText);
			statusMessageId = fallback.message_id;
		}
	} else {
		const msg = await bot.api.sendMessage(chatId, statusText);
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

		result = await downloadMedia(url, mode);

		if (result.status === 'error') {
			trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
			await recordError();
			await bot.api.editMessageText(chatId, statusMessageId!, t(locale, 'download.failed', { error: result.error || 'unknown error' }));
			return;
		}

		if (result.media && result.media.length > 0) {
			const caption = result.caption || '';
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
					const msg: TelegramMediaMessage = {
						type: 'mediagroup',
						caption: caption,
						media: groupableItems.slice(0, 10).map((item, index) => ({
							type: item.type as 'photo' | 'video',
							media: item.url,
							caption: index === 0 ? caption : '',
							parse_mode: 'HTML',
						})),
					};
					await sendMediaToChannel(bot, chatId, msg);
					trackEvent(options?.analytics, { userId, platform, userType, action: 'download_success' });
					await recordSuccess();
					await bot.api.editMessageText(chatId, statusMessageId!, t(locale, 'download.sent_album', { count: Math.min(groupableItems.length, 10) }));
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

				// YouTube: show MP3 button after successful video send
				if (result.mp3Url && options?.kv) {
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
		await recordError();
		await bot.api.editMessageText(chatId, statusMessageId!, t(locale, 'download.no_media'));
	} catch (err: any) {
		// YouTube: send thumbnail + mp4/mp3 URLs when file is too large
		if (result?.mp3Url && result?.thumbnail && /too large/i.test(err.message || '')) {
			trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
			await recordError();
			const caption = result.caption || '';
			const mp4Url = result.media?.[0]?.url || url;
			const sorry = options?.firstName
				? t(locale, 'download.too_large_name', { firstName: options.firstName })
				: t(locale, 'download.too_large');
			const keyboard = new InlineKeyboard()
				.url(t(locale, 'download.btn_urluploadxbot'), 'https://t.me/urluploadxbot');
			const photoCaption = `${caption}\n\n${sorry}\n\n${t(locale, 'download.copy_url_hint')}\n\n🎬 Video:\n<code>${mp4Url}</code>\n\n🎵 Audio:\n<code>${result.mp3Url}</code>`;
			// Send thumbnail with title/author + URLs in one message
			try {
				await bot.api.sendPhoto(chatId, result.thumbnail, {
					caption: photoCaption,
					parse_mode: 'HTML',
					reply_markup: keyboard,
				});
			} catch {
				// Thumbnail failed — fall back to text-only message
				await bot.api.sendMessage(chatId, photoCaption, {
					parse_mode: 'HTML',
					reply_markup: keyboard,
				});
			}
			// Clean up the status message
			try { await bot.api.deleteMessage(chatId, statusMessageId!); } catch { /* ignore */ }
			return;
		}

		console.error('[downloader] Download and send error:', err);
		trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
		await recordError();
		const msg = err.message || 'Unknown error';
		// If file is too large for Telegram, send the link as text instead
		if (msg.includes('too large') || msg.includes('Too large')) {
			const sorry = options?.firstName
				? t(locale, 'download.too_large_limit_name', { firstName: options.firstName })
				: t(locale, 'download.too_large_limit');
			const keyboard = new InlineKeyboard()
				.url(t(locale, 'download.btn_urluploadxbot'), 'https://t.me/urluploadxbot')
				.url(t(locale, 'download.btn_browser'), url);
			await bot.api.editMessageText(
				chatId,
				statusMessageId!,
				`${sorry}\n\n${t(locale, 'download.copy_url_hint')}\n\n<code>${url}</code>`,
				{ parse_mode: 'HTML', reply_markup: keyboard },
			);
		} else {
			await bot.api.editMessageText(chatId, statusMessageId!, t(locale, 'download.error', { message: msg }));
		}
	}
}
