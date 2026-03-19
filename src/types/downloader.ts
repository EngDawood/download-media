/**
 * Shared types for the media downloader.
 * Consumed by media-downloader.ts and the Telegram bot handlers.
 */

export type DownloaderMode = 'auto' | 'audio' | 'hd' | 'sd';

export interface MediaItem {
	type: 'video' | 'photo' | 'audio' | 'document';
	url: string;
	quality?: string;
	filesize?: number;
}

export interface DownloaderResult {
	status: 'success' | 'error' | 'picker';
	media?: MediaItem[];
	caption?: string;
	thumbnail?: string;
	mp3Url?: string;
	error?: string;
}
