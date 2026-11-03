import { GrammyError, InputFile, InputMediaBuilder } from 'grammy';
import type { Bot } from 'grammy';
import type { TelegramMediaMessage, FormatSettings } from '../../../types/telegram';
import type { MediaVariant } from '../../../types/downloader';
import type { MediaCacheItem } from '../../../utils/media-cache';
import { log } from '../../../utils/logger';

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
	const refused = !NON_URL_400_PATTERNS.some((pattern) => description.includes(pattern));
	if (refused) log('warn', 'send-media', 'telegram refused url, falling back to upload', { description: err.description });
	return refused;
}

/**
 * If caption fits, attach it to media. If too long, send media without caption
 * then post caption as separate text. Returns the media send's result(s) —
 * the Message(s) Telegram answered with, which carry the file_id the media
 * cache stores.
 */
export async function sendWithCaption(
	send: (caption: string) => Promise<unknown>,
	bot: Bot,
	chatId: number,
	caption: string | undefined,
	disableNotification: boolean,
): Promise<unknown[]> {
	const text = caption || '';
	if (text.length <= MEDIA_CAPTION_LIMIT) {
		return [await send(text)];
	}
	const sent = await send('');
	await bot.api.sendMessage(chatId, text, {
		parse_mode: 'HTML',
		disable_notification: disableNotification,
	});
	return [sent];
}

/**
 * Send a formatted media message to a Telegram chat.
 * Handles text, photo, video, audio, and media group types.
 * URL-first strategy: tries Telegram URL pass-through, then auto-downloads + uploads (up to 50MB).
 * Returns the Message(s) Telegram answered with (one per media item sent),
 * so callers can harvest the file_ids for the media cache.
 */
export async function sendMediaToChannel(
	bot: Bot,
	chatId: number,
	message: TelegramMediaMessage,
	settings?: FormatSettings,
): Promise<unknown[]> {
	const disableNotification = settings?.notification === 'muted';

	// Awaited rather than returned: in workerd a returned-thenable's rejection
	// can surface as unhandled before the caller's handler attaches.
	switch (message.type) {
		case 'text':
			return await sendTextMessage(bot, chatId, message, disableNotification, settings);
		case 'photo':
			return await sendPhotoMessage(bot, chatId, message, disableNotification);
		case 'video':
			return await sendVideoMessage(bot, chatId, message, disableNotification);
		case 'audio':
			return await sendAudioMessage(bot, chatId, message, disableNotification);
		case 'document':
			return await sendDocumentMessage(bot, chatId, message, disableNotification);
		case 'mediagroup':
			return await sendMediaGroupMessage(bot, chatId, message, disableNotification);
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
): Promise<unknown[]> {
	return [
		await bot.api.sendMessage(chatId, message.caption, {
			parse_mode: 'HTML',
			disable_notification: disableNotification,
			link_preview_options: settings?.linkPreview === 'disable' ? { is_disabled: true } : undefined,
		}),
	];
}

async function sendPhotoMessage(bot: Bot, chatId: number, message: TelegramMediaMessage, disableNotification: boolean): Promise<unknown[]> {
	if (!message.url) throw new Error('Photo URL is missing');
	const url = message.url;
	try {
		return await sendWithCaption(
			(caption) => bot.api.sendPhoto(chatId, url, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		const file = await downloadAsInputFile(url, 'photo.jpg');
		return await sendWithCaption(
			(caption) => bot.api.sendPhoto(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	}
}

async function sendVideoMessage(bot: Bot, chatId: number, message: TelegramMediaMessage, disableNotification: boolean): Promise<unknown[]> {
	// Bytes the provider already downloaded (TikTok's CDN refuses a bare link) skip the URL pass-through.
	if (message.buffer) {
		const file = new InputFile(message.buffer, message.filename || 'video.mp4');
		return await sendWithCaption(
			(caption) => bot.api.sendVideo(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	}
	if (!message.url) throw new Error('Video URL is missing');
	const url = message.url;

	// A known size over the upload ceiling cannot be sent by any route; say so now instead of
	// downloading it first. The error text is what the caller matches to show the "too large" screen.
	if (message.filesize && message.filesize > MAX_UPLOAD_SIZE) {
		throw new Error(`File too large (${(message.filesize / 1024 / 1024).toFixed(1)}MB)`);
	}

	const upload = async (): Promise<unknown[]> => {
		const file = await downloadAsInputFile(url, 'video.mp4');
		return await sendWithCaption(
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
		return await upload();
	}

	try {
		return await sendWithCaption(
			(caption) => bot.api.sendVideo(chatId, url, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		return await upload();
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

/**
 * The container of an audio buffer, from its magic bytes: EBML is WebM/Matroska,
 * "OggS" is Ogg. Telegram's sendAudio accepts only MP3/M4A and rejects both of
 * these outright ("wrong file type") — and the rejection is a plain 400, so the
 * old flow re-uploaded the same bytes under a .mp3 name and failed again. That
 * is exactly what YouTube "mp3" downloads are today: btch's mp3 field wraps a
 * googlevideo itag-249 stream, which is audio/webm (Opus).
 */
export function sniffAudioContainer(bytes: Uint8Array): 'webm' | 'ogg' | null {
	if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
	if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'ogg';
	return null;
}

/** `name.mp3` → `name.webm` (extension swapped, or appended when there is none). */
const withContainerExt = (filename: string, container: 'webm' | 'ogg'): string =>
	filename.includes('.') ? filename.replace(/\.[^.]+$/, `.${container}`) : `${filename}.${container}`;

async function sendAudioMessage(bot: Bot, chatId: number, message: TelegramMediaMessage, disableNotification: boolean): Promise<unknown[]> {
	// Telegram labels the track with `title` when present; without it the raw
	// filename from the CDN (or 'audio') is shown instead.
	const title = message.title?.trim() || undefined;
	// A WebM/Ogg track cannot go out as an audio message at all; deliver it as a
	// document with its true extension instead of failing the whole request.
	const asDocument = (buffer: Uint8Array, container: 'webm' | 'ogg') =>
		sendDocumentMessage(
			bot,
			chatId,
			{ ...message, url: undefined, buffer, filename: withContainerExt(message.filename || audioFilename(title), container) },
			disableNotification,
		);
	if (message.buffer) {
		const container = sniffAudioContainer(message.buffer);
		if (container) return await asDocument(message.buffer, container);
		const file = new InputFile(message.buffer, message.filename || audioFilename(title));
		return await sendWithCaption(
			(caption) => bot.api.sendAudio(chatId, file, { caption, title, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	}
	if (!message.url) throw new Error('Audio URL is missing');
	const url = message.url;
	try {
		return await sendWithCaption(
			(caption) => bot.api.sendAudio(chatId, url, { caption, title, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		const bytes = await downloadBytes(url);
		const container = sniffAudioContainer(bytes);
		if (container) return await asDocument(bytes, container);
		const file = new InputFile(bytes, message.filename || audioFilename(title));
		return await sendWithCaption(
			(caption) => bot.api.sendAudio(chatId, file, { caption, title, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	}
}

async function sendDocumentMessage(
	bot: Bot,
	chatId: number,
	message: TelegramMediaMessage,
	disableNotification: boolean,
): Promise<unknown[]> {
	// Buffer-based document (e.g., GitHub folder zip built in-memory)
	if (message.buffer) {
		const file = new InputFile(message.buffer, message.filename || 'document');
		return await sendWithCaption(
			(caption) => bot.api.sendDocument(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
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
	} else if (message.filename) {
		// A provider that knows the real name wins over the URL path. Google Drive
		// download URLs end in `/download` and Workspace exports in `/export`, so
		// deriving from the path would upload every one of them extensionless.
		filename = message.filename;
	} else {
		filename = parsedUrl.pathname.split('/').pop()?.split('?')[0] || 'document';
	}
	if (forceDownload) {
		const file = await downloadAsInputFile(url, filename);
		return await sendWithCaption(
			(caption) => bot.api.sendDocument(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	}
	try {
		return await sendWithCaption(
			(caption) => bot.api.sendDocument(chatId, url, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	} catch (err) {
		if (!isTelegramUrlError(err)) throw err;
		const file = await downloadAsInputFile(url, filename);
		return await sendWithCaption(
			(caption) => bot.api.sendDocument(chatId, file, { caption, parse_mode: 'HTML', disable_notification: disableNotification }),
			bot,
			chatId,
			message.caption,
			disableNotification,
		);
	}
}

async function sendMediaGroupMessage(
	bot: Bot,
	chatId: number,
	message: TelegramMediaMessage,
	disableNotification: boolean,
): Promise<unknown[]> {
	if (!message.media || message.media.length === 0) {
		console.warn(`[sendMedia] mediagroup message has no media items for chat ${chatId}, skipping`);
		return [];
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
		return await bot.api.sendMediaGroup(chatId, resolvedMedia, {
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
		return await bot.api.sendMediaGroup(chatId, uploadedMedia, {
			disable_notification: disableNotification,
		});
	}
}

// ─── Media cache (file_id resend) ────────────────────────────────────────────

interface FileLike {
	file_id: string;
	file_size?: number;
}

/** The file-bearing fields of a Telegram Message, structurally (no grammy type import needed). */
interface MessageFileFields {
	video?: FileLike;
	animation?: FileLike;
	document?: FileLike;
	audio?: FileLike;
	voice?: FileLike;
	photo?: FileLike[];
}

export interface ExtractedFile {
	type: 'video' | 'animation' | 'document' | 'audio' | 'voice' | 'photo';
	fileId: string;
	fileSize?: number;
}

const FILE_FIELDS = ['video', 'animation', 'document', 'audio', 'voice'] as const;

/**
 * The file a sent Message carries, for the media cache. A photo arrives as a
 * ladder of sizes — the last entry is the largest, which is the one worth
 * resending. Returns null for messages with no file (text, service, …).
 */
export function extractFileId(message: unknown): ExtractedFile | null {
	if (!message || typeof message !== 'object') return null;
	const fields = message as MessageFileFields;
	for (const field of FILE_FIELDS) {
		const file = fields[field];
		if (file?.file_id) return { type: field, fileId: file.file_id, fileSize: file.file_size };
	}
	const photo = fields.photo;
	if (Array.isArray(photo) && photo.length > 0) {
		const largest = photo[photo.length - 1];
		if (largest?.file_id) return { type: 'photo', fileId: largest.file_id, fileSize: largest.file_size };
	}
	return null;
}

/**
 * Replay a cached send: the same items, by file_id, with the same caption.
 * Mirrors the normal path's shape — a lone item goes through sendWithCaption,
 * an all-photo/video set goes as media groups in chunks of 4 with the caption
 * on the first item, anything else is sent item by item with the caption on
 * the first. Throws on any Telegram refusal so the caller can drop the cache
 * entry and fall back to a real download.
 */
export async function sendCachedMediaToChannel(
	bot: Bot,
	chatId: number,
	items: MediaCacheItem[],
	caption: string,
	title?: string,
): Promise<void> {
	if (items.length === 0) throw new Error('No cached media items');

	const sendOne = (item: MediaCacheItem, cap: string): Promise<unknown> => {
		const opts = { caption: cap, parse_mode: 'HTML' as const };
		switch (item.type) {
			case 'photo':
				return bot.api.sendPhoto(chatId, item.fileId, opts);
			case 'video':
				return bot.api.sendVideo(chatId, item.fileId, opts);
			case 'audio':
				return bot.api.sendAudio(chatId, item.fileId, { ...opts, title: title?.trim() || undefined });
			case 'document':
				return bot.api.sendDocument(chatId, item.fileId, opts);
		}
	};

	if (items.length === 1) {
		await sendWithCaption((cap) => sendOne(items[0], cap), bot, chatId, caption, false);
		return;
	}

	if (items.every((item) => item.type === 'photo' || item.type === 'video')) {
		const withCaption = caption.length <= MEDIA_CAPTION_LIMIT;
		for (let i = 0; i < items.length; i += 4) {
			const chunk = items.slice(i, i + 4);
			const group = chunk.map((item, index) => {
				const opts = { caption: withCaption && i === 0 && index === 0 ? caption : '', parse_mode: 'HTML' as const };
				return item.type === 'video' ? InputMediaBuilder.video(item.fileId, opts) : InputMediaBuilder.photo(item.fileId, opts);
			});
			await bot.api.sendMediaGroup(chatId, group, {});
		}
		if (!withCaption && caption) {
			await bot.api.sendMessage(chatId, caption, { parse_mode: 'HTML' });
		}
		return;
	}

	for (let i = 0; i < items.length; i++) {
		await sendWithCaption((cap) => sendOne(items[i], cap), bot, chatId, i === 0 ? caption : '', false);
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

async function downloadBytes(url: string): Promise<Uint8Array> {
	let resp = await fetchMediaOnce(url);
	if (!resp.ok && RETRYABLE_MEDIA_STATUSES.has(resp.status)) {
		await new Promise((r) => setTimeout(r, 700));
		resp = await fetchMediaOnce(url);
	}
	if (!resp.ok) {
		// Host and path only: the query carries a signed token and can run to 1.5KB.
		const body = await resp.text().catch(() => '');
		log('warn', 'send-media', 'media fetch refused', {
			status: resp.status,
			host: new URL(url).host,
			path: new URL(url).pathname,
			server: resp.headers.get('server'),
			cfRay: resp.headers.get('cf-ray'),
			contentType: resp.headers.get('content-type'),
			body: body.slice(0, 200),
		});
		throw new Error(`Failed to download media: ${resp.status}`);
	}

	const contentLength = Number(resp.headers.get('content-length') || 0);
	if (contentLength > MAX_UPLOAD_SIZE) {
		throw new Error(`File too large (${(contentLength / 1024 / 1024).toFixed(1)}MB)`);
	}

	const bytes = new Uint8Array(await resp.arrayBuffer());
	if (bytes.length > MAX_UPLOAD_SIZE) {
		throw new Error(`File too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB)`);
	}

	return bytes;
}

async function downloadAsInputFile(url: string, filename: string): Promise<InputFile> {
	return new InputFile(await downloadBytes(url), filename);
}
