import { describe, it, expect } from 'vitest';
import {
	buildCaption,
	formatFileSize,
	detectMediaType,
	detectTypeFromJwtUrl,
	decodeTiktokDirectUrl,
	isUrl,
} from '../src/services/media-downloader';

// ─── isUrl ───────────────────────────────────────────────────────────────────

describe('isUrl', () => {
	it('returns true for http URL', () => {
		expect(isUrl('http://example.com/video.mp4')).toBe(true);
	});
	it('returns true for https URL', () => {
		expect(isUrl('https://cdn.example.com/file')).toBe(true);
	});
	it('returns false for empty string', () => {
		expect(isUrl('')).toBe(false);
	});
	it('returns false for relative path', () => {
		expect(isUrl('/video.mp4')).toBe(false);
	});
	it('returns false for non-string', () => {
		expect(isUrl(null)).toBe(false);
		expect(isUrl(undefined)).toBe(false);
		expect(isUrl(123)).toBe(false);
	});
});

// ─── buildCaption ─────────────────────────────────────────────────────────────

describe('buildCaption', () => {
	it('returns empty string for undefined', () => {
		expect(buildCaption(undefined)).toBe('');
	});
	it('returns empty string for empty string', () => {
		expect(buildCaption('')).toBe('');
	});
	it('wraps normal title in bold tags', () => {
		expect(buildCaption('My video title')).toBe('<b>My video title</b>');
	});
	it('strips Facebook engagement prefix before pipe', () => {
		const input = '404K views · 8.7K reactions | My actual title';
		expect(buildCaption(input)).toBe('<b>My actual title</b>');
	});
	it('keeps pipe in title when prefix has no engagement keywords', () => {
		const input = 'How to cook | A tutorial';
		expect(buildCaption(input)).toBe('<b>How to cook | A tutorial</b>');
	});
	it('returns empty string if title is only the engagement prefix', () => {
		const input = '100K views · 5K likes | ';
		expect(buildCaption(input)).toBe('');
	});
});

// ─── formatFileSize ───────────────────────────────────────────────────────────

describe('formatFileSize', () => {
	it('returns empty string for 0', () => {
		expect(formatFileSize(0)).toBe('');
	});
	it('returns empty string for null', () => {
		expect(formatFileSize(null)).toBe('');
	});
	it('returns empty string for undefined', () => {
		expect(formatFileSize(undefined)).toBe('');
	});
	it('returns KB for sizes under 1MB', () => {
		expect(formatFileSize(512 * 1024)).toBe('512KB');
	});
	it('returns MB for sizes over 1MB', () => {
		expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5MB');
	});
	it('rounds KB to integer', () => {
		expect(formatFileSize(1500)).toBe('1KB');
	});
});

// ─── detectTypeFromJwtUrl ─────────────────────────────────────────────────────

describe('detectTypeFromJwtUrl', () => {
	function makeJwtUrl(payload: object): string {
		const encoded = btoa(JSON.stringify(payload))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
		const token = `header.${encoded}.sig`;
		return `https://rapidcdn.app/dl?token=${token}`;
	}

	it('returns photo when filename has jpg extension', () => {
		const url = makeJwtUrl({ filename: 'photo.jpg' });
		expect(detectTypeFromJwtUrl(url)).toBe('photo');
	});
	it('returns photo when filename has png extension', () => {
		const url = makeJwtUrl({ filename: 'image.png' });
		expect(detectTypeFromJwtUrl(url)).toBe('photo');
	});
	it('returns photo when url hint has webp extension', () => {
		const url = makeJwtUrl({ url: 'https://cdn.example.com/img.webp' });
		expect(detectTypeFromJwtUrl(url)).toBe('photo');
	});
	it('returns video when no image hint in payload', () => {
		const url = makeJwtUrl({ filename: 'video.mp4' });
		expect(detectTypeFromJwtUrl(url)).toBe('video');
	});
	it('returns video when token is missing', () => {
		expect(detectTypeFromJwtUrl('https://rapidcdn.app/dl')).toBe('video');
	});
	it('returns video on malformed token', () => {
		expect(detectTypeFromJwtUrl('https://rapidcdn.app/dl?token=not.valid')).toBe('video');
	});
});

// ─── detectMediaType ──────────────────────────────────────────────────────────

describe('detectMediaType', () => {
	it('delegates rapidcdn.app URLs to detectTypeFromJwtUrl', () => {
		// No valid JWT token → falls back to video
		expect(detectMediaType('https://rapidcdn.app/dl?token=x')).toBe('video');
	});
	it('returns photo for jpg extension', () => {
		expect(detectMediaType('https://cdn.example.com/photo.jpg')).toBe('photo');
	});
	it('returns photo for jpeg extension', () => {
		expect(detectMediaType('https://cdn.example.com/photo.jpeg')).toBe('photo');
	});
	it('returns photo for png extension', () => {
		expect(detectMediaType('https://cdn.example.com/photo.png')).toBe('photo');
	});
	it('returns document for pdf extension', () => {
		expect(detectMediaType('https://cdn.example.com/file.pdf')).toBe('document');
	});
	it('returns document for zip extension', () => {
		expect(detectMediaType('https://cdn.example.com/file.zip')).toBe('document');
	});
	it('returns video for unknown extension', () => {
		expect(detectMediaType('https://cdn.example.com/stream')).toBe('video');
	});
	it('returns video for mp4 extension', () => {
		expect(detectMediaType('https://cdn.example.com/video.mp4')).toBe('video');
	});
});

// ─── decodeTiktokDirectUrl ────────────────────────────────────────────────────

describe('decodeTiktokDirectUrl', () => {
	it('returns null when token param is missing', () => {
		expect(decodeTiktokDirectUrl('https://tiktokio.com/dl')).toBeNull();
	});
	it('returns null on completely invalid token', () => {
		expect(decodeTiktokDirectUrl('https://tiktokio.com/dl?token=!!!')).toBeNull();
	});
	it('returns null when decoded value is not a URL', () => {
		// Valid base64 but decoded text is not a URL
		const token = btoa('not-a-url-at-all-xxxx').replace(/=/g, '') + 'O0O0O';
		expect(decodeTiktokDirectUrl(`https://tiktokio.com/dl?token=${token}`)).toBeNull();
	});
});
