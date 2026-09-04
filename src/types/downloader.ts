/**
 * Shared types for the media downloader.
 * Consumed by media-downloader.ts and the Telegram bot handlers.
 */

import type { FailureKind } from '../services/downloader/failure';

export type DownloaderMode = 'auto' | 'audio' | 'hd' | 'sd';

/**
 * One alternate rendition of the same video, for platforms that hand us the whole
 * ladder in the response we already make (X/Twitter). Lets the sender step down to a
 * smaller file when the best one is over Telegram's limit, and lets the user pick a
 * different one afterwards. Providers emit these best-first.
 */
export interface MediaVariant {
	/** Shown on picker buttons and in the done message, e.g. '1080p'. */
	label: string;
	url: string;
	height: number;
	/** Byte size — absent until a preflight HEAD measures it. */
	filesize?: number;
}

export interface MediaItem {
	type: 'video' | 'photo' | 'audio' | 'document';
	url: string;
	buffer?: Uint8Array; // in-memory binary data (overrides url for upload)
	filename?: string; // filename for buffer-based items
	quality?: string;
	filesize?: number;
	/** Alternate renditions of `url`, best-first. Only set when the provider found more than one. */
	variants?: MediaVariant[];
}

export interface DownloaderResult {
	status: 'success' | 'error' | 'picker';
	media?: MediaItem[];
	caption?: string;
	/** Raw (unformatted) title of the content — used to name audio files sent to Telegram. */
	title?: string;
	thumbnail?: string;
	/**
	 * HTML message the bot sends on its own, right after the media — used by X threads to
	 * put the Telegraph link in a separate message instead of crowding the media caption.
	 * Ignored by the MCP route, which gets the whole body in `fullText`.
	 */
	followUp?: string;
	/**
	 * Full body of long-form content (X Articles, threads) as Markdown.
	 * The Telegram bot ignores this — it cannot fit in a caption and uses the Telegraph
	 * link instead. Surfaced only by the MCP route, where clients can take the whole text.
	 */
	fullText?: string;
	/**
	 * Same body as `fullText`, rendered as an HTML fragment (no `<html>`/`<body>` wrapper).
	 * Set for X Articles only — threads have no HTML renderer. Text is escaped and
	 * non-http(s) links are stripped, so it is safe to embed.
	 */
	fullHtml?: string;
	mp3Url?: string;
	error?: string;
	/** True when the error is transient (e.g. backend still extracting) and retrying is likely to succeed. */
	retryable?: boolean;
	/**
	 * Why the download failed. Set on every `status: 'error'` result so callers can decide
	 * whether retrying can possibly help, instead of guessing from the message text.
	 */
	failureKind?: FailureKind;
}
