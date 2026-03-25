import { GrammyError, InputFile, InputMediaBuilder } from 'grammy';
import type { Bot } from 'grammy';
import type { TelegramMediaMessage, FormatSettings } from '../../../types/telegram';

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB Telegram bot upload limit
export const MEDIA_CAPTION_LIMIT = 1024; // Telegram caption limit for photo/video/audio/mediagroup

function isTelegramUrlError(err: unknown): boolean {
	return (
		err instanceof GrammyError &&
		(err.description.includes('failed to get HTTP URL') ||
			err.description.includes('wrong file identifier') ||
			err.description.includes('wrong type of the web page content'))
	);
}

/** If caption fits, attach it to media. If too long, send media without caption then post caption as separate text. */
export async function sendWithCaption(
	send: (caption: string) => Promise<unknown>,
	bot: Bot,
	chatId: number,
	caption: string | undefined,
	disableNotification: boolean
): Promise<void> {
	const text = caption || '';
	if (text.length <= MEDIA_CAPTION_LIMIT) {
		await send(text);
	} else {
		await send('');
		await bot.api.sendMessage(chatId, text, {
			parse_mode: 'HTML',
			disable_notification: disableNotification,
		});
	}
}

/**
 * Send a formatted media message to a Telegram chat.
 * Handles text, photo, video, audio, and media group types.
 * URL-first strategy: tries Telegram URL pass-through, then auto-downloads + uploads (up to 50MB).
 */
export async function sendMediaToChannel(
	bot: Bot,
	chatId: number,
	message: TelegramMediaMessage,
	settings?: FormatSettings,
): Promise<void> {
	const disableNotification = settings?.notification === 'muted';

	switch (message.type) {
		case 'text':
			await sendTextMessage(bot, chatId, message, disableNotification, settings);
			break;
		case 'photo':
			await sendPhotoMessage(bot, chatId, message, disableNotification);
			break;
		case 'video':
			await sendVideoMessage(bot, chatId, message, disableNotification);
			break;
		case 'audio':
			await sendAudioMessage(bot, chatId, message, disableNotification);
			break;
		case 'document':
			await sendDocumentMessage(bot, chatId, message, disableNotification);
			break;
		case 'mediagroup':
			await sendMediaGroupMessage(bot, chatId, message, disableNotification);
			break;
		default:
			console.error(`[sendMedia] Unknown message type: ${(message as { type: string }).type}`);
			throw new Error(`Unknown message type: ${(message as { type: string }).type}`);
	}
}

async function sendTextMessage(
	bot: Bot,
	chatId: number,
	message: TelegramMediaMessage,
	disableNotification: boolean,
	settings?: FormatSettings
): Promise<void> {
	await bot.api.sendMessage(chatId, message.caption, {
		parse_mode: 'HTML',
		disable_notification: disableNotification,
		link_preview_options: settings?.linkPreview === 'disable' ? { is_disabled: true } : undefined,
	});
}

async function sendPhotoMessage(
	bot: Bot,
	chatId: number,
	message: TelegramMediaMessage,
	disableNotification: boolean,
): Promise<void> {
	if (!message.url) throw new Error('Photo URL is missing');
	const url = message.url;
	try {
		await sendWithCaption(
			(caption) => bot.api.sendPhoto(chatId, url, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot, chatId, message.caption, disableNotification
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		const file = await downloadAsInputFile(url, 'photo.jpg');
		await sendWithCaption(
			(caption) => bot.api.sendPhoto(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot, chatId, message.caption, disableNotification
		);
	}
}

async function sendVideoMessage(
	bot: Bot,
	chatId: number,
	message: TelegramMediaMessage,
	disableNotification: boolean,
): Promise<void> {
	if (!message.url) throw new Error('Video URL is missing');
	const url = message.url;
	try {
		await sendWithCaption(
			(caption) => bot.api.sendVideo(chatId, url, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot, chatId, message.caption, disableNotification
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		const file = await downloadAsInputFile(url, 'video.mp4');
		await sendWithCaption(
			(caption) => bot.api.sendVideo(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot, chatId, message.caption, disableNotification
		);
	}
}

async function sendAudioMessage(
	bot: Bot,
	chatId: number,
	message: TelegramMediaMessage,
	disableNotification: boolean,
): Promise<void> {
	if (!message.url) throw new Error('Audio URL is missing');
	const url = message.url;
	try {
		await sendWithCaption(
			(caption) => bot.api.sendAudio(chatId, url, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot, chatId, message.caption, disableNotification
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		const file = await downloadAsInputFile(url, 'audio.mp3');
		await sendWithCaption(
			(caption) => bot.api.sendAudio(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot, chatId, message.caption, disableNotification
		);
	}
}

async function sendDocumentMessage(
	bot: Bot,
	chatId: number,
	message: TelegramMediaMessage,
	disableNotification: boolean,
): Promise<void> {
	if (!message.url) throw new Error('Document URL is missing');
	const url = message.url;
	// Derive filename from URL path; for GitHub archive downloads use repo-branch.zip
	const parsedUrl = new URL(url);
	let filename: string;
	let forceDownload = false;
	if (parsedUrl.hostname === 'codeload.github.com') {
		// URL: https://codeload.github.com/{owner}/{repo}/zip/{ref}
		// or:  https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}
		const parts = parsedUrl.pathname.split('/').filter(Boolean);
		const repo = parts[1] ?? 'repo';
		const refParts = parts.slice(3); // after /zip/
		const ref = refParts[0] === 'refs'
			? refParts[refParts.length - 1]
			: (refParts[0]?.slice(0, 7) ?? 'main');
		filename = `${repo}-${ref}.zip`;
		forceDownload = true;
	} else if (parsedUrl.hostname === 'github.com' && parsedUrl.pathname.includes('/archive/')) {
		// URL: https://github.com/{owner}/{repo}/archive/HEAD.zip
		// or:  https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip
		const parts = parsedUrl.pathname.split('/').filter(Boolean);
		const repo = parts[1] ?? 'repo';
		const archiveParts = parts.slice(3); // after /archive/
		let ref: string;
		if (archiveParts[0] === 'refs') {
			ref = archiveParts[archiveParts.length - 1].replace(/\.zip$/, '');
		} else {
			ref = (archiveParts[0] ?? 'HEAD').replace(/\.zip$/, '');
		}
		filename = ref === 'HEAD' ? `${repo}.zip` : `${repo}-${ref}.zip`;
		forceDownload = true;
	} else {
		filename = parsedUrl.pathname.split('/').pop()?.split('?')[0] || 'document';
	}
	if (forceDownload) {
		const file = await downloadAsInputFile(url, filename);
		await sendWithCaption(
			(caption) => bot.api.sendDocument(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot, chatId, message.caption, disableNotification
		);
		return;
	}
	try {
		await sendWithCaption(
			(caption) => bot.api.sendDocument(chatId, url, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot, chatId, message.caption, disableNotification
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		const file = await downloadAsInputFile(url, filename);
		await sendWithCaption(
			(caption) => bot.api.sendDocument(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot, chatId, message.caption, disableNotification
		);
	}
}

async function sendMediaGroupMessage(
	bot: Bot,
	chatId: number,
	message: TelegramMediaMessage,
	disableNotification: boolean
): Promise<void> {
	if (!message.media || message.media.length === 0) {
		console.warn(`[sendMedia] mediagroup message has no media items for chat ${chatId}, skipping`);
		return;
	}

	const resolvedMedia = await Promise.all(
		message.media.map(async (item) => {
			const ext = item.type === 'video' ? 'mp4' : 'jpg';
			// Always try URL first; if Telegram rejects it, fall back to download+upload
			let source: string | InputFile = item.media;
			try {
				// Attempt to use URL directly; fall back to download+upload if Telegram rejects it
				await Promise.resolve(source);
			} catch {
				source = await downloadAsInputFile(item.media, `media.${ext}`);
			}
			const opts = { caption: item.caption, parse_mode: item.parse_mode as 'HTML' | undefined };
			return item.type === 'video'
				? InputMediaBuilder.video(source, opts)
				: InputMediaBuilder.photo(source, opts);
		})
	);

	try {
		await bot.api.sendMediaGroup(chatId, resolvedMedia, {
			disable_notification: disableNotification,
		});
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		// Re-resolve all items as uploaded files and retry
		const uploadedMedia = await Promise.all(
			message.media.slice(0, 10).map(async (item) => {
				const ext = item.type === 'video' ? 'mp4' : 'jpg';
				const file = await downloadAsInputFile(item.media, `media.${ext}`);
				const opts = { caption: item.caption, parse_mode: item.parse_mode as 'HTML' | undefined };
				return item.type === 'video'
					? InputMediaBuilder.video(file, opts)
					: InputMediaBuilder.photo(file, opts);
			})
		);
		await bot.api.sendMediaGroup(chatId, uploadedMedia, {
			disable_notification: disableNotification,
		});
	}
}

async function downloadAsInputFile(url: string, filename: string): Promise<InputFile> {
	const resp = await fetch(url, {
		headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
		signal: AbortSignal.timeout(20_000),
	});
	if (!resp.ok) throw new Error(`Failed to download media: ${resp.status}`);

	const contentLength = Number(resp.headers.get('content-length') || 0);
	if (contentLength > MAX_UPLOAD_SIZE) {
		throw new Error(`File too large (${(contentLength / 1024 / 1024).toFixed(1)}MB)`);
	}

	const bytes = new Uint8Array(await resp.arrayBuffer());
	if (bytes.length > MAX_UPLOAD_SIZE) {
		throw new Error(`File too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB)`);
	}

	return new InputFile(bytes, filename);
}
