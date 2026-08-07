import type { DownloaderMode, DownloaderResult } from './downloader';

export interface IDownloaderProvider {
	/** Hostname substrings this provider handles (e.g. ['tiktok.com']). */
	readonly platforms: string[];
	download(url: string, mode: DownloaderMode): Promise<DownloaderResult>;
	/** Optional: fetch lightweight metadata for picker UIs (TikTok, Facebook). */
	fetchInfo?(url: string): Promise<unknown>;
}
