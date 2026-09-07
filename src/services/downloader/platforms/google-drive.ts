import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { DownloadError, classifyError, kindFromStatus } from '../failure';
import { formatFileSize } from '../media-helpers';

const DOWNLOAD_ENDPOINT = 'https://drive.usercontent.google.com/download';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT = 15_000;

const TYPE_ICON: Record<MediaItem['type'], string> = {
	video: '🎬',
	audio: '🎵',
	photo: '🖼',
	document: '📄',
};

/**
 * Google Workspace documents have no binary original to download — Drive only
 * hands them over through an export renderer, one format per editor.
 *
 * Each editor exports to its Office counterpart rather than to PDF, so what arrives
 * is the document itself and not a flattened picture of it. PDF is offered for Docs
 * and Slides too, but taking it would lose the editable original — and Sheets has no
 * usable PDF at all, since wide tables get sliced across pages.
 */
const WORKSPACE_EXPORTS: Record<string, { format: string; ext: string }> = {
	document: { format: 'docx', ext: 'docx' },
	presentation: { format: 'pptx', ext: 'pptx' },
	spreadsheets: { format: 'xlsx', ext: 'xlsx' },
	// Drawings have no Office equivalent; PNG is the only sensible binary export.
	drawings: { format: 'png', ext: 'png' },
};

/**
 * Google Drive / Docs.
 *
 * A share link (`/file/d/{id}/view`) is an HTML viewer page, so it never reached a
 * downloader: the generic HEAD probe saw `text/html` and gave up, and the AIO
 * extractor has no Drive support. This provider turns the share link into the
 * `drive.usercontent.google.com` direct-download URL, clears the virus-scan
 * interstitial that large files return, and reports the real type, name and size
 * from the response headers.
 */
export class GoogleDriveProvider implements IDownloaderProvider {
	readonly platforms = ['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const parsed = parseDriveUrl(url);
		if (!parsed) {
			return { status: 'error', error: 'Unrecognised Google Drive link', failureKind: 'unsupported' };
		}
		if (parsed.kind === 'folder') {
			return {
				status: 'error',
				error: 'Google Drive folders are not supported — send a link to a single file',
				failureKind: 'unsupported',
			};
		}

		try {
			const item = parsed.kind === 'workspace' ? await resolveWorkspaceExport(parsed) : await resolveDriveFile(parsed.id);
			const size = formatFileSize(item.filesize);
			return {
				status: 'success',
				media: [item],
				title: item.filename,
				caption: `${TYPE_ICON[item.type]} <b>${escapeHtml(item.filename ?? 'file')}</b>${size ? `\n${size}` : ''}`,
				altFormat: pdfAlternative(parsed, item.filename),
			};
		} catch (err: unknown) {
			return {
				status: 'error',
				error: (err as Error).message || 'Failed to download from Google Drive',
				failureKind: classifyError(err),
			};
		}
	}
}

// ─── URL parsing ─────────────────────────────────────────────────────────────

interface ParsedDriveUrl {
	kind: 'file' | 'workspace' | 'folder';
	id: string;
	/** Workspace editor segment (`document`, `spreadsheets`, …) — set when kind is 'workspace'. */
	editor?: string;
}

/** Drive ids are opaque base64url-ish strings; anything shorter than this is a path word, not an id. */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

export function parseDriveUrl(url: string): ParsedDriveUrl | null {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return null;
	}

	const parts = u.pathname.split('/').filter(Boolean);

	// /drive/folders/{id} and /drive/u/0/folders/{id}
	const folderAt = parts.indexOf('folders');
	if (folderAt !== -1 && DRIVE_ID.test(parts[folderAt + 1] ?? '')) {
		return { kind: 'folder', id: parts[folderAt + 1] };
	}

	// docs.google.com/{editor}/d/{id}/… — Workspace editors need an export renderer.
	// docs.google.com/file/d/{id} is an ordinary Drive file, so match on the editor list.
	// /{editor}/d/e/{publishedId}/pub addresses a published snapshot, not the file: `e`
	// fails the id test below, so those fall through rather than exporting the wrong doc.
	if (parts[1] === 'd' && WORKSPACE_EXPORTS[parts[0]] && DRIVE_ID.test(parts[2] ?? '')) {
		return { kind: 'workspace', id: parts[2], editor: parts[0] };
	}

	// /file/d/{id}/view — the canonical share link.
	if (parts[0] === 'file' && parts[1] === 'd' && DRIVE_ID.test(parts[2] ?? '')) {
		return { kind: 'file', id: parts[2] };
	}

	// /open?id=, /uc?id=, /download?id= — legacy and already-direct forms.
	const queryId = u.searchParams.get('id');
	if (queryId && DRIVE_ID.test(queryId)) {
		return { kind: 'file', id: queryId };
	}

	return null;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

function driveFetch(url: string): Promise<Response> {
	return fetch(url, {
		redirect: 'follow',
		signal: AbortSignal.timeout(FETCH_TIMEOUT),
		headers: { 'User-Agent': BROWSER_UA },
	});
}

/**
 * Resolve a plain Drive file to a direct, cookieless download URL.
 *
 * Large files answer the first request with an HTML interstitial carrying a
 * `confirm`/`uuid` form instead of the bytes; submitting that form yields the real
 * download. Anything else that comes back as HTML means the link is not public —
 * Drive serves the sign-in page rather than a 401.
 */
async function resolveDriveFile(id: string): Promise<MediaItem> {
	const firstUrl = `${DOWNLOAD_ENDPOINT}?id=${encodeURIComponent(id)}&export=download`;
	let res = await driveFetch(firstUrl);
	let finalUrl = firstUrl;

	if (!res.ok) throw new DownloadError(statusMessage(res.status), kindFromStatus(res.status));

	if (isHtml(res)) {
		const html = await res.text();
		const confirmUrl = parseConfirmForm(html);
		if (!confirmUrl) throw new DownloadError(accessMessage(res.url, html), 'gone');
		res = await driveFetch(confirmUrl);
		finalUrl = confirmUrl;
		if (!res.ok) throw new DownloadError(statusMessage(res.status), kindFromStatus(res.status));
		if (isHtml(res)) throw new DownloadError(accessMessage(res.url, await res.text()), 'gone');
	}

	// The bytes are never needed here — send-media hands the URL to Telegram and only
	// downloads them itself if Telegram refuses it. Cancel the body to free the socket.
	await releaseBody(res);

	return itemFromHeaders(finalUrl, res.headers, `drive-${id}`);
}

/**
 * The PDF an editor can also render, offered as a follow-up button.
 *
 * Only Docs and Slides get one: Sheets paginates wide tables into an unreadable PDF,
 * Drawings are already a flat image, and an uploaded file has no renderer at all. The
 * URL is built rather than probed — it costs nothing until someone taps the button, and
 * a tap goes straight to the same export endpoint the default download already used.
 */
export function pdfAlternative(parsed: ParsedDriveUrl, filename: string | undefined): DownloaderResult['altFormat'] {
	if (parsed.kind !== 'workspace') return undefined;
	if (parsed.editor !== 'document' && parsed.editor !== 'presentation') return undefined;
	const base = filename?.replace(/\.(docx|pptx)$/i, '') || `${parsed.editor}-${parsed.id}`;
	return {
		label: 'pdf',
		url: `https://docs.google.com/${parsed.editor}/d/${parsed.id}/export?format=pdf`,
		filename: `${base}.pdf`,
	};
}

/** Workspace docs export straight to a fixed format; there is no interstitial on this path. */
async function resolveWorkspaceExport(parsed: ParsedDriveUrl): Promise<MediaItem> {
	const { format, ext } = WORKSPACE_EXPORTS[parsed.editor!];
	const url = `https://docs.google.com/${parsed.editor}/d/${parsed.id}/export?format=${format}`;
	const res = await driveFetch(url);
	if (!res.ok) throw new DownloadError(statusMessage(res.status), kindFromStatus(res.status));
	if (isHtml(res)) throw new DownloadError(accessMessage(res.url, await res.text()), 'gone');
	await releaseBody(res);
	return itemFromHeaders(url, res.headers, `${parsed.editor}-${parsed.id}.${ext}`);
}

async function releaseBody(res: Response): Promise<void> {
	try {
		await res.body?.cancel();
	} catch {
		/* already consumed or unsupported — nothing to release */
	}
}

// ─── Response interpretation ─────────────────────────────────────────────────

function isHtml(res: Response): boolean {
	return (res.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

function itemFromHeaders(url: string, headers: Headers, fallbackName: string): MediaItem {
	const contentType = (headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
	const filename = parseContentDisposition(headers.get('content-disposition')) || fallbackName;
	const length = Number(headers.get('content-length') || 0);
	return {
		type: mediaTypeFor(contentType, filename),
		url,
		filename,
		filesize: length > 0 ? length : undefined,
	};
}

/**
 * Type comes from Content-Type first and the filename only as a fallback: Drive
 * serves plenty of files as application/octet-stream, where the extension is the
 * only signal of what it actually is.
 */
function mediaTypeFor(contentType: string, filename: string): MediaItem['type'] {
	if (contentType.startsWith('video/')) return 'video';
	if (contentType.startsWith('audio/')) return 'audio';
	if (contentType.startsWith('image/')) return 'photo';
	const ext = filename.split('.').pop()?.toLowerCase() ?? '';
	if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', '3gp'].includes(ext)) return 'video';
	if (['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'opus', 'wma'].includes(ext)) return 'audio';
	if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif'].includes(ext)) return 'photo';
	return 'document';
}

/** `attachment; filename="a.mp4"` / `filename*=UTF-8''a%20b.mp4` → the decoded name. */
export function parseContentDisposition(header: string | null): string | null {
	if (!header) return null;
	const extended = header.match(/filename\*\s*=\s*[^']*'[^']*'([^;]+)/i);
	if (extended) {
		try {
			return decodeURIComponent(extended[1].trim());
		} catch {
			return extended[1].trim();
		}
	}
	const plain = header.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
	const name = plain?.[1] ?? plain?.[2];
	return name ? name.trim() : null;
}

/**
 * Rebuild the virus-scan interstitial's form as a GET URL. The form carries the
 * `confirm` and `uuid` tokens that authorise the download without a cookie.
 */
export function parseConfirmForm(html: string): string | null {
	const form = html.match(/<form[^>]*\bid=["']download-form["'][^>]*>([\s\S]*?)<\/form>/i);
	if (!form) return null;
	const action = form[0].match(/\baction=["']([^"']+)["']/i)?.[1];
	if (!action) return null;

	const params = new URLSearchParams();
	for (const [tag] of form[1].matchAll(/<input\b[^>]*>/gi)) {
		const name = tag.match(/\bname=["']([^"']+)["']/i)?.[1];
		const value = tag.match(/\bvalue=["']([^"']*)["']/i)?.[1];
		if (name) params.set(name, decodeHtmlEntities(value ?? ''));
	}
	if (!params.has('id')) return null;
	params.set('confirm', params.get('confirm') || 't');

	return `${decodeHtmlEntities(action)}?${params.toString()}`;
}

function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function statusMessage(status: number): string {
	if (status === 404 || status === 410) return 'File not found on Google Drive';
	if (status === 403) return 'This Google Drive file is private — set sharing to "Anyone with the link"';
	return `Google Drive returned ${status}`;
}

/**
 * HTML where bytes were expected means Drive refused us. Each branch here is a refusal
 * the user can actually do something about, so name it rather than reporting one vague
 * failure for three different fixes. Google renders these pages with HTML entities
 * (`hasn&#39;t`), so the patterns avoid apostrophes.
 */
export function accessMessage(finalUrl: string, html: string): string {
	if (finalUrl.includes('accounts.google.com') || /\bServiceLogin\b/.test(html)) {
		return 'This Google Drive file is private — set sharing to "Anyone with the link"';
	}
	if (/permission to download|Only the owner and editors can download/i.test(html)) {
		return 'The owner disabled downloads for this file — uncheck "Viewers and commenters can see the option to download" in its share settings';
	}
	if (/quota|too many users have viewed/i.test(html)) {
		return 'Google Drive download quota exceeded for this file — try again later';
	}
	return 'Google Drive did not return the file (it may be private or restricted)';
}
