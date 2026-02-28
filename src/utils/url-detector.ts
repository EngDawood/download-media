export interface DetectedUrl {
	url: string;
	platform: string;
}

const PLATFORM_PATTERNS: Array<{ platform: string; pattern: RegExp }> = [
	{ platform: 'YouTube', pattern: /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch)\S+/i },
	{ platform: 'Instagram', pattern: /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|stories)\/\S+/i },
	{ platform: 'TikTok', pattern: /https?:\/\/(?:(?:www|vm|vt)\.)?tiktok\.com\/\S+/i },
	{ platform: 'Twitter', pattern: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/\S+\/status\/\S+/i },
	{ platform: 'Facebook', pattern: /https?:\/\/(?:(?:www\.)?facebook\.com\/(?:share\/r\/|watch\/|\S+\/videos\/)|fb\.watch\/)\S+/i },
	{ platform: 'Threads', pattern: /https?:\/\/(?:www\.)?threads\.(?:net|com)\/@\S+\/post\/\S+/i },
	{ platform: 'SoundCloud', pattern: /https?:\/\/(?:www\.)?soundcloud\.com\/\S+\/\S+/i },
	{ platform: 'Spotify', pattern: /https?:\/\/(?:open\.)?spotify\.com\/track\/\S+/i },
	{ platform: 'Pinterest', pattern: /https?:\/\/(?:[a-z]{2}\.)?pinterest\.com\/pin\/\S+|https?:\/\/pin\.it\/\S+/i },
];

/** Generic URL pattern — catches any https:// URL not matched by specific platforms. */
const GENERIC_URL_PATTERN = /https?:\/\/\S+/i;

/**
 * Detect the first supported media platform URL in message text.
 * Falls back to a generic URL match so the AIO endpoint can try any link.
 */
export function detectMediaUrl(text: string): DetectedUrl | null {
	for (const { platform, pattern } of PLATFORM_PATTERNS) {
		const match = text.match(pattern);
		if (match) {
			return { url: match[0], platform };
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
	return null;
}
