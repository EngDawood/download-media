import type { IDownloaderProvider } from '../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../types/downloader';

export class ProviderRegistry {
	constructor(private readonly providers: IDownloaderProvider[]) {}

	findForUrl(url: string, platformHint?: string): IDownloaderProvider | null {
		const target = (platformHint ?? this.hostnameOf(url)).toLowerCase();
		return this.providers.find(p => p.platforms.some(h => target.includes(h))) ?? null;
	}

	async download(url: string, mode: DownloaderMode, platformHint?: string): Promise<DownloaderResult | null> {
		const provider = this.findForUrl(url, platformHint);
		return provider ? provider.download(url, mode) : null;
	}

	private hostnameOf(url: string): string {
		try { return new URL(url).hostname; } catch { return url; }
	}
}
