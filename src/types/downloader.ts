/**
 * Shared types for the media downloader.
 * Consumed by media-downloader.ts and the Telegram bot handlers.
 */

import type { FailureKind } from '../services/downloader/failure';

export type DownloaderMode = 'auto' | 'audio' | 'hd' | 'sd';

export interface MediaItem {
	type: 'video' | 'photo' | 'audio' | 'document';
	url: string;
	buffer?: Uint8Array; // in-memory binary data (overrides url for upload)
	filename?: string; // filename for buffer-based items
	quality?: string;
	filesize?: number;
}

export interface DownloaderResult {
	status: 'success' | 'error' | 'picker';
	media?: MediaItem[];
	caption?: string;
	/** Raw (unformatted) title of the content — used to name audio files sent to Telegram. */
	title?: string;
	thumbnail?: string;
	/**
	 * Full body of long-form content (X Articles, threads) as Markdown.
	 * The Telegram bot ignores this — it cannot fit in a caption and uses the Telegraph
	 * link instead. Surfaced only by the MCP route, where clients can take the whole text.
	 */
	fullText?: string;
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
