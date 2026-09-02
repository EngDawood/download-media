/** Check if a value is a valid non-empty URL string */
export function isUrl(val: unknown): val is string {
	return typeof val === 'string' && val.startsWith('http');
}

/** Decode the JWT payload embedded in a rapidcdn.app proxy URL. Returns null if absent/undecodable. */
function decodeRapidCdnPayload(url: string): any | null {
	try {
		const token = new URL(url).searchParams.get('token');
		if (!token) return null;
		let b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
		while (b64.length % 4 !== 0) b64 += '=';
		return JSON.parse(atob(b64));
	} catch {
		return null;
	}
}

/**
 * Detect photo vs video from a rapidcdn.app JWT URL by decoding the payload.
 */
export function detectTypeFromJwtUrl(url: string): 'photo' | 'video' {
	const payload = decodeRapidCdnPayload(url);
	const hint = payload?.filename || payload?.url || '';
	return /\.(jpg|jpeg|png|webp|heic|gif)/i.test(hint) ? 'photo' : 'video';
}

/**
 * Stable identity for a media URL, used to de-duplicate results.
 *
 * rapidcdn.app proxy links wrap the real CDN URL in a JWT that is re-signed per
 * request, so the same file can appear under many different tokens. Key on the
 * decoded target instead of the proxy URL; for everything else drop the query
 * string, which carries expiry/signature noise.
 */
export function mediaIdentity(url: string): string {
	if (url.includes('rapidcdn.app')) {
		const payload = decodeRapidCdnPayload(url);
		const inner = payload?.filename || payload?.url;
		if (typeof inner === 'string' && inner) return inner.split('?')[0];
	}
	return url.split('?')[0];
}

/** Drop items that resolve to the same underlying file, keeping the first occurrence. */
export function dedupeByIdentity<T extends { url: string }>(items: T[]): T[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		const key = mediaIdentity(item.url);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function detectMediaType(url: string): 'photo' | 'video' | 'document' {
	if (url.includes('rapidcdn.app')) return detectTypeFromJwtUrl(url);
	if (/\.(jpg|jpeg|png|webp|heic|gif)/i.test(url)) return 'photo';
	if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|txt|csv)/i.test(url)) return 'document';
	return 'video';
}

/** Build a caption string from title. Strips Facebook engagement metadata (e.g. "404K views · 8.7K reactions | ") if present. */
export function buildCaption(title?: string): string {
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

/** Format bytes to human-readable string */
export function formatFileSize(bytes: number | undefined | null): string {
	if (!bytes || bytes <= 0) return '';
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

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

/**
 * Extract the direct CDN URL from a tiktokio.com download token.
 *
 * Returns null whenever the decode is not provably a complete URL. Callers fall back to
 * the tiktokio proxy link, which serves the same bytes, so a null here costs nothing —
 * whereas a half-decoded URL is a dead host that Telegram rejects with a 530.
 */
export function decodeTiktokDirectUrl(proxyUrl: string): string | null {
	try {
		const u = new URL(proxyUrl);
		const token = u.searchParams.get('token');
		if (!token) return null;
		let cleaned = token.replace(/O0O0O$/, '');
		for (const [key, value] of Object.entries(DECODE_MAP)) {
			cleaned = cleaned.replaceAll(key, value);
		}
		let b64 = 'aHR0c' + cleaned.slice(10);
		while (b64.length % 4 !== 0) b64 += '=';
		const decoded = atob(b64);
		// The substitution above is ambiguous: a digit run that was never an escape gets
		// rewritten too, so longer tokens (audio links, which carry a query string) turn to
		// binary noise partway through. Non-printable bytes mean the decode can't be trusted.
		if (/[^\x20-\x7e]/.test(decoded)) return null;
		// tiktokio appends a unix timestamp after the filename extension. Anchoring on the
		// extension is what keeps the lazy quantifier from stopping at the first dot in the
		// hostname, which used to truncate "https://v16.tokcdn.com/...mp4" to "https://v16.tokc".
		const match = decoded.match(/^https?:\/\/[^\s"'<>]+?\.[a-z0-9]{2,4}(?=\d{10}$|$)/i);
		if (!match) return null;
		// A bare host with no path is never a media link.
		const parsed = new URL(match[0]);
		if (parsed.pathname.length <= 1 || !/\.[a-z]{2,}$/i.test(parsed.hostname)) return null;
		return match[0];
	} catch {
		return null;
	}
}
