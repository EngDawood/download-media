import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import { downloadMedia, formatFileSize } from '../../media-downloader';
import { sendMediaToChannel, sendWithCaption } from './send-media';
import { setAdminState, clearAdminState } from '../storage/admin-state';
import { setReportData } from '../storage/session-store';
import type { TelegramMediaMessage } from '../../../types/telegram';
import type { MediaItem } from '../../../types/downloader';
import { trackEvent } from '../../../utils/analytics';
import { incrementSuccessStats, incrementErrorStats, addDownloadHistory, addFailedDownload } from '../../../utils/stats-d1';
import { getConfig } from '../../../utils/db';
import { t, DEFAULT_LOCALE, type Locale } from '../../../i18n';
import { KV_KEY_INSTAGRAM_FOOTER, DEFAULT_INSTAGRAM_FOOTER } from '../../../constants';
import { log } from '../../../utils/logger';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TYPE_KEYS = {
	video: 'download.type_video',
	audio: 'download.type_audio',
	photo: 'download.type_photo',
	document: 'download.type_document',
} as const;

/** Best available filename for an item we could not upload: provider filename → title + extension → URL basename. */
function fileNameFor(item: MediaItem | undefined, title: string | undefined, mediaUrl: string): string {
	if (item?.filename) return item.filename;
	const base = title?.trim();
	if (base) {
		const ext = item?.type === 'audio' ? 'mp3' : item?.type === 'photo' ? 'jpg' : 'mp4';
		return `${base.slice(0, 64).trim()}.${ext}`;
	}
	try {
		const last = new URL(mediaUrl).pathname.split('/').pop()?.split('?')[0];
		if (last && last.includes('.')) return decodeURIComponent(last);
	} catch {
		/* not a parseable URL — fall through */
	}
	return '';
}

/**
 * Name / size / type block shown above the copy-URL hint when a file is too big to upload,
 * so the user knows what the link points at before pasting it into another bot.
 * Providers often omit `filesize`, so fall back to the figure our uploader put in the error text
 * (`File too large (123.4MB)`). Lines with nothing to show are dropped rather than left blank.
 */
function tooLargeFileInfo(
	locale: Locale,
	item: MediaItem | undefined,
	title: string | undefined,
	mediaUrl: string,
	errorMessage: string,
): string {
	const name = fileNameFor(item, title, mediaUrl);
	const size = formatFileSize(item?.filesize) || (errorMessage.match(/\(([\d.]+\s*[KMG]B)\)/i)?.[1] ?? '');
	const lines: string[] = [];
	if (name) lines.push(t(locale, 'download.file_name', { name: escapeHtml(name) }));
	if (size) lines.push(t(locale, 'download.file_size', { size }));
	if (item?.type) lines.push(t(locale, 'download.file_type', { type: t(locale, TYPE_KEYS[item.type]) }));
	return lines.join('\n');
}

export async function downloadAndSendMedia(
	bot: Bot,
	chatId: number,
	url: string,
	platform: string,
	mode: 'auto' | 'audio' | 'hd' | 'sd' = 'auto',
	statusMessageId?: number,
	directUrl?: boolean,
	options?: {
		db?: D1Database;
		adminId?: number;
		guestMode?: boolean;
		analytics?: AnalyticsEngineDataset;
		userId?: number;
		mediaType?: 'video' | 'audio' | 'photo' | 'document';
		mediaTitle?: string;
		firstName?: string;
		username?: string;
		locale?: Locale;
		originalUrl?: string;
		telegraphToken?: string;
	},
): Promise<void> {
	const userType = options?.guestMode ? 'guest' : 'admin';
	const userId = options?.userId ?? 0;
	const locale = options?.locale ?? DEFAULT_LOCALE;
	const modeText = t(locale, mode === 'audio' ? 'download.mode_audio' : 'download.mode_media');
	const storyUsername = platform === 'Instagram' ? url.match(/instagram\.com\/stories\/([^/?]+)/i)?.[1] : undefined;
	const statusText = storyUsername
		? t(locale, 'download.status_stories', { userLink: `<a href="https://www.instagram.com/${storyUsername}/">@${storyUsername}</a>` })
		: t(locale, 'download.status', { modeText, platform });

	const downloadStartTime = Date.now();

	const recordSuccess = async (durationMs?: number, fileSizeBytes?: number) => {
		if (!options?.db || !userId) return;
		await Promise.all([
			incrementSuccessStats(options.db, { userId, firstName: options?.firstName || '', platform, username: options?.username }),
			addDownloadHistory(options.db, {
				url,
				platform,
				userId,
				username: options?.username,
				firstName: options?.firstName || '',
				success: true,
				durationMs,
				fileSizeBytes,
			}),
		]).catch(() => {});
	};

	const recordError = async (errorReason: string) => {
		if (!options?.db) return;
		if (options.adminId) {
			clearAdminState(options.db, options.adminId).catch(() => {});
		}
		await Promise.all([
			incrementErrorStats(options.db, { userId: userId || undefined, firstName: options?.firstName, username: options?.username, platform }),
			userId
				? addDownloadHistory(options.db, {
						url,
						platform,
						userId,
						username: options?.username,
						firstName: options?.firstName || '',
						success: false,
					})
				: Promise.resolve(),
			addFailedDownload(options.db, {
				url,
				platform,
				errorReason,
				userId,
				firstName: options?.firstName || '',
				username: options?.username,
				mode,
			}),
		]).catch(() => {});
	};

	const showError = async (errorText: string, parseMode?: 'HTML', rawError?: string) => {
		if (!options?.guestMode && options?.db && options?.adminId) {
			await setAdminState(options.db, options.adminId, {
				action: 'downloading_media',
				context: { downloadUrl: options?.originalUrl ?? url, downloadPlatform: platform, downloadMode: mode },
			});
			const keyboard = new InlineKeyboard()
				.text(t(locale, 'download.btn_retry'), 'dl:retry')
				.text(t(locale, 'callback.cancelled'), 'dl:cancel');
			const editOpts = { ...(parseMode ? { parse_mode: parseMode } : {}), reply_markup: keyboard } as const;
			try {
				await bot.api.editMessageText(chatId, statusMessageId!, errorText, editOpts);
			} catch {
				await bot.api.sendMessage(chatId, errorText, editOpts).catch(() => {});
			}
		} else {
			if (options?.db && userId) {
				setReportData(options.db, userId, {
					url,
					platform,
					error: rawError || errorText.replace(/<[^>]+>/g, ''),
					firstName: options.firstName || '',
					username: options.username,
					userId,
				}).catch(() => {});
			}
			const contactInfo = t(locale, 'download.contact_admin');
			const fullText = `${errorText}\n\n${contactInfo}`;
			const keyboard = new InlineKeyboard()
				.text(t(locale, 'download.btn_retry'), 'dl:retry')
				.text(t(locale, 'download.btn_report_admin'), 'report:issue');
			try {
				await bot.api.editMessageText(chatId, statusMessageId!, fullText, {
					parse_mode: 'HTML',
					reply_markup: keyboard,
				});
			} catch {
				await bot.api
					.sendMessage(chatId, fullText, {
						parse_mode: 'HTML',
						reply_markup: keyboard,
					})
					.catch(() => {});
			}
		}
	};

	if (statusMessageId) {
		try {
			await bot.api.editMessageText(chatId, statusMessageId, statusText, { parse_mode: 'HTML' });
		} catch (e: any) {
			const alreadyShowing = e?.description?.includes('message is not modified') || e?.message?.includes('message is not modified');
			if (!alreadyShowing) {
				const fallback = await bot.api.sendMessage(chatId, statusText, { parse_mode: 'HTML' });
				statusMessageId = fallback.message_id;
			}
		}
	} else {
		const msg = await bot.api.sendMessage(chatId, statusText, { parse_mode: 'HTML' });
		statusMessageId = msg.message_id;
	}

	let result: Awaited<ReturnType<typeof downloadMedia>> | undefined;

	try {
		if (directUrl) {
			const msg: TelegramMediaMessage = { type: options?.mediaType || 'video', url, caption: '', title: options?.mediaTitle };
			await sendMediaToChannel(bot, chatId, msg);
			await recordSuccess(Date.now() - downloadStartTime);
			await bot.api.editMessageText(chatId, statusMessageId!, t(locale, 'download.done'));
			return;
		}

		result = await downloadMedia(url, mode, platform, { TELEGRAPH_ACCESS_TOKEN: options?.telegraphToken });

		if (result.status === 'error') {
			trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
			await recordError(result.error || 'API error');
			if (result.retryable) {
				await showError(t(locale, 'download.processing_retry', { url }), 'HTML', result.error);
				return;
			}
			const safeError = (result.error || 'unknown error').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			await showError(t(locale, 'download.failed', { error: safeError, url }), 'HTML', result.error);
			return;
		}

		if (result.media && result.media.length > 0) {
			let caption = result.caption || '';
			if (platform === 'Instagram') {
				const footer = options?.db
					? ((await getConfig(options.db, KV_KEY_INSTAGRAM_FOOTER)) ?? DEFAULT_INSTAGRAM_FOOTER)
					: DEFAULT_INSTAGRAM_FOOTER;
				caption = caption ? `${caption}\n\n${footer}` : footer;
			}
			const totalFileSizeBytes = result.media.reduce((sum, m) => sum + (m.filesize ?? 0), 0);
			const sizeInfo = result.media
				.map((m) => {
					const parts: string[] = [];
					if (m.quality) parts.push(m.quality);
					if (m.filesize) parts.push(formatFileSize(m.filesize));
					return parts.join(' ');
				})
				.filter(Boolean)
				.join(', ');
			const doneText = sizeInfo ? t(locale, 'download.done_info', { info: sizeInfo }) : t(locale, 'download.done');

			if (result.media.length > 1) {
				const groupableItems = result.media.filter((m) => m.type === 'photo' || m.type === 'video');

				if (groupableItems.length > 1) {
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
					await recordSuccess(Date.now() - downloadStartTime, totalFileSizeBytes);
					await bot.api.editMessageText(chatId, statusMessageId!, t(locale, 'download.sent_album', { count: groupableItems.length }));
				} else {
					for (const item of result.media.slice(0, 10)) {
						const msg: TelegramMediaMessage = {
							type: item.type,
							url: item.url,
							buffer: item.buffer,
							filename: item.filename,
							title: result.title,
							caption: caption,
						};
						await sendMediaToChannel(bot, chatId, msg);
					}
					trackEvent(options?.analytics, { userId, platform, userType, action: 'download_success' });
					await recordSuccess(Date.now() - downloadStartTime, totalFileSizeBytes);
					await bot.api.editMessageText(chatId, statusMessageId!, doneText);
				}
			} else {
				const item = result.media[0];
				const msg: TelegramMediaMessage = {
					type: item.type,
					url: item.url,
					buffer: item.buffer,
					filename: item.filename,
					title: result.title,
					caption: caption,
				};
				await sendMediaToChannel(bot, chatId, msg);
				trackEvent(options?.analytics, { userId, platform, userType, action: 'download_success' });
				await recordSuccess(Date.now() - downloadStartTime, totalFileSizeBytes);

				if (result.mp3Url && options?.db && (platform === 'YouTube' || platform === 'TikTok')) {
					const mp3Keyboard = new InlineKeyboard().text(t(locale, 'download.btn_mp3'), 'dl:yt:mp3');
					await setAdminState(options.db, options.adminId || userId, {
						action: 'downloading_media',
						context: { downloadUrl: url, downloadPlatform: platform, mp3Url: result.mp3Url, mediaTitle: result.title },
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
	} catch (err: unknown) {
		if (result?.mp3Url && result?.thumbnail && /too large/i.test((err as Error).message || '')) {
			trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
			await recordError('File too large (YouTube)');
			const caption = result.caption || '';
			const mp4Url = result.media?.[0]?.url || url;
			const sorry = options?.firstName
				? t(locale, 'download.too_large_name', { firstName: options.firstName })
				: t(locale, 'download.too_large');
			if (options?.db) {
				await setAdminState(options.db, options.adminId || userId, {
					action: 'downloading_media',
					context: { downloadUrl: url, downloadPlatform: platform, mp3Url: result.mp3Url, mediaTitle: result.title },
				});
			}
			const keyboard = new InlineKeyboard()
				.text(t(locale, 'download.btn_mp3'), 'dl:yt:mp3')
				.url(t(locale, 'download.btn_urluploadxbot'), 'https://t.me/urluploadxbot');
			const fileInfo = tooLargeFileInfo(locale, result.media?.[0], result.title, mp4Url, (err as Error).message || '');
			const browserHint = t(locale, 'download.browser_hint', { url: escapeHtml(mp4Url) });
			const photoCaption = `${caption}\n\n${sorry}\n\n${fileInfo ? `${fileInfo}\n\n` : ''}${t(locale, 'download.copy_url_hint')}\n\n🎬 Video:\n<code>${mp4Url}</code>\n\n${browserHint}`;

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
				await bot.api.sendMessage(chatId, photoCaption, {
					parse_mode: 'HTML',
					reply_markup: keyboard,
				});
			}
			try {
				await bot.api.deleteMessage(chatId, statusMessageId!);
			} catch {
				/* ignore */
			}
			return;
		}

		log('error', 'download-and-send', 'Download and send error', { error: (err as Error)?.message, platform, url });
		trackEvent(options?.analytics, { userId, platform, userType, action: 'download_error' });
		const errMsg = (err as Error).message || 'Unknown error';
		await recordError(errMsg);
		try {
			if (errMsg.includes('too large') || errMsg.includes('Too large')) {
				const sorry = options?.firstName
					? t(locale, 'download.too_large_limit_name', { firstName: options.firstName })
					: t(locale, 'download.too_large_limit');
				const mediaUrl = result?.media?.[0]?.url || url;
				const fileInfo = tooLargeFileInfo(locale, result?.media?.[0], result?.title, mediaUrl, errMsg);
				const keyboard = new InlineKeyboard()
					.url(t(locale, 'download.btn_urluploadxbot'), 'https://t.me/urluploadxbot')
					.url(t(locale, 'download.btn_browser'), url);
				await bot.api.editMessageText(
					chatId,
					statusMessageId!,
					`${sorry}\n\n${fileInfo ? `${fileInfo}\n\n` : ''}${t(locale, 'download.copy_url_hint')}\n\n<code>${mediaUrl}</code>\n\n${t(locale, 'download.browser_hint', { url: escapeHtml(mediaUrl) })}`,
					{ parse_mode: 'HTML', reply_markup: keyboard },
				);
			} else {
				await showError(t(locale, 'download.error', { url }), undefined, errMsg);
			}
		} catch {
			await bot.api.sendMessage(chatId, t(locale, 'download.error', { url })).catch(() => {});
		}
	}
}
