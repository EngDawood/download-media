import type { DownloaderMode, DownloaderOptions, DownloaderResult } from './downloader';

export interface IDownloaderProvider {
	/** Hostname substrings this provider handles (e.g. ['tiktok.com']). */
	readonly platforms: string[];
	download(url: string, mode: DownloaderMode, opts?: DownloaderOptions): Promise<DownloaderResult>;
	/** Optional: fetch lightweight metadata for picker UIs (TikTok, Facebook). */
	fetchInfo?(url: string): Promise<unknown>;
}
