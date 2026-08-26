import type { IDownloaderProvider } from '../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../types/downloader';

export class ProviderRegistry {
	constructor(private readonly providers: IDownloaderProvider[]) {}

	findForUrl(url: string, platformHint?: string): IDownloaderProvider | null {
		const hostname = this.hostnameOf(url).toLowerCase();
		// Hostname match is authoritative — the hint is a name derived from an unrelated
		// hostname when the URL detector fell through to its generic branch (e.g. `t.me`
		// yields hint "t"), and matching that against provider domains routes Telegram
		// links to TikTok because "tiktok.com".includes("t"). Short hints (< 3 chars)
		// are dropped for that reason; longer hints only participate when they align
		// with a provider domain from BOTH sides — the platform key contains the hint
		// AND the hint contains the platform key's leading token — so "instagram" still
		// finds InstagramProvider without "ig" ever matching it.
		const hint = platformHint && platformHint.length >= 3 ? platformHint.toLowerCase() : undefined;
		return (
			this.providers.find((p) =>
				p.platforms.some((h) => {
					if (hostname.includes(h)) return true;
					if (!hint) return false;
					const key = h.split('.')[0];
					return h.includes(hint) && hint.includes(key);
				}),
			) ?? null
		);
	}

	async download(url: string, mode: DownloaderMode, platformHint?: string): Promise<DownloaderResult | null> {
		const provider = this.findForUrl(url, platformHint);
		return provider ? provider.download(url, mode) : null;
	}

	private hostnameOf(url: string): string {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	}
}
