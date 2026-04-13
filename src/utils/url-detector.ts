export interface DetectedUrl {
	url: string;
	platform: string;
}

const BLOCKED_DOMAINS = new Set([
	'pornhub.com',
	'xvideos.com',
	'xnxx.com',
	'xhamster.com',
	'redtube.com',
	'youporn.com',
	'tube8.com',
	'spankbang.com',
	'eporner.com',
	'thisvid.com',
	'fapello.com',
	'brazzers.com',
	'bangbros.com',
	'realitykings.com',
	'sex.com',
	'porn.com',
	'rule34.xxx',
	'onlyfans.com',
	'sexarab.com',
]);

const ADULT_HOSTNAME_PATTERN = /\b(porn|sex|xxx|nude|nudes|nsfw|hentai|erotic|adult|onlyfans|fap|xvideos|xnxx|xhamster|sexarab)\b/i;

/**
 * Returns true if the URL's hostname is a known adult domain or contains adult content keywords.
 */
export function isBlockedDomain(url: string): boolean {
	try {
		const hostname = new URL(url).hostname.replace(/^www\./, '');
		return BLOCKED_DOMAINS.has(hostname) || ADULT_HOSTNAME_PATTERN.test(hostname);
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Per-platform URL normalization
// Converts variant/mobile/tracking URLs to a clean canonical form before
// passing to the btch API. This improves compatibility and avoids failures
// caused by extra query params or unsupported subdomains.
// ---------------------------------------------------------------------------

function normalizeYouTube(url: string): string {
	try {
		const u = new URL(url);
		// Short link: youtu.be/{videoId}
		if (u.hostname === 'youtu.be') {
			const videoId = u.pathname.slice(1).split('/')[0];
			if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
		}
		// Shorts: /shorts/{videoId}
		if (u.pathname.startsWith('/shorts/')) {
			const videoId = u.pathname.split('/')[2];
			if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
		}
		// Live: /live/{videoId}
		if (u.pathname.startsWith('/live/')) {
			const videoId = u.pathname.split('/')[2];
			if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
		}
		// Standard or mobile watch URL — strip all params except v=
		const videoId = u.searchParams.get('v');
		if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
	} catch { /* fall through */ }
	return url;
}

function normalizeInstagram(url: string): string {
	try {
		const u = new URL(url);
		// Keep only /{type}/{shortcode}/ — strip igshid, img_index, hl, etc.
		const parts = u.pathname.split('/').filter(Boolean);
		if (parts.length >= 2) {
			// Preserve story ID: /stories/{username}/{storyId}/
			if (parts[0] === 'stories' && parts.length >= 3) {
				return `https://www.instagram.com/${parts[0]}/${parts[1]}/${parts[2]}/`;
			}
			return `https://www.instagram.com/${parts[0]}/${parts[1]}/`;
		}
	} catch { /* fall through */ }
	return url;
}

function normalizeTikTok(url: string): string {
	try {
		const u = new URL(url);
		// Short links (vm / vt) — keep path only, no params
		if (u.hostname === 'vm.tiktok.com' || u.hostname === 'vt.tiktok.com') {
			return `https://${u.hostname}${u.pathname}`;
		}
		// All others (www / m) → www, path only, strip _t, _r, is_from_webapp, etc.
		return `https://www.tiktok.com${u.pathname}`;
	} catch { /* fall through */ }
	return url;
}

function normalizeFacebook(url: string): string {
	try {
		const u = new URL(url);
		// Short links — keep as-is
		if (u.hostname === 'fb.watch') return url;
		// Normalize mobile / web variants → www
		// watch/?v= URLs need the v param preserved
		if (u.pathname.startsWith('/watch')) {
			const v = u.searchParams.get('v');
			return v
				? `https://www.facebook.com/watch/?v=${v}`
				: `https://www.facebook.com/watch/`;
		}
		// All other paths (reel, share/r, share/v, username/videos) — path only
		return `https://www.facebook.com${u.pathname}`;
	} catch { /* fall through */ }
	return url;
}

function normalizeGitHub(url: string): string {
	try {
		const u = new URL(url);
		const parts = u.pathname.split('/').filter(Boolean);
		if (parts.length < 2) return url;
		const [owner, repo] = parts;
		// /owner/repo/blob/branch/path/to/file → raw file URL (direct download)
		if (parts.length >= 5 && parts[2] === 'blob') {
			const branch = parts[3];
			const filePath = parts.slice(4).join('/');
			return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
		}
		// /owner/repo/tree/branch[/subpath] — download that branch as zip
		if (parts.length >= 4 && parts[2] === 'tree') {
			const branch = parts[3];
			return `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
		}
		// /owner/repo — default branch via HEAD redirect
		return `https://github.com/${owner}/${repo}/archive/HEAD.zip`;
	} catch { /* fall through */ }
	return url;
}

function normalizeTwitter(url: string): string {
	try {
		const u = new URL(url);
		// Normalize x.com → twitter.com for consistent btch API handling
		// Keep only the path (strips UTM and other tracking params)
		const host = u.hostname.replace('x.com', 'twitter.com').replace(/^www\./, '');
		return `https://${host}${u.pathname}`;
	} catch { /* fall through */ }
	return url;
}

/**
 * Normalize a detected URL to its canonical form, stripping tracking params
 * and converting variant/mobile URLs to standard ones.
 */
function normalizeUrl(url: string, platform: string): string {
	switch (platform) {
		case 'YouTube':   return normalizeYouTube(url);
		case 'Instagram': return normalizeInstagram(url);
		case 'TikTok':    return normalizeTikTok(url);
		case 'Facebook':  return normalizeFacebook(url);
		case 'Twitter':   return normalizeTwitter(url);
		case 'GitHub':    return normalizeGitHub(url);
		default:          return url;
	}
}

// ---------------------------------------------------------------------------
// Detection patterns — broad enough to catch variant/mobile URLs.
// Normalization (above) handles converting them to canonical form.
// ---------------------------------------------------------------------------

const PLATFORM_PATTERNS: Array<{ platform: string; pattern: RegExp }> = [
	// YouTube: www / m / music subdomains; watch, shorts, live, youtu.be
	{
		platform: 'YouTube',
		pattern: /https?:\/\/(?:(?:www|m)\.)?(?:youtube\.com\/(?:watch|shorts\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch)\S+/i,
	},
	// Instagram: /p/, /reel/, /tv/ (IGTV), /stories/ — www optional
	{
		platform: 'Instagram',
		pattern: /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv|stories)\/\S+/i,
	},
	// TikTok: www / vm / vt / m subdomains
	{
		platform: 'TikTok',
		pattern: /https?:\/\/(?:(?:www|vm|vt|m)\.)?tiktok\.com\/\S+/i,
	},
	// Twitter / X
	{
		platform: 'Twitter',
		pattern: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/\S+\/status\/\S+/i,
	},
	// Facebook: www / m / web subdomains; share/r, share/v, watch, reel, /videos/; fb.watch
	{
		platform: 'Facebook',
		pattern: /https?:\/\/(?:(?:www|m|web)\.)?facebook\.com\/(?:share\/[rv]\/|watch\/?|reel\/|\S+\/videos\/)\S*|https?:\/\/fb\.watch\/\S+/i,
	},
	// Threads
	{
		platform: 'Threads',
		pattern: /https?:\/\/(?:www\.)?threads\.(?:net|com)\/@\S+\/post\/\S+/i,
	},
	// SoundCloud
	{
		platform: 'SoundCloud',
		pattern: /https?:\/\/(?:www\.)?soundcloud\.com\/\S+\/\S+/i,
	},
	// Spotify
	{
		platform: 'Spotify',
		pattern: /https?:\/\/(?:open\.)?spotify\.com\/track\/\S+/i,
	},
	// Pinterest
	{
		platform: 'Pinterest',
		pattern: /https?:\/\/(?:[a-z]{2}\.)?pinterest\.com\/pin\/\S+|https?:\/\/pin\.it\/\S+/i,
	},
	// GitHub: repo root, /tree/branch (zip), or /blob/branch/file (raw file download)
	{
		platform: 'GitHub',
		pattern: /https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\/(?:tree|blob)\/\S+)?\/?(?=\s|$)/i,
	},
];

/** Generic URL pattern — catches any https:// URL not matched by specific platforms. */
const GENERIC_URL_PATTERN = /https?:\/\/\S+/i;

/** Detects if the URL points directly to a file based on its extension. */
export function getDirectFileMediaType(url: string): 'video' | 'audio' | 'photo' | 'document' | null {
	try {
		const u = new URL(url);
		
		// Ensure the path actually has a file name with an extension
		const filename = u.pathname.split('/').pop();
		if (!filename || !filename.includes('.')) return null;

		const ext = filename.split('.').pop()?.toLowerCase();
		if (!ext) return null;

		if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'video';
		if (['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) return 'audio';
		if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) return 'photo';
		if (['html', 'htm', 'php', 'asp', 'aspx', 'jsp'].includes(ext)) return null; // Not a downloadable media/file
		if (ext.length > 15) return null; // Unlikely to be a valid file extension

		// Default unknown types to 'document' so they are sent as files
		return 'document';
	} catch {
		return null;
	}
}

/**
 * Detect the first supported media platform URL in message text.
 * Returns a normalized (canonical) URL alongside the platform name.
 * Falls back to a generic URL match so the AIO endpoint can try any link.
 */
export function detectMediaUrl(text: string): DetectedUrl | null {
	for (const { platform, pattern } of PLATFORM_PATTERNS) {
		const match = text.match(pattern);
		if (match) {
			return { url: normalizeUrl(match[0], platform), platform };
		}
	}
	// Generic fallback — let AIO try any URL
	const generic = text.match(GENERIC_URL_PATTERN);
	if (generic) {
		// Derive a readable platform name from the hostname
		try {
			const hostname = new URL(generic[0]).hostname.replace(/^www\./, '');
			const parts = hostname.split('.');
			const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
			return { url: generic[0], platform: name.charAt(0).toUpperCase() + name.slice(1) };
		} catch {
			return { url: generic[0], platform: 'Other' };
		}
	}

	// Retry with https:// prepended for protocol-less URLs (e.g. "twitter.com/i/status/123")
	const noProto = text.match(/(?:^|\s)((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\/\S+)/);
	if (noProto) {
		return detectMediaUrl(`https://${noProto[1]}`);
	}

	return null;
}
