import { GrammyError, InputFile, InputMediaBuilder } from 'grammy';
import type { Bot } from 'grammy';
import type { TelegramMediaMessage, FormatSettings } from '../../../types/telegram';
import type { MediaVariant } from '../../../types/downloader';

// Telegram's two ceilings for non-photo files, from the Bot API "Sending files" table:
// it will fetch a URL itself up to 20MB, and accept an upload from us up to 50MB.
export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
export const MAX_URL_FETCH_SIZE = 20 * 1024 * 1024;
export const MEDIA_CAPTION_LIMIT = 1024; // Telegram caption limit for photo/video/audio/mediagroup

/**
 * 400s that are about the chat or the request itself, not about the URL we passed.
 * Re-fetching and re-uploading would burn a large download and then fail identically.
 */
const NON_URL_400_PATTERNS = [
	'chat not found',
	'chat_write_forbidden',
	'not enough rights',
	'have no rights to send',
	'caption is too long',
	'message is not modified',
	'user is deactivated',
	'bot was blocked',
];

/**
 * True when Telegram refused to fetch the URL itself, so we should download the
 * bytes and upload them instead.
 *
 * Telegram rejects URL pass-through for many reasons — it cannot reach the host,
 * the CDN 403s its fetcher, or the file exceeds the 20MB cap on fetch-by-URL
 * (well under the 50MB we may upload ourselves). Enumerating those descriptions
 * missed cases like "file is too big", which silently killed every 20-50MB video.
 * So treat any 400 as "Telegram won't take this URL" unless it is plainly about
 * the chat: a wasted re-fetch is cheaper than a false failure.
 */
function isTelegramUrlError(err: unknown): boolean {
	if (!(err instanceof GrammyError) || err.error_code !== 400) return false;
	const description = err.description.toLowerCase();
	return !NON_URL_400_PATTERNS.some((pattern) => description.includes(pattern));
}

/** If caption fits, attach it to media. If too long, send media without caption then post caption as separate text. */
export async function sendWithCaption(
	send: (caption: string) => Promise<unknown>,
	bot: Bot,
	chatId: number,
	caption: string | undefined,
	disableNotification: boolean,
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
	settings?: FormatSettings,
): Promise<void> {
	await bot.api.sendMessage(chatId, message.caption, {
		parse_mode: 'HTML',
		disable_notification: disableNotification,
		link_preview_options: settings?.linkPreview === 'disable' ? { is_disabled: true } : undefined,
	});
}

async function sendPhotoMessage(bot: Bot, chatId: number, message: TelegramMediaMessage, disableNotification: boolean): Promise<void> {
	if (!message.url) throw new Error('Photo URL is missing');
	const url = message.url;
	try {
		await sendWithCaption(
			(caption) => bot.api.sendPhoto(chatId, url, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		const file = await downloadAsInputFile(url, 'photo.jpg');
		await sendWithCaption(
			(caption) => bot.api.sendPhoto(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	}
}

async function sendVideoMessage(bot: Bot, chatId: number, message: TelegramMediaMessage, disableNotification: boolean): Promise<void> {
	if (!message.url) throw new Error('Video URL is missing');
	const url = message.url;

	const upload = async () => {
		const file = await downloadAsInputFile(url, 'video.mp4');
		await sendWithCaption(
			(caption) => bot.api.sendVideo(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	};

	// A measured size over the URL-fetch ceiling means Telegram is certain to refuse the
	// pass-through, so skip straight to uploading rather than spending a round trip finding out.
	if (message.filesize && message.filesize > MAX_URL_FETCH_SIZE) {
		await upload();
		return;
	}

	try {
		await sendWithCaption(
			(caption) => bot.api.sendVideo(chatId, url, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		await upload();
	}
}

/**
 * Turn a track title into a filesystem-safe name for the uploaded audio.
 * Falls back to 'audio.mp3' only when no title is available.
 */
export function audioFilename(title?: string): string {
	const base = (title ?? '')
		// eslint-disable-next-line no-control-regex -- stripping control chars is the point of this sanitizer
		.replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 64)
		.trim();
	return base ? `${base}.mp3` : 'audio.mp3';
}

async function sendAudioMessage(bot: Bot, chatId: number, message: TelegramMediaMessage, disableNotification: boolean): Promise<void> {
	if (!message.url) throw new Error('Audio URL is missing');
	const url = message.url;
	// Telegram labels the track with `title` when present; without it the raw
	// filename from the CDN (or 'audio') is shown instead.
	const title = message.title?.trim() || undefined;
	try {
		await sendWithCaption(
			(caption) => bot.api.sendAudio(chatId, url, { caption, title, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		const file = await downloadAsInputFile(url, message.filename || audioFilename(title));
		await sendWithCaption(
			(caption) => bot.api.sendAudio(chatId, file, { caption, title, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	}
}

async function sendDocumentMessage(bot: Bot, chatId: number, message: TelegramMediaMessage, disableNotification: boolean): Promise<void> {
	// Buffer-based document (e.g., GitHub folder zip built in-memory)
	if (message.buffer) {
		const file = new InputFile(message.buffer, message.filename || 'document');
		await sendWithCaption(
			(caption) => bot.api.sendDocument(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
		return;
	}
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
		const ref = refParts[0] === 'refs' ? refParts[refParts.length - 1] : (refParts[0]?.slice(0, 7) ?? 'main');
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
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
		return;
	}
	try {
		await sendWithCaption(
			(caption) => bot.api.sendDocument(chatId, url, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		const file = await downloadAsInputFile(url, filename);
		await sendWithCaption(
			(caption) => bot.api.sendDocument(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	}
}

async function sendMediaGroupMessage(bot: Bot, chatId: number, message: TelegramMediaMessage, disableNotification: boolean): Promise<void> {
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
			return item.type === 'video' ? InputMediaBuilder.video(source, opts) : InputMediaBuilder.photo(source, opts);
		}),
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
				return item.type === 'video' ? InputMediaBuilder.video(file, opts) : InputMediaBuilder.photo(file, opts);
			}),
		);
		await bot.api.sendMediaGroup(chatId, uploadedMedia, {
			disable_notification: disableNotification,
		});
	}
}

/**
 * Covers the full body read, not just the response headers, so it has to be large
 * enough to pull a ~50MB CDN file. Workers bill CPU time rather than wall-clock,
 * so a slow stream costs nothing; the old 20s budget just aborted big downloads.
 */
const MEDIA_FETCH_TIMEOUT_MS = 120_000;

// Statuses worth retrying: transient CDN edge failures (Cloudflare 5xx like the
// TikTok 530 in D1) and short-lived 403 that clears within a second (seen on
// YouTube/twimg signed URLs when the first request hits a cold edge). A 404 is
// permanent and a 4xx other than 403/408/429 means the URL itself is bad.
const RETRYABLE_MEDIA_STATUSES = new Set([403, 408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530]);

async function fetchMediaOnce(url: string): Promise<Response> {
	return fetch(url, {
		headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
		signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS),
	});
}

/**
 * Byte size of a remote file from its headers, or undefined when the host will not say.
 * video.twimg.com answers HEAD with a content-length, which is all this needs; anything
 * that refuses simply goes unmeasured.
 */
async function headContentLength(url: string): Promise<number | undefined> {
	try {
		const res = await fetch(url, {
			method: 'HEAD',
			headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
			signal: AbortSignal.timeout(8_000),
		});
		if (!res.ok) return undefined;
		const length = Number(res.headers.get('content-length'));
		return length > 0 ? length : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Fill in `filesize` for every rendition. The HEADs run in parallel, so measuring a
 * four-rung ladder costs one round trip — and the numbers are reused twice: once to pick
 * what to send, once to label the quality buttons.
 */
export async function measureVariants(variants: MediaVariant[]): Promise<MediaVariant[]> {
	return Promise.all(variants.map(async (v) => (v.filesize !== undefined ? v : { ...v, filesize: await headContentLength(v.url) })));
}

/**
 * Best rendition Telegram will actually accept, from a best-first ladder.
 *
 * Quality first, cost second: anything at or under the upload ceiling is fair game even
 * though sending it means pulling the bytes through the Worker, because Workers bill CPU
 * rather than wall-clock and a slow stream is nearly free. Dropping to a smaller rendition
 * just to stay on the no-cost URL path would trade the user's quality for our convenience.
 *
 * A rendition whose size could not be measured is taken on trust — trying and failing is
 * no worse than today, whereas skipping it would refuse videos that would have sent fine.
 */
export function pickSendableVariant(variants: MediaVariant[]): MediaVariant | undefined {
	return variants.find((v) => v.filesize === undefined || v.filesize <= MAX_UPLOAD_SIZE);
}

async function downloadAsInputFile(url: string, filename: string): Promise<InputFile> {
	let resp = await fetchMediaOnce(url);
	if (!resp.ok && RETRYABLE_MEDIA_STATUSES.has(resp.status)) {
		await new Promise((r) => setTimeout(r, 700));
		resp = await fetchMediaOnce(url);
	}
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
