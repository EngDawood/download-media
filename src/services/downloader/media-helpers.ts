/** Check if a value is a valid non-empty URL string */
export function isUrl(val: unknown): val is string {
	return typeof val === 'string' && val.startsWith('http');
}

/**
 * Detect photo vs video from a rapidcdn.app JWT URL by decoding the payload.
 */
export function detectTypeFromJwtUrl(url: string): 'photo' | 'video' {
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
	'000': 'h', '001': 'i', '002': 'j', '003': 'k', '004': 'l',
	'005': 'm', '006': 'n', '007': 'o', '008': 'p', '009': 'q',
};

/**
 * Extract the direct CDN URL from a tiktokio.com download token.
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
		const match = decoded.match(/^(https?:\/\/.+?\.\w{2,4})/);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}
