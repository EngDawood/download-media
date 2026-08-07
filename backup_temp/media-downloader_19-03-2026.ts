import { log } from '../utils/logger';

const BTCH_SERVERS = [
	'https://backend2.tioo.eu.org',
	'https://backend3.tioo.eu.org',
	'https://backend4.tioo.eu.org',
	'https://backend1.tioo.eu.org',
];
const BTCH_HEADERS = {
	'User-Agent': 'btch/6.0.25',
	'X-Client-Version': '6.0.25',
	'Content-Type': 'application/json',
};

/**
 * tiktokio.com obfuscates parts of the base64 token by replacing common characters with numeric strings.
 */
const DECODE_MAP: Record<string, string> = {
	'000': 'h',
	'001': 'i',
	'002': 'j',
	'003': 'k',
	'004': 'l',
	'005': 'm',
	'006': 'n',
	'007': 'o',
	'008': 'p',
	'009': 'q',
};

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

/**
 * Fetch from btch API with server failover.
 * Tries each backend in order; moves to next on 5xx or network error.
 */
async function btchFetch(endpoint: string, url: string, retryOn4xx = false): Promise<any> {
	let lastError: Error | null = null;
	for (const server of BTCH_SERVERS) {
		try {
			const res = await fetch(`${server}/api/downloader/${endpoint}?url=${encodeURIComponent(url)}`, {
				headers: BTCH_HEADERS,
				signal: AbortSignal.timeout(30_000),
			});
			if (res.status >= 500) {
				log('warn', `btch:${endpoint}`, '5xx, trying next server', { server, status: res.status });
				lastError = new Error(`btch ${endpoint} returned ${res.status}`);
				continue;
			}
			if (!res.ok) {
				if (retryOn4xx) {
					log('warn', `btch:${endpoint}`, '4xx, trying next server', { server, status: res.status });
					lastError = new Error(`btch ${endpoint} returned ${res.status}`);
					continue;
				}
				throw new Error(`btch ${endpoint} returned ${res.status}`);
			}
			const data: any = await res.json();
			if (typeof data === 'string') throw new Error(`btch ${endpoint}: ${data}`);

			// Detect "Limit reached" or "Maintenance" messages that should trigger failover
			const msg = (data.msg || data.message || '').toLowerCase();
			const isLimit = data.code === -1 || msg.includes('limit') || msg.includes('maintenance');
			if (isLimit) {
				log('warn', `btch:${endpoint}`, 'limit/maintenance reached, trying next server', { server, msg: data.msg });
				lastError = new Error(`btch ${endpoint}: ${data.msg || 'limit reached'}`);
				continue;
			}

			if (data.error) throw new Error(`btch ${endpoint}: ${data.error}`);
			return data;
		} catch (err: any) {
			const isTimeout = err.name === 'TimeoutError';
			const is5xx = err.message?.includes('returned 5');
			const is4xx = err.message?.includes('returned 4');
			const errLabel = isTimeout ? 'timeout' : err.message;
			log('warn', `btch:${endpoint}`, errLabel, { server });
			lastError = err;
			if (isTimeout || is5xx) continue;
			if (is4xx && retryOn4xx) continue;
			throw err;
		}
	}
	throw lastError || new Error(`btch ${endpoint}: all servers failed`);
}

/** Check if a value is a valid non-empty URL string */
function isUrl(val: unknown): val is string {
	return typeof val === 'string' && val.startsWith('http');
}

/**
 * Detect photo vs video from a rapidcdn.app JWT URL by decoding the payload.
 */
function detectTypeFromJwtUrl(url: string): 'photo' | 'video' {
	try {
		const token = new URL(url).searchParams.get('token');
		if (token) {
			const payloadB64 = token.split('.')[1];
			const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
			const hint = payload.filename || payload.url || '';
			if (/\.(jpg|jpeg|png|webp|heic|gif)/i.test(hint)) return 'photo';
		}
	} catch { /* ignore decode errors */ }
	return 'video';
}

function detectMediaType(url: string): 'photo' | 'video' | 'document' {
	if (url.includes('rapidcdn.app')) return detectTypeFromJwtUrl(url);
	if (/\.(jpg|jpeg|png|webp|heic|gif)/i.test(url)) return 'photo';
	if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|txt|csv)/i.test(url)) return 'document';
	return 'video';
}

/**
 * Extract the direct CDN URL from a tiktokio.com download token.
 */
function decodeTiktokDirectUrl(proxyUrl: string): string | null {
	try {
		const u = new URL(proxyUrl);
		const token = u.searchParams.get('token');
		if (!token) return null;

		// 1. Remove O0O0O suffix
		let cleaned = token.replace(/O0O0O$/, '');

		// 2. Decode obfuscated numeric strings (000-009) back to common characters
		for (const [key, value] of Object.entries(DECODE_MAP)) {
			cleaned = cleaned.replaceAll(key, value);
		}

		// 3. Reconstruct base64 (add 'aHR0c' prefix which is 'http' in base64)
		let b64 = 'aHR0c' + cleaned.slice(10);

		// 4. Add base64 padding if needed
		while (b64.length % 4 !== 0) b64 += '=';

		const decoded = atob(b64);
		const match = decoded.match(/^(https?:\/\/.+?\.\w{2,4})/);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}

/** Build a caption string from title. Strips Facebook engagement metadata (e.g. "404K views · 8.7K reactions | ") if present. */
function buildCaption(title?: string): string {
	if (!title) return '';
	const pipeIndex = title.indexOf(' | ');
	if (pipeIndex !== -1) {
		const prefix = title.slice(0, pipeIndex);
		if (/views/.test(prefix) || /reactions/.test(prefix) || /likes/.test(prefix)) {
			title = title.slice(pipeIndex + 3).trim();
		}
	}
	if (!title) return '';
	return `<b>${title}</b>`;
}

/**
 * Fetch the full tweet text via Twitter's public oEmbed API.
 * Returns `"Author - full text"` or empty string on failure.
 * Runs in parallel with the media fetch so no latency is added.
 */
async function fetchTwitterFullCaption(url: string): Promise<string> {
	try {
		const resp = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`);
		if (!resp.ok) return '';
		const data = await resp.json() as { html?: string; author_name?: string };
		if (!data.html) return '';
		// Extract tweet text from the <p> tag inside the blockquote
		const match = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/);
		if (!match) return '';
		const text = match[1]
			.replace(/<a[^>]*>([^<]*)<\/a>/g, '$1') // <a>text</a> → text
			.replace(/<[^>]+>/g, '')                  // strip remaining tags
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.trim();
		return text;
	} catch {
		return '';
	}
}

/**
 * Try AIO endpoint first — returns richer data (caption, author, gallery, quality options).
 * Returns null if AIO fails or has no media, so caller can fall back to platform-specific endpoint.
 */
async function tryAIO(url: string, mode: string = 'auto'): Promise<DownloaderResult | null> {
	try {
		const res = await btchFetch('aio', url);
		const data = res.data;
		if (!data) return null;

		const caption = buildCaption(data.title);
		const thumbnail = data.thumbnail;
		const media: MediaItem[] = [];

		// Handle carousel/gallery posts (Instagram, etc.)
		if (data.gallery?.items?.length > 0) {
			for (const item of data.gallery.items) {
				let mediaUrl: string | null = null;
				if (Array.isArray(item.resources) && item.resources.length > 0) {
					mediaUrl = item.resources[0]?.src || null;
				}
				if (!mediaUrl && isUrl(item.urls?.url)) {
					mediaUrl = item.urls.url;
				}
				if (mediaUrl && isUrl(mediaUrl)) {
					media.push({ type: detectMediaType(mediaUrl), url: mediaUrl });
				}
			}
		}

		// Handle video/audio/photo links (if no gallery items found)
		if (media.length === 0 && data.links) {
			if (mode === 'audio') {
				const audioLinks = data.links.audio;
				if (audioLinks) {
					const entries = Array.isArray(audioLinks) ? audioLinks : Object.values(audioLinks);
					for (const a of entries as any[]) {
						if (isUrl(a?.url)) {
							media.push({ type: 'audio', url: a.url, quality: a.q_text });
						}
					}
				}
			}
			if (media.length === 0) {
				const videoLinks = data.links.video;
				if (videoLinks) {
					const entries = Array.isArray(videoLinks) ? videoLinks : Object.values(videoLinks);
					for (const v of entries as any[]) {
						if (isUrl(v?.url)) {
							media.push({ type: 'video', url: v.url, quality: v.q_text || v.resolution });
						}
					}
				}
			}
			// Photo/image links (e.g. Twitter photo tweets)
			if (media.length === 0) {
				const photoLinks = data.links.photo || data.links.image;
				if (photoLinks) {
					const entries = Array.isArray(photoLinks) ? photoLinks : Object.values(photoLinks);
					for (const p of entries as any[]) {
						if (isUrl(p?.url)) {
							media.push({ type: 'photo', url: p.url });
						} else if (typeof p === 'string' && isUrl(p)) {
							media.push({ type: 'photo', url: p });
						}
					}
				}
			}
		}

		if (media.length > 0) {
			return { status: 'success', media, caption, thumbnail };
		}
	} catch (e) {
		log('warn', 'downloader:AIO', 'tryAIO failed', { error: (e as Error).message });
	}
	return null;
}

/**
 * Download media from a URL using platform-specific btch API endpoints.
 * @param mode 'auto' returns video/photo, 'audio' returns audio, 'hd'/'sd' for quality
 */
export async function downloadMedia(url: string, mode: 'auto' | 'audio' | 'hd' | 'sd' = 'auto'): Promise<DownloaderResult> {
	try {
		const lowerUrl = url.toLowerCase();

		// 1. TikTok — use rich 'tiktok' endpoint, fallback to 'ttdl'
		if (lowerUrl.includes('tiktok.com')) {
			return await downloadTikTok(url, mode);
		}

		// 2. Instagram
		if (lowerUrl.includes('instagram.com')) {
			return await downloadInstagram(url);
		}

		// 3. Twitter / X
		if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
			return await downloadTwitter(url);
		}

		// 4. YouTube — use AIO for quality options
		if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') || lowerUrl.includes('music.youtube.com')) {
			return await downloadYouTube(url, mode);
		}

		// 5. Facebook
		if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) {
			return await downloadFacebook(url, mode);
		}

		// 6. Threads
		if (lowerUrl.includes('threads.net') || lowerUrl.includes('threads.com')) {
			return await downloadThreads(url, mode);
		}

		// 7. SoundCloud
		if (lowerUrl.includes('soundcloud.com')) {
			return await downloadSoundCloud(url);
		}

		// 8. Spotify
		if (lowerUrl.includes('spotify.com')) {
			return await downloadSpotify(url);
		}

		// 9. Pinterest
		if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) {
			return await downloadPinterest(url);
		}

		// Catch-all fallback using AIO
		return await downloadAIO(url, mode);
	} catch (err: any) {
		log('error', 'downloader', 'Error', { error: err?.message });
		const raw: string = err.message || 'Unknown error';
		// Don't expose internal btch API error details to the user
		const userError = /btch |all servers failed|AggregateError/i.test(raw)
			? 'Download service temporarily unavailable. Please try again or use the Retry button.'
			: raw;
		return { status: 'error', error: userError };
	}
}

// ─── Platform handlers ───────────────────────────────────────────

async function downloadTikTok(url: string, mode: string): Promise<DownloaderResult> {
	// Try richer 'tiktok' endpoint first for quality options
	try {
		const res = await btchFetch('tiktok', url, true);
		const data = res.data;
		if (data) {
			const caption = buildCaption(data.title);
			const thumbnail = data.cover || data.origin_cover;

			// Image/slideshow post
			if (Array.isArray(data.images) && data.images.length > 0) {
				const photos: MediaItem[] = data.images
					.filter((img: any) => isUrl(typeof img === 'string' ? img : img?.url))
					.map((img: any) => ({ type: 'photo' as const, url: typeof img === 'string' ? img : img.url }));
				if (photos.length > 0) {
					return { status: 'success', media: photos, caption, thumbnail };
				}
			}

			if (mode === 'audio' && isUrl(data.music)) {
				return { status: 'success', media: [{ type: 'audio', url: data.music }], caption, thumbnail };
			}
			if (mode === 'sd' && isUrl(data.play)) {
				return { status: 'success', media: [{ type: 'video', url: data.play }], caption, thumbnail, mp3Url: isUrl(data.music) ? data.music : undefined };
			}
			// Default: use play (H.264, Telegram-compatible)
			if (isUrl(data.play)) {
				return { status: 'success', media: [{ type: 'video', url: data.play }], caption, thumbnail, mp3Url: isUrl(data.music) ? data.music : undefined };
			}
		}
	} catch (e) {
		log('warn', 'downloader:TikTok', 'tiktok endpoint failed, trying ttdl', { error: (e as Error).message });
	}

	// Fallback to 'ttdl' (alternative endpoint)
	const res = await btchFetch('ttdl', url, true);
	const caption = buildCaption(res.title);
	const ttdlThumb = isUrl(res.cover) ? res.cover : isUrl(res.thumbnail) ? res.thumbnail : undefined;
	const ttdlAudio = Array.isArray(res.audio) && isUrl(res.audio[0]) ? decodeTiktokDirectUrl(res.audio[0]) || res.audio[0] : undefined;

	if (mode === 'audio' && ttdlAudio) {
		return { status: 'success', media: [{ type: 'audio', url: ttdlAudio }], caption, thumbnail: ttdlThumb };
	}
	if (Array.isArray(res.video) && isUrl(res.video[0])) {
		const directVideo = decodeTiktokDirectUrl(res.video[0]) || res.video[0];
		return { status: 'success', media: [{ type: 'video', url: directVideo }], caption, thumbnail: ttdlThumb, mp3Url: ttdlAudio };
	}
	return { status: 'error', error: 'No TikTok media found' };
}

async function downloadInstagram(url: string): Promise<DownloaderResult> {
	// Try AIO first — returns caption, author, gallery (carousel), and media links
	try {
		const res = await btchFetch('aio', url, true);
		const data = res.data;
		if (data) {
			const caption = buildCaption(data.title);
			const thumbnail = data.thumbnail;
			const media: MediaItem[] = [];

			// Handle carousel/gallery posts
			if (data.gallery?.items?.length > 0) {
				for (const item of data.gallery.items) {
					let mediaUrl: string | null = null;
					if (Array.isArray(item.resources) && item.resources.length > 0) {
						mediaUrl = item.resources[0]?.src || null;
					}
					if (!mediaUrl && isUrl(item.urls?.url)) {
						mediaUrl = item.urls.url;
					}
					if (mediaUrl && isUrl(mediaUrl)) {
						media.push({ type: detectMediaType(mediaUrl), url: mediaUrl });
					}
				}
			}

			// Handle single video/audio via links
			if (media.length === 0 && data.links) {
				const videoLinks = data.links.video;
				if (videoLinks) {
					const entries = Array.isArray(videoLinks) ? videoLinks : Object.values(videoLinks);
					for (const v of entries as any[]) {
						if (isUrl(v?.url)) {
							media.push({ type: 'video', url: v.url, quality: v.q_text || v.resolution });
						}
					}
				}
			}

			if (media.length > 0) {
				return {
					status: 'success',
					media,
					caption,
					thumbnail,
				};
			}
		}
	} catch (e) {
		log('warn', 'downloader:Instagram', 'aio failed, trying igdl', { error: (e as Error).message });
	}

	// Fallback to igdl — no caption available
	const res = await btchFetch('igdl', url, true);
	const items = Array.isArray(res) ? res : Array.isArray(res.result) ? res.result : null;
	if (items && items.length > 0 && isUrl(items[0]?.url)) {
		return {
			status: 'success',
			media: items.filter((item: any) => isUrl(item.url)).map((item: any) => ({
				type: detectMediaType(item.url),
				url: item.url,
			})),
			caption: '',
			thumbnail: items[0]?.thumbnail,
		};
	}
	return { status: 'error', error: 'No Instagram media found' };
}

async function downloadTwitter(url: string): Promise<DownloaderResult> {
	// Fetch full caption via oEmbed in parallel with media — no added latency
	let aioResult: Awaited<ReturnType<typeof tryAIO>> = null;
	let fullText = '';
	try {
		[aioResult, fullText] = await Promise.all([
			tryAIO(url),
			fetchTwitterFullCaption(url),
		]);
	} catch (e) {
		log('warn', 'downloader:Twitter', 'aio failed, trying twitter endpoint', { error: (e as Error).message });
	}
	const caption = fullText ? `<b>${fullText}</b>` : undefined;

	if (aioResult?.media) {
		const videos = aioResult.media.filter(m => m.type === 'video');
		// Always keep only the best quality video (first = highest quality)
		const base = videos.length > 0 ? { ...aioResult, media: [videos[0]] } : aioResult;
		return caption ? { ...base, caption } : base;
	}

	// Fallback 1: BTCH twitter endpoint
	try {
		const res = await btchFetch('twitter', url, true);
		const fallbackCaption = caption ?? buildCaption(res.title);
		const twitterThumb = isUrl(res.thumbnail) ? res.thumbnail : undefined;
		const media: MediaItem[] = [];

		if (Array.isArray(res.url) && res.url.length > 0) {
			for (const item of res.url) {
				if (typeof item === 'object' && item !== null && Object.keys(item).length > 0) {
					const mediaUrl = isUrl(item.hd) ? item.hd : isUrl(item.sd) ? item.sd : null;
					if (mediaUrl) media.push({ type: detectMediaType(mediaUrl), url: mediaUrl });
				} else if (typeof item === 'string' && isUrl(item)) {
					media.push({ type: detectMediaType(item), url: item });
				}
			}
		}

		if (media.length === 0 && isUrl(res.url)) {
			media.push({ type: detectMediaType(res.url), url: res.url });
		}

		// Photo tweets — check image/images fields
		if (media.length === 0 && Array.isArray(res.images) && res.images.length > 0) {
			const photos = res.images
				.filter((img: any) => isUrl(typeof img === 'string' ? img : img?.url))
				.map((img: any) => ({ type: 'photo' as const, url: typeof img === 'string' ? img : img.url }));
			if (photos.length > 0) media.push(...photos);
		}

		if (media.length === 0 && isUrl(res.image)) {
			media.push({ type: 'photo', url: res.image });
		}

		if (media.length > 0) {
			// res.url has separate HD and SD items — keep only the best (first = HD)
			return { status: 'success', media: [media[0]], caption: fallbackCaption, thumbnail: twitterThumb };
		}
	} catch (e) {
		log('warn', 'downloader:Twitter', 'btch twitter endpoint failed', { error: (e as Error).message });
	}

	// Fallback 2: FixTwitter API (api.fxtwitter.com) — very reliable for photos/metadata
	try {
		const match = url.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/i);
		if (match) {
			const [, , id] = match;
			// The screen_name in the URL is ignored by the API, so we can just use "i" if needed
			const fxRes = await fetch(`https://api.fxtwitter.com/i/status/${id}`, {
				headers: { 'User-Agent': 'DownloadMediaBot/1.0 (https://github.com/dawo5d/download-media)' },
				signal: AbortSignal.timeout(10_000),
			});

			if (fxRes.status === 401) {
				return { status: 'error', error: 'This tweet is from a private account and cannot be downloaded.' };
			}
			if (fxRes.status === 404) {
				return { status: 'error', error: 'This tweet no longer exists or has been deleted.' };
			}

			if (fxRes.ok) {
				const data: any = await fxRes.json();
				const fxCaption = caption ?? (data.tweet.text ? `<b>${data.tweet.text}</b>` : '');
				const fxAvatar = data.tweet.author?.avatar_url;

				if (data.tweet?.media?.all?.length > 0) {
					const fxMedia: MediaItem[] = data.tweet.media.all.map((m: any) => ({
						type: m.type === 'video' || m.type === 'gif' ? ('video' as const) : ('photo' as const),
						url: m.url,
					}));
					return { status: 'success', media: fxMedia, caption: fxCaption, thumbnail: fxAvatar };
				}

				// If no media but has text, return as a success with no media (handler will need to support this)
				// or return the avatar as a photo with the text as caption.
				if (fxCaption) {
					return {
						status: 'success',
						media: fxAvatar ? [{ type: 'photo', url: fxAvatar }] : [],
						caption: fxCaption,
						thumbnail: fxAvatar,
					};
				}
			}
		}
	} catch (e) {
		log('warn', 'downloader:Twitter', 'fxtwitter fallback failed', { error: (e as Error).message });
	}

	return { status: 'error', error: 'No Twitter media found' };
}

async function downloadYouTube(url: string, mode: string): Promise<DownloaderResult> {
	// URL is already normalized by url-detector.ts (watch?v= form, no tracking params)
	// Try youtube endpoint first — fast and reliable
	try {
		const res = await btchFetch('youtube', url, true);
		const caption = buildCaption(res.title);
		const thumbnail = res.thumbnail;
		if (mode === 'audio' && isUrl(res.mp3)) {
			return { status: 'success', media: [{ type: 'audio', url: res.mp3 }], caption, thumbnail };
		}
		if (mode === 'auto' && isUrl(res.mp4)) {
			return {
				status: 'success',
				media: [{ type: 'video', url: res.mp4 }],
				caption,
				thumbnail,
				mp3Url: isUrl(res.mp3) ? res.mp3 : undefined,
			};
		}
		if (isUrl(res.mp4)) {
			return { status: 'success', media: [{ type: 'video', url: res.mp4 }], caption, thumbnail };
		}
	} catch (e) {
		log('warn', 'downloader:YouTube', 'youtube endpoint failed, trying aio', { error: (e as Error).message });
	}

	// Fallback to AIO endpoint
	try {
		const aio = await btchFetch('aio', url, true);
		const data = aio.data;
		if (data?.links) {
			const caption = buildCaption(data.title);
			const thumbnail = data.thumbnail;

			if (mode === 'audio' && data.links.audio?.length > 0) {
				const best = data.links.audio[0];
				if (isUrl(best.url)) {
					return { status: 'success', media: [{ type: 'audio', url: best.url, quality: best.q_text }], caption, thumbnail };
				}
			}
			if (data.links.video?.length > 0) {
				const videos: MediaItem[] = data.links.video
					.filter((v: any) => isUrl(v.url))
					.map((v: any) => ({ type: 'video' as const, url: v.url, quality: v.q_text }));
				if (videos.length > 0) {
					if (mode !== 'auto' && mode !== 'audio') {
						const match = videos.find(v => v.quality?.includes(mode));
						if (match) return { status: 'success', media: [match], caption, thumbnail };
					}
					return { status: 'success', media: [videos[0]], caption, thumbnail };
				}
			}
		}
	} catch (e) {
		log('warn', 'downloader:YouTube', 'aio also failed', { error: (e as Error).message });
	}

	return { status: 'error', error: 'No YouTube media found' };
}

/** Format bytes to human-readable string */
export function formatFileSize(bytes: number | undefined | null): string {
	if (!bytes || bytes <= 0) return '';
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Fetch TikTok video info (sizes) without downloading.
 * Returns HD/SD sizes for the picker buttons.
 */
export async function fetchTikTokInfo(url: string): Promise<{ caption: string; isImagePost: boolean; audioAvailable: boolean } | null> {
	try {
		const res = await btchFetch('tiktok', url);
		const data = res.data;
		if (data) {
			const caption = buildCaption(data.title);
			return {
				caption,
				isImagePost: Array.isArray(data.images) && data.images.length > 0,
				audioAvailable: isUrl(data.music),
			};
		}
	} catch (e) {
		log('warn', 'downloader', 'fetchTikTokInfo failed', { error: (e as Error).message });
	}
	return null;
}

async function downloadFacebook(url: string, mode: string = 'auto'): Promise<DownloaderResult> {
	// Try AIO first — returns caption and author
	try {
		const aioResult = await tryAIO(url);
		if (aioResult && aioResult.media && aioResult.media.length > 0) {
			const videos = aioResult.media.filter(m => m.type === 'video');
			if (videos.length > 1) {
				// Multiple quality entries — pick based on mode (first = HD, last = SD)
				const selected = mode === 'sd' ? videos[videos.length - 1] : videos[0];
				return { ...aioResult, media: [selected] };
			}
			return aioResult;
		}
	} catch (e) {
		log('warn', 'downloader:Facebook', 'aio failed, trying fbdown', { error: (e as Error).message });
	}

	// Fallback to fbdown endpoint
	const res = await btchFetch('fbdown', url, true);
	const videoUrl = isUrl(res.HD) ? res.HD : isUrl(res.Normal_video) ? res.Normal_video : null;
	if (videoUrl) {
		return { status: 'success', media: [{ type: 'video', url: videoUrl }], caption: buildCaption(res.title) };
	}
	return { status: 'error', error: 'No Facebook media found' };
}

/**
 * Fetch Facebook video info for the quality picker.
 * Returns HD/SD labels with sizes if multiple qualities exist, null if single quality.
 */
export async function fetchFacebookInfo(url: string): Promise<{ hdLabel: string; sdLabel: string } | null> {
	try {
		const res = await btchFetch('aio', url);
		const data = res.data;
		if (!data?.links?.video) return null;
		const entries: any[] = Array.isArray(data.links.video)
			? data.links.video
			: Object.values(data.links.video);
		if (entries.length < 2) return null;
		const first = entries[0];
		const last = entries[entries.length - 1];
		const buildLabel = (e: any, defaultQuality: string): string => {
			const quality = e?.resolution || e?.q_text || defaultQuality;
			const size = (typeof e?.size === 'number' && e.size > 0) ? ` (${formatFileSize(e.size)})` : '';
			return `${quality}${size}`;
		};
		return {
			hdLabel: buildLabel(first, 'HD'),
			sdLabel: buildLabel(last, 'SD'),
		};
	} catch (e) {
		log('warn', 'downloader', 'fetchFacebookInfo failed', { error: (e as Error).message });
	}
	return null;
}

async function downloadThreads(url: string, mode: string): Promise<DownloaderResult> {
	// Try AIO first — returns caption and author
	try {
		const aioResult = await tryAIO(url, mode);
		if (aioResult?.media) {
			const videos = aioResult.media.filter(m => m.type === 'video');
			if (videos.length > 1) return { ...aioResult, media: [videos[0]] };
			return aioResult;
		}
	} catch (e) {
		log('warn', 'downloader:Threads', 'aio failed, trying threads endpoint', { error: (e as Error).message });
	}

	// Fallback to threads endpoint
	const res = await btchFetch('threads', url, true);
	// API returns flat: { status, type: 'video'|'image'|'mixed', video?, image?, download?, title? }
	const hasVideo = res.type === 'video' && isUrl(res.video);
	const hasImage = (res.type === 'image' || res.type === 'mixed') && isUrl(res.image);
	const threadsCap = buildCaption(res.title);

	if (mode === 'audio' && hasVideo) {
		return { status: 'success', media: [{ type: 'audio', url: res.video }], caption: threadsCap };
	}

	if (res.type === 'mixed') {
		const media: MediaItem[] = [];
		if (isUrl(res.video)) media.push({ type: 'video', url: res.video });
		if (isUrl(res.image)) media.push({ type: 'photo', url: res.image });
		if (media.length > 0) return { status: 'success', media, caption: threadsCap };
	}

	if (hasVideo) {
		return { status: 'success', media: [{ type: 'video', url: res.video }], caption: threadsCap };
	}
	if (hasImage) {
		return { status: 'success', media: [{ type: 'photo', url: res.image }], caption: threadsCap };
	}
	if (isUrl(res.download)) {
		return { status: 'success', media: [{ type: 'video', url: res.download }], caption: threadsCap };
	}
	return { status: 'error', error: 'No Threads media found' };
}

async function downloadSoundCloud(url: string): Promise<DownloaderResult> {
	try {
		const res = await btchFetch('soundcloud', url, true);
		// API returns flat: { status, title, thumbnail, audio, downloadMp3, downloadArtwork }
		const audioUrl = isUrl(res.downloadMp3) ? res.downloadMp3 : isUrl(res.audio) ? res.audio : null;
		if (audioUrl) {
			return { status: 'success', media: [{ type: 'audio', url: audioUrl }], caption: buildCaption(res.title), thumbnail: res.thumbnail };
		}
	} catch (e) {
		log('warn', 'downloader:SoundCloud', 'soundcloud endpoint failed, trying aio', { error: (e as Error).message });
	}

	// Fallback to AIO endpoint
	const aioResult = await tryAIO(url, 'audio');
	if (aioResult?.media) return aioResult;
	return { status: 'error', error: 'No SoundCloud audio found' };
}

async function downloadSpotify(url: string): Promise<DownloaderResult> {
	try {
		const res = await btchFetch('spotify', url, true);
		// API returns: { status, res_data: { title, thumbnail, duration, formats: [{url, quality, filesize, ...}] } }
		const data = res.res_data;
		if (data?.formats?.length > 0) {
			const best = data.formats[0];
			if (isUrl(best.url)) {
				return {
					status: 'success',
					media: [{ type: 'audio', url: best.url, quality: best.quality }],
					caption: buildCaption(data.title),
					thumbnail: data.thumbnail,
				};
			}
		}
	} catch (e) {
		log('warn', 'downloader:Spotify', 'spotify endpoint failed, trying aio', { error: (e as Error).message });
	}

	// Fallback to AIO endpoint
	const aioResult = await tryAIO(url, 'audio');
	if (aioResult?.media) return aioResult;
	return { status: 'error', error: 'No Spotify audio found' };
}

async function downloadPinterest(url: string): Promise<DownloaderResult> {
	// Try AIO first — returns caption and author
	try {
		const aioResult = await tryAIO(url);
		if (aioResult?.media) {
			const videos = aioResult.media.filter(m => m.type === 'video');
			if (videos.length > 1) return { ...aioResult, media: [videos[0]] };
			return aioResult;
		}
	} catch (e) {
		log('warn', 'downloader:Pinterest', 'aio failed, trying pinterest endpoint', { error: (e as Error).message });
	}

	// Fallback to pinterest endpoint
	const res = await btchFetch('pinterest', url, true);
	if (res.result) {
		const item = Array.isArray(res.result) ? res.result[0] : res.result;
		const isVideo = item?.is_video && isUrl(item?.video_url);
		const imageUrl = item?.images?.orig?.url || item?.image;
		const mediaUrl = isVideo ? item.video_url : isUrl(imageUrl) ? imageUrl : null;
		if (mediaUrl) {
			const caption = item.title || item.description || '';
			return {
				status: 'success',
				media: [{ type: isVideo ? 'video' : 'photo', url: mediaUrl }],
				caption: buildCaption(caption),
				thumbnail: item?.images?.['236x']?.url,
			};
		}
	}
	return { status: 'error', error: 'No Pinterest media found' };
}

async function downloadAIO(url: string, mode: string): Promise<DownloaderResult> {
	// Use shared tryAIO helper which handles gallery, video, and audio
	const result = await tryAIO(url, mode);
	if (result) return result;

	// Legacy flat fields fallback
	try {
		const res = await btchFetch('aio', url);
		const fallbackCaption = buildCaption(res.data?.title || res.title);
		if (mode === 'audio' && isUrl(res.mp3)) {
			return { status: 'success', media: [{ type: 'audio', url: res.mp3 }], caption: fallbackCaption };
		}
		if (isUrl(res.mp4)) {
			return { status: 'success', media: [{ type: 'video', url: res.mp4 }], caption: fallbackCaption };
		}
	} catch (e) {
		log('warn', 'downloader:AIO', 'flat-field fallback failed', { error: (e as Error).message });
	}

	return { status: 'error', error: 'Unsupported platform or no media found' };
}
