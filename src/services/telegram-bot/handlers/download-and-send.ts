import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { downloadMedia, formatFileSize } from '../../media-downloader';
import { sendMediaToChannel, TelegramUrlFetchError } from './send-media';
import { setAdminState } from '../storage/admin-state';
import type { TelegramMediaMessage } from '../../../types/telegram';
import { trackEvent } from '../../../utils/analytics';

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
	options?: { kv?: KVNamespace; adminId?: number; guestMode?: boolean; analytics?: AnalyticsEngineDataset; userId?: number; mediaType?: 'video' | 'audio'; firstName?: string }
): Promise<void> {
	const interactive = !!(options?.kv && options?.adminId) || !!options?.guestMode;
	const userType = options?.guestMode ? 'guest' : 'admin';
	const userId = options?.userId ?? 0;
	const modeText = mode === 'audio' ? 'audio' : 'media';
	const statusText = `Downloading ${modeText} from ${platform}...`;

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
			await sendMediaToChannel(bot, chatId, msg, undefined, interactive);
			await bot.api.editMessageText(chatId, statusMessageId!, 'Done.');
			return;
		}

		result = await downloadMedia(url, mode);

		if (result.status === 'error') {
			trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
			await bot.api.editMessageText(chatId, statusMessageId!, `Download failed: ${result.error || 'unknown error'}`);
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
			const doneText = sizeInfo ? `Done. (${sizeInfo})` : 'Done.';

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
					await sendMediaToChannel(bot, chatId, msg, undefined, interactive);
					trackEvent(options?.analytics, { userId, platform, userType, action: 'download_success' });
					await bot.api.editMessageText(chatId, statusMessageId!, `Sent ${Math.min(groupableItems.length, 10)} items as album.`);
				} else {
					for (const item of result.media.slice(0, 10)) {
						const msg: TelegramMediaMessage = {
							type: item.type,
							url: item.url,
							caption: caption,
						};
						await sendMediaToChannel(bot, chatId, msg, undefined, interactive);
					}
					trackEvent(options?.analytics, { userId, platform, userType, action: 'download_success' });
					await bot.api.editMessageText(chatId, statusMessageId!, doneText);
				}
			} else {
				const item = result.media[0];
				const msg: TelegramMediaMessage = {
					type: item.type,
					url: item.url,
					caption: caption,
				};
				await sendMediaToChannel(bot, chatId, msg, undefined, interactive);
				trackEvent(options?.analytics, { userId, platform, userType, action: 'download_success' });

				// YouTube: show MP3 button after successful video send
				if (result.mp3Url && options?.kv) {
					const mp3Keyboard = new InlineKeyboard().text('🎵 MP3', 'dl:yt:mp3');
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
		await bot.api.editMessageText(chatId, statusMessageId!, 'No media found.');
	} catch (err: any) {
		// YouTube: send thumbnail + mp4/mp3 URLs on TelegramUrlFetchError or too-large
		if (result?.mp3Url && result?.thumbnail && (err instanceof TelegramUrlFetchError || /too large/i.test(err.message || ''))) {
			trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
			const caption = result.caption || '';
			const mp4Url = result.media?.[0]?.url || url;
			const sorry = options?.firstName ? `😔 Sorry ${options.firstName}, this file is too large for Telegram.` : '😔 This file is too large for Telegram.';
			const keyboard = new InlineKeyboard()
				.url('🤖 Open @urluploadxbot', 'https://t.me/urluploadxbot');
			const photoCaption = `${caption}\n\n${sorry}\n\nCopy the URL below, then send the link to @urluploadxbot\n\n🎬 Video:\n<code>${mp4Url}</code>\n\n🎵 Audio:\n<code>${result.mp3Url}</code>`;
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

		// Telegram couldn't fetch the URL directly — show picker in interactive mode
		if (err instanceof TelegramUrlFetchError && options?.kv && options?.adminId) {
			await setAdminState(options.kv, options.adminId, {
				action: 'downloading_media',
				context: {
					downloadUrl: url,
					downloadPlatform: platform,
					directMediaUrl: err.mediaUrl,
				},
			});
			const sorry = options?.firstName ? `😔 Sorry ${options.firstName}, Telegram couldn't fetch this file.` : `😔 Telegram couldn't fetch this file.`;
			const keyboard = new InlineKeyboard()
				.text('📥 Download', 'dl:confirm')
				.text('❌ Cancel', 'dl:cancel')
				.row()
				.url('🤖 Open @urluploadxbot', 'https://t.me/urluploadxbot')
				.url('🌐 Open in Browser', err.mediaUrl);
			await bot.api.editMessageText(
				chatId,
				statusMessageId!,
				`${sorry}\n\nCopy the URL below, then send the link to @urluploadxbot\n\n<code>${err.mediaUrl}</code>`,
				{ parse_mode: 'HTML', reply_markup: keyboard }
			);
			return;
		} else if (err instanceof TelegramUrlFetchError && options?.guestMode) {
			const sorry = options?.firstName ? `😔 Sorry ${options.firstName}, Telegram couldn't fetch this file.` : `😔 Telegram couldn't fetch this file.`;
			const keyboard = new InlineKeyboard()
				.url('🤖 Open @urluploadxbot', 'https://t.me/urluploadxbot')
				.url('🌐 Open in Browser', err.mediaUrl);
			await bot.api.editMessageText(
				chatId,
				statusMessageId!,
				`${sorry}\n\nCopy the URL below, then send the link to @urluploadxbot\n\n<code>${err.mediaUrl}</code>`,
				{ parse_mode: 'HTML', reply_markup: keyboard }
			);
			return;
		}

		console.error('[downloader] Download and send error:', err);
		trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
		const msg = err.message || 'Unknown error';
		// If file is too large for Telegram, send the link as text instead
		if (msg.includes('too large') || msg.includes('Too large')) {
			const sorry = options?.firstName ? `😔 Sorry ${options.firstName}, this file is too large for Telegram (50MB limit).` : `😔 This file is too large for Telegram (50MB limit).`;
			const keyboard = new InlineKeyboard()
				.url('🤖 Open @urluploadxbot', 'https://t.me/urluploadxbot')
				.url('🌐 Open in Browser', url);
			await bot.api.editMessageText(
				chatId,
				statusMessageId!,
				`${sorry}\n\nCopy the URL below, then send the link to @urluploadxbot\n\n<code>${url}</code>`,
				{ parse_mode: 'HTML', reply_markup: keyboard }
			);
		} else {
			await bot.api.editMessageText(chatId, statusMessageId!, `Error: ${msg}`);
		}
	}
}
