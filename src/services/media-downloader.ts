import { log } from '../utils/logger';
import type { DownloaderMode, MediaItem, DownloaderResult } from '../types/downloader';
import { ProviderRegistry } from './downloader/provider-registry';
import { tryAIO } from './downloader/aio-parser';
import { btchFetch } from './downloader/btch-client';
import { buildCaption, isUrl, formatFileSize } from './downloader/media-helpers';
import { TikTokProvider } from './downloader/platforms/tiktok';
import { InstagramProvider } from './downloader/platforms/instagram';
import { TwitterProvider } from './downloader/platforms/twitter';
import { YouTubeProvider } from './downloader/platforms/youtube';
import { FacebookProvider } from './downloader/platforms/facebook';
import { ThreadsProvider } from './downloader/platforms/threads';
import { SoundCloudProvider } from './downloader/platforms/soundcloud';
import { SpotifyProvider } from './downloader/platforms/spotify';
import { PinterestProvider } from './downloader/platforms/pinterest';

export type { DownloaderMode, MediaItem, DownloaderResult };
export { formatFileSize };

// ─── Re-export helpers consumed by callbacks ─────────────────────────────────
export {
	isBtchLimitError,
	btchFetch,
} from './downloader/btch-client';
export {
	parseAioGallery,
	parseLinksSection,
	tryAIO,
} from './downloader/aio-parser';
export {
	isUrl,
	detectMediaType,
	detectTypeFromJwtUrl,
	buildCaption,
	decodeTiktokDirectUrl,
} from './downloader/media-helpers';

// ─── Registry ────────────────────────────────────────────────────────────────

function buildRegistry(telegraphAccessToken: string): ProviderRegistry {
	return new ProviderRegistry([
		new TikTokProvider(),
		new InstagramProvider(),
		new TwitterProvider(telegraphAccessToken),
		new YouTubeProvider(),
		new FacebookProvider(),
		new ThreadsProvider(),
		new SoundCloudProvider(),
		new SpotifyProvider(),
		new PinterestProvider(),
	]);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Download media from a URL.
 * @param mode 'auto' returns video/photo, 'audio' returns audio, 'hd'/'sd' for quality
 * @param platform Optional platform hint from url-detector (skips hostname re-detection)
 * @param env Cloudflare Workers env — required for Telegraph article publishing
 */
export async function downloadMedia(
	url: string,
	mode: DownloaderMode = 'auto',
	platform?: string,
	env?: { TELEGRAPH_ACCESS_TOKEN?: string },
): Promise<DownloaderResult> {
	const registry = buildRegistry(env?.TELEGRAPH_ACCESS_TOKEN ?? '');
	try {
		const result = await registry.download(url, mode, platform);
		if (result) return result;
		return await downloadAIO(url, mode);
	} catch (err: any) {
		log('error', 'downloader', 'Error', { error: err?.message });
		const raw: string = err.message || 'Unknown error';
		const userError = /btch |all servers failed|AggregateError/i.test(raw)
			? 'Download service temporarily unavailable. Please try again or use the Retry button.'
			: raw;
		return { status: 'error', error: userError };
	}
}

/**
 * Fetch TikTok video info for the picker UI (caption, image post flag, audio availability).
 */
export async function fetchTikTokInfo(
	url: string,
): Promise<{ caption: string; isImagePost: boolean; audioAvailable: boolean } | null> {
	const registry = buildRegistry('');
	const provider = registry.findForUrl(url) as TikTokProvider | null;
	return provider?.fetchInfo?.(url) as Promise<{ caption: string; isImagePost: boolean; audioAvailable: boolean } | null> ?? null;
}

/**
 * Fetch Facebook video info for the quality picker (HD/SD labels with sizes).
 */
export async function fetchFacebookInfo(url: string): Promise<{ hdLabel: string; sdLabel: string } | null> {
	const registry = buildRegistry('');
	const provider = registry.findForUrl(url) as FacebookProvider | null;
	return provider?.fetchInfo?.(url) as Promise<{ hdLabel: string; sdLabel: string } | null> ?? null;
}

// ─── AIO catch-all (platforms not matched by registry) ───────────────────────

async function downloadAIO(url: string, mode: string): Promise<DownloaderResult> {
	const result = await tryAIO(url, mode);
	if (result) return result;
	try {
		const res = await btchFetch('aio', url);
		const caption = buildCaption(res.data?.title || res.title);
		if (mode === 'audio' && isUrl(res.mp3)) return { status: 'success', media: [{ type: 'audio', url: res.mp3 }], caption };
		if (isUrl(res.mp4)) return { status: 'success', media: [{ type: 'video', url: res.mp4 }], caption };
	} catch (e) {
		log('warn', 'downloader:AIO', 'flat-field fallback failed', { error: (e as Error).message });
	}
	return { status: 'error', error: 'Unsupported platform or no media found' };
}
