import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../../../types/downloader';
import { classifyError, kindFromStatus } from '../failure';
import { BROWSER_UA, formatFileSize } from '../media-helpers';
import { fetchBytes } from '../github-private';
import { parseContentDisposition } from './google-drive';

const SHARES_API = 'https://api.onedrive.com/v1.0';
const FETCH_TIMEOUT = 15_000;
/** One server-side zip, under Telegram's 50 MB bot upload limit with headroom (github.ts uses the same 40 MB). */
const MAX_ZIP_BYTES = 40 * 1024 * 1024;
/** Telegram's bot upload ceiling — enumerated files above it can only go out as a link. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;
/**
 * REST folder downloads buffer every file through the Worker at once, so the
 * running total — not any one file — is capped, to stay inside Worker memory.
 */
const MAX_BUFFER_TOTAL_BYTES = 40 * 1024 * 1024;
/** download-and-send sends at most 10 items one by one; more would spam the chat. */
const MAX_ITEMS = 10;

const LOGIN_HOSTS = new Set(['login.microsoftonline.com', 'login.partner.microsoftonline.cn', 'login.microsoftonline.us']);

/** Share-link segments that address a single file (`:f:` is the only folder form). */
const FILE_SHARE_TYPES = new Set([':w:', ':x:', ':p:', ':b:', ':t:', ':s:']);

/**
 * What the user can do about a login wall. The provider never asks for
 * credentials — the fix is on the sharing side, so name it in both languages.
 */
const LOGIN_MESSAGE =
	'This SharePoint folder needs sign-in — share it as "Anyone with the link" and send the share link instead.\n' +
	'هذا المجلد يتطلب تسجيل الدخول — شاركه كـ "أي شخص لديه الرابط" وأرسل رابط المشاركة بدلاً من ذلك.';

const TYPE_ICON: Record<MediaItem['type'], string> = {
	video: '🎬',
	audio: '🎵',
	photo: '🖼',
	document: '📄',
};

/**
 * SharePoint / OneDrive.
 *
 * Two anonymous mechanisms, in order. The OneDrive shares API resolves a
 * sharing link with no credentials at all (the link itself is the token);
 * a folder's `/content` answers with a server-side zip. When that API
 * refuses a link, the SharePoint REST flow borrowed from sharept-dl
 * (Neal-Ding/sharept-dl, MIT) takes over: GET the share link, follow the
 * 302 chain, and use the anonymous session cookie it sets to enumerate the
 * folder — never a user login, never browser cookies. The REST path has to
 * download bytes through the Worker because its download URLs only work
 * with that session cookie, which Telegram cannot send.
 */
export class SharePointProvider implements IDownloaderProvider {
	readonly platforms = ['sharepoint.com', '1drv.ms', 'onedrive.live.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const parsed = parseSharePointUrl(url);
		if (!parsed) {
			return { status: 'error', error: 'Unrecognised SharePoint or OneDrive link', failureKind: 'unsupported' };
		}
		try {
			if (parsed.kind === 'direct') return await downloadDirect(parsed.directUrl!);
			if (parsed.kind === 'page') {
				return await downloadRestFolder(url, parsed.folderPath!, folderNameFrom(parsed.folderPath!));
			}
			return await downloadShare(parsed);
		} catch (err: unknown) {
			return {
				status: 'error',
				error: (err as Error).message || 'Failed to download from SharePoint',
				failureKind: classifyError(err),
			};
		}
	}
}

// ─── URL parsing ─────────────────────────────────────────────────────────────

export interface ParsedSharePointUrl {
	kind: 'share' | 'page' | 'direct';
	/** 'folder' | 'file' — share links only. */
	shareType?: 'folder' | 'file';
	/** Share URL as pasted (redeem-decoded when applicable). */
	shareUrl?: string;
	/** Direct download URL (onedrive.live.com/download?cid=&resid=…). */
	directUrl?: string;
	/** Server-relative folder path (onedrive.aspx page URLs). */
	folderPath?: string;
	/** Host of the page URL. */
	host?: string;
	/** sourcedoc GUID of a single-file share link, when present. */
	fileGuid?: string;
}

function isSharePointHost(hostname: string): boolean {
	return hostname === 'sharepoint.com' || hostname.endsWith('.sharepoint.com');
}

export function parseSharePointUrl(url: string): ParsedSharePointUrl | null {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return null;
	}
	const host = u.hostname.toLowerCase();
	const parts = u.pathname.split('/').filter(Boolean);

	// onedrive.live.com/?…&redeem=<base64 of the share URL> — where a share
	// click lands. Decode it back to the link the user was sent.
	if (host === 'onedrive.live.com') {
		const redeem = u.searchParams.get('redeem');
		if (redeem) {
			try {
				const decoded = atob(redeem.replace(/-/g, '+').replace(/_/g, '/'));
				return parseSharePointUrl(decoded);
			} catch {
				return null;
			}
		}
		if (u.pathname === '/download' && u.searchParams.get('cid') && u.searchParams.get('resid')) {
			return { kind: 'direct', directUrl: url };
		}
		// Plain share/view URLs: ?id= is a folder path, resid= a file reference.
		// The shares API resolves the link itself, so hand it over whole.
		if (u.searchParams.get('id') || u.searchParams.get('resid')) {
			return { kind: 'share', shareType: u.searchParams.get('resid') ? 'file' : 'folder', shareUrl: url };
		}
		return null;
	}

	// 1drv.ms/f/… is a folder share, /u/… a file share.
	if (host === '1drv.ms') {
		if (parts[0] === 'f') return { kind: 'share', shareType: 'folder', shareUrl: url };
		if (parts[0] === 'u') return { kind: 'share', shareType: 'file', shareUrl: url };
		return null;
	}

	if (!isSharePointHost(host)) return null;

	// <host>/personal/<user>/_layouts/15/onedrive.aspx?id=<server-relative path>
	// — a folder view page, not a share link. The path is the folder to read.
	if (parts[parts.length - 1] === 'onedrive.aspx') {
		const id = u.searchParams.get('id');
		if (!id) return null;
		return { kind: 'page', folderPath: id, host };
	}

	// <host>/:f:/… folder share, /:w:/:x:/:p:/:b:/:t:/:s:/… file shares.
	const marker = parts.find((p) => p === ':f:' || FILE_SHARE_TYPES.has(p));
	if (!marker) return null;
	const parsed: ParsedSharePointUrl = {
		kind: 'share',
		shareType: marker === ':f:' ? 'folder' : 'file',
		shareUrl: url,
	};
	const guid = fileGuidFrom(u);
	if (guid) parsed.fileGuid = guid;
	return parsed;
}

/** `sourcedoc={GUID}` → the GUID, braces stripped. */
function fileGuidFrom(u: URL): string | undefined {
	const raw = u.searchParams.get('sourcedoc');
	if (!raw) return undefined;
	return raw.replace(/^\{|\}$/g, '') || undefined;
}

function folderNameFrom(folderPath: string): string {
	const last = folderPath.split('/').filter(Boolean).pop() ?? 'folder';
	try {
		return decodeURIComponent(last);
	} catch {
		return last;
	}
}

/**
 * The shares-API token for a sharing link: base64url of the URL, `u!` prefix,
 * no padding. Microsoft's own docs example resolves to
 * `u!aHR0cHM6Ly8xZHJ2Lm1zL2YvcyFBdHVBTV9OYWN3VmFoaUZwdU1HU19CaVFDd1d1`.
 */
export function encodeShareToken(shareUrl: string): string {
	const bytes = new TextEncoder().encode(shareUrl);
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return 'u!' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Shares API (no credentials — the link is the token) ─────────────────────

interface SharesItem {
	id?: string;
	name?: string;
	size?: number;
	file?: { mimeType?: string };
	folder?: { childCount?: number };
	children?: SharesItem[];
	/** Shape the `/items/{id}/children` endpoint returns. */
	value?: SharesItem[];
	'@microsoft.graph.downloadUrl'?: string;
}

function sharesFetch(path: string, init?: RequestInit): Promise<Response> {
	return fetch(`${SHARES_API}${path}`, {
		...init,
		signal: AbortSignal.timeout(FETCH_TIMEOUT),
		headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA, ...init?.headers },
	});
}

function loginError(): DownloaderResult {
	return { status: 'error', error: LOGIN_MESSAGE, failureKind: 'gone' };
}

async function downloadShare(parsed: ParsedSharePointUrl): Promise<DownloaderResult> {
	const shareUrl = parsed.shareUrl!;
	const token = encodeShareToken(shareUrl);
	let rootRes: Response | null = null;
	try {
		rootRes = await sharesFetch(`/shares/${token}/root?expand=children`);
	} catch {
		/* network failure — the REST fallback below gets its turn */
	}

	if (rootRes?.ok) {
		const item = (await rootRes.json()) as SharesItem;
		if (item.file && item['@microsoft.graph.downloadUrl']) {
			return fileSuccess(sharesFileItem(item), item.name ?? 'file');
		}
		if (item.folder) {
			const zip = await trySharesZip(token, item.name ?? 'folder');
			if (zip) return zipSuccess(zip);
			return enumerateSharesChildren(token, item);
		}
		return { status: 'error', error: 'Share link did not return a file or folder', failureKind: 'gone' };
	}

	// The shares API refused the link — the REST flow handles share links the
	// API cannot resolve (extra params, tenant quirks). 1drv.ms links have no
	// REST path: their redirect lands on onedrive.live.com, not SharePoint.
	if (isSharePointHost(new URL(shareUrl).hostname)) {
		const rest = await downloadViaRest(shareUrl, parsed);
		if (rest) return rest;
	}
	if (rootRes && (rootRes.status === 401 || rootRes.status === 403)) return loginError();
	if (rootRes && rootRes.status === 404) {
		return { status: 'error', error: 'Share link not found or expired', failureKind: 'gone' };
	}
	if (rootRes) {
		return { status: 'error', error: `SharePoint returned ${rootRes.status}`, failureKind: kindFromStatus(rootRes.status) };
	}
	return { status: 'error', error: 'Could not reach SharePoint', failureKind: 'gone' };
}

function sharesFileItem(item: SharesItem): MediaItem {
	return {
		type: mediaTypeFor(item.name ?? ''),
		url: item['@microsoft.graph.downloadUrl']!,
		filename: item.name,
		filesize: typeof item.size === 'number' && item.size > 0 ? item.size : undefined,
	};
}

/**
 * A folder's `/content` answers with a server-side zip. Probed with HEAD so
 * the zip bytes never pass through the Worker — Telegram fetches the URL
 * itself. A zip over the cap, or a HEAD with no size to check (Telegram
 * would get an unguarded URL), falls back to enumerating the children.
 */
async function trySharesZip(token: string, folderName: string): Promise<MediaItem | null> {
	try {
		const res = await sharesFetch(`/shares/${token}/root/content`, { method: 'HEAD' });
		if (!res.ok) return null;
		if (!(res.headers.get('content-type') || '').toLowerCase().includes('zip')) return null;
		const length = Number(res.headers.get('content-length') || 0);
		if (!length || length > MAX_ZIP_BYTES) return null;
		return {
			type: 'document',
			url: `${SHARES_API}/shares/${token}/root/content`,
			filename: `${folderName}.zip`,
			filesize: length,
		};
	} catch {
		return null;
	}
}

/** Single-zip success, captioned like a folder. */
function zipSuccess(zip: MediaItem): DownloaderResult {
	const size = formatFileSize(zip.filesize);
	return {
		status: 'success',
		media: [zip],
		title: zip.filename,
		caption: `📁 <b>${escapeHtml(zip.filename!)}</b>${size ? `\n${size}` : ''}`,
	};
}

/** Children of a folder item, whatever shape the endpoint returned. */
function childrenOf(item: SharesItem): SharesItem[] {
	if (Array.isArray(item.children)) return item.children;
	if (Array.isArray(item.value)) return item.value;
	return [];
}

async function enumerateSharesChildren(token: string, item: SharesItem): Promise<DownloaderResult> {
	const files: SharesItem[] = [];
	const tooLarge: SharesItem[] = [];
	const skippedFolders: string[] = [];
	await collectSharesFiles(token, item, files, tooLarge, skippedFolders);
	if (!files.length) {
		if (!tooLarge.length) {
			return { status: 'error', error: 'Folder is empty or has no downloadable files', failureKind: 'gone' };
		}
		// Nothing sendable — the direct links are the whole answer. An empty
		// success would show the user a "done" with nothing in it.
		const links = tooLarge.map((f) => `${f.name ?? 'file'}: ${f['@microsoft.graph.downloadUrl']}`).join('\n');
		return {
			status: 'error',
			error: `Every file in this folder is over Telegram's 50MB limit. Download them directly:\n${links}`,
			failureKind: 'gone',
		};
	}
	const sendable = files.slice(0, MAX_ITEMS);
	const notes: string[] = [];
	if (files.length > sendable.length) notes.push(`sending first ${sendable.length} of ${files.length} files`);
	if (skippedFolders.length) notes.push(`subfolders not included: ${skippedFolders.join(', ')}`);
	// A file over Telegram's 50 MB cap cannot be sent, but its direct
	// download URL still works — the existing "too large" pattern hands the
	// user that link, so link it in the caption instead of dropping it.
	// Captions cap at 1024 chars and these URLs are long, so at most three.
	const largeLines = tooLarge
		.slice(0, 3)
		.map(
			(f) =>
				`• <a href="${escapeHtml(f['@microsoft.graph.downloadUrl']!)}">${escapeHtml(f.name ?? 'file')}</a> (${formatFileSize(f.size) || '50MB+'})`,
		);
	if (tooLarge.length > 3) largeLines.push(`• and ${tooLarge.length - 3} more over 50MB`);
	if (largeLines.length) notes.push(`too large for Telegram — download directly:\n${largeLines.join('\n')}`);
	return {
		status: 'success',
		media: sendable.map((f) => sharesFileItem(f)),
		title: item.name,
		caption:
			`📁 <b>${escapeHtml(item.name ?? 'folder')}</b>\n${files.length} file${files.length !== 1 ? 's' : ''}` +
			(notes.length ? `\n${notes.join('\n')}` : ''),
	};
}

/**
 * Walk a folder tree through the shares API. The root's `?expand=children`
 * only goes one level deep, so each subfolder needs its own
 * `/items/{id}/children` call — the REST path recurses the same way, so a
 * folder yields the same files whichever path runs. Stops descending once
 * enough sendable files are found; the count note reports what was seen.
 */
async function collectSharesFiles(
	token: string,
	item: SharesItem,
	files: SharesItem[],
	tooLarge: SharesItem[],
	skippedFolders: string[],
): Promise<void> {
	for (const child of childrenOf(item)) {
		if (child.folder) {
			if (files.length >= MAX_ITEMS) {
				skippedFolders.push(`${child.name ?? 'folder'}/`);
				continue;
			}
			let sub: SharesItem | null = null;
			if (child.id) {
				try {
					const res = await sharesFetch(`/shares/${token}/items/${encodeURIComponent(child.id)}/children`);
					if (res.ok) sub = (await res.json()) as SharesItem;
				} catch {
					/* unreadable subfolder — named below */
				}
			}
			if (sub) await collectSharesFiles(token, sub, files, tooLarge, skippedFolders);
			else skippedFolders.push(`${child.name ?? 'folder'}/`);
			continue;
		}
		if (!child.file || !child['@microsoft.graph.downloadUrl']) continue;
		if ((child.size ?? 0) > MAX_FILE_BYTES) tooLarge.push(child);
		else files.push(child);
	}
}

// ─── SharePoint REST (borrowed from sharept-dl) ─────────────────────────────

interface RestSession {
	base: string;
	cookie: string;
	/** Final URL after the redirect chain — carries the folder `id` for `:f:` links. */
	finalUrl: URL;
}

/**
 * GET the link and follow the 302 chain. A bounce to Microsoft's login host
 * — or a 401/403 — means the share needs sign-in. The anonymous session
 * cookie the chain sets is what authorises the REST calls; it comes from the
 * public link itself, never from the user.
 */
async function openRestSession(url: string): Promise<RestSession | 'login' | null> {
	let res: Response;
	try {
		res = await fetch(url, {
			redirect: 'follow',
			signal: AbortSignal.timeout(FETCH_TIMEOUT),
			headers: { 'User-Agent': BROWSER_UA },
		});
	} catch {
		return null;
	}
	let finalUrl: URL | null = null;
	try {
		finalUrl = new URL(res.url);
	} catch {
		/* no final URL — treat as unreachable below */
	}
	const finalHost = finalUrl?.hostname.toLowerCase() ?? '';
	if (LOGIN_HOSTS.has(finalHost) || res.status === 401 || res.status === 403) return 'login';
	if (!res.ok || !finalUrl || !isSharePointHost(finalHost)) return null;
	return { base: finalUrl.origin, cookie: cookiesFrom(res), finalUrl };
}

function cookiesFrom(res: Response): string {
	const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
	const raw = typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : [];
	return raw
		.map((c) => c.split(';')[0].trim())
		.filter(Boolean)
		.join('; ');
}

async function restGet(session: RestSession, path: string): Promise<unknown | null> {
	try {
		const res = await fetch(`${session.base}${path}`, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT),
			headers: {
				Accept: 'application/json;odata=verbose',
				'User-Agent': BROWSER_UA,
				...(session.cookie ? { Cookie: session.cookie } : {}),
			},
		});
		if (!res.ok) return null;
		return (await res.json()) as unknown;
	} catch {
		return null;
	}
}

/** One path segment at a time, so an already-encoded `%20` is never doubled. */
function encodeSpPath(path: string): string {
	return path
		.split('/')
		.map((seg) => encodeURIComponent(seg).replace(/'/g, '%27'))
		.join('/');
}

interface RestFile {
	name: string;
	relPath: string;
	size: number;
}

async function collectRestFiles(session: RestSession, folderPath: string, out: RestFile[], skippedLarge: string[]): Promise<void> {
	if (out.length >= MAX_ITEMS) return;
	const enc = encodeSpPath(folderPath).replace(/%27/g, "''");
	const filesData = (await restGet(session, `/_api/web/GetFolderByServerRelativeUrl('${enc}')/Files?$top=5000`)) as {
		d?: { results?: Array<{ Name?: string; ServerRelativeUrl?: string; Length?: number }> };
	} | null;
	for (const f of filesData?.d?.results ?? []) {
		if (out.length >= MAX_ITEMS) return;
		if (!f.ServerRelativeUrl) continue;
		if (Number(f.Length ?? 0) > MAX_FILE_BYTES) {
			skippedLarge.push(f.Name ?? 'file');
			continue;
		}
		out.push({ name: f.Name ?? 'file', relPath: f.ServerRelativeUrl, size: Number(f.Length ?? 0) });
	}
	const foldersData = (await restGet(session, `/_api/web/GetFolderByServerRelativeUrl('${enc}')/Folders?$top=5000`)) as {
		d?: { results?: Array<{ ServerRelativeUrl?: string }> };
	} | null;
	for (const sub of foldersData?.d?.results ?? []) {
		if (out.length >= MAX_ITEMS) return;
		if (sub.ServerRelativeUrl) await collectRestFiles(session, sub.ServerRelativeUrl, out, skippedLarge);
	}
}

/**
 * One file through the REST flow, as a buffer. The download URL only works
 * with the anonymous session cookie, so the bytes come through the Worker —
 * github-private's fetchBytes already caps the read, the cookie rides along
 * as an extra header. Null when the download fails.
 */
async function downloadRestFile(session: RestSession, url: string, name: string): Promise<MediaItem | null> {
	try {
		const bytes = await fetchBytes(url, undefined, 'Bearer', name, session.cookie ? { Cookie: session.cookie } : undefined, MAX_FILE_BYTES);
		return { type: mediaTypeFor(name), url: '', buffer: bytes, filename: name, filesize: bytes.length };
	} catch {
		return null;
	}
}

/** Single-file success, captioned like Google Drive's. */
function fileSuccess(item: MediaItem, name: string): DownloaderResult {
	const size = formatFileSize(item.filesize);
	return {
		status: 'success',
		media: [item],
		title: name,
		caption: `${TYPE_ICON[item.type]} <b>${escapeHtml(name)}</b>${size ? `\n${size}` : ''}`,
	};
}

/**
 * Folder download through the REST flow. The folder's download.aspx answers
 * with a zip; the URL is session-gated, so the bytes come through the Worker
 * as a buffer instead of going out as a link Telegram cannot fetch. A zip
 * answers with the `PK` magic — anything else is not a zip.
 */
async function tryRestZip(session: RestSession, folderPath: string, folderName: string): Promise<MediaItem | null> {
	const url = `${session.base}/_layouts/15/download.aspx?SourceUrl=${encodeSpPath(folderPath)}`;
	let bytes: Uint8Array;
	try {
		bytes = await fetchBytes(
			url,
			undefined,
			'Bearer',
			`${folderName}.zip`,
			session.cookie ? { Cookie: session.cookie } : undefined,
			MAX_ZIP_BYTES,
		);
	} catch {
		return null;
	}
	if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
	return { type: 'document', url: '', buffer: bytes, filename: `${folderName}.zip`, filesize: bytes.length };
}

/** REST entry for a share link the shares API refused, or a page URL. Null when REST cannot proceed. */
async function downloadViaRest(shareUrl: string, parsed: ParsedSharePointUrl): Promise<DownloaderResult | null> {
	const session = await openRestSession(shareUrl);
	if (session === 'login') return loginError();
	if (!session) return null;
	if (parsed.shareType === 'file') {
		const guid = parsed.fileGuid;
		if (!guid) return null;
		const meta = (await restGet(session, `/_api/web/GetFileById('${guid}')`)) as {
			d?: { Name?: string; ServerRelativeUrl?: string; Length?: number };
		} | null;
		const d = meta?.d;
		if (!d?.ServerRelativeUrl) {
			// The GUID resolved to nothing — fall back to the filename in the link.
			const name = new URL(shareUrl).searchParams.get('file');
			if (!name) return null;
			const item = await downloadRestFile(session, `${session.base}/_layouts/15/download.aspx?sourcedoc=${guid}`, name);
			return item ? fileSuccess(item, name) : null;
		}
		const name = d.Name ?? 'file';
		const item = await downloadRestFile(
			session,
			`${session.base}/_layouts/15/download.aspx?SourceUrl=${encodeSpPath(d.ServerRelativeUrl)}`,
			name,
		);
		return item ? fileSuccess(item, name) : null;
	}
	// The folder path lives on the FINAL url after the redirect chain
	// (sharept-dl reads it the same way) — the share link itself has no `id`.
	const id = session.finalUrl.searchParams.get('id');
	if (!id) return null;
	return downloadRestFolder(shareUrl, id, folderNameFrom(id), session);
}

async function downloadRestFolder(
	sessionUrl: string,
	folderPath: string,
	folderName: string,
	session?: RestSession,
): Promise<DownloaderResult> {
	const opened = session ?? (await openRestSession(sessionUrl));
	if (opened === 'login') return loginError();
	if (!opened) return { status: 'error', error: 'Could not reach SharePoint', failureKind: 'gone' };
	const zip = await tryRestZip(opened, folderPath, folderName);
	if (zip) return zipSuccess(zip);
	const files: RestFile[] = [];
	const skippedLarge: string[] = [];
	await collectRestFiles(opened, folderPath, files, skippedLarge);
	if (!files.length) return { status: 'error', error: 'Folder is empty or not found', failureKind: 'gone' };
	const media: MediaItem[] = [];
	const skipped: string[] = [...skippedLarge];
	let total = 0;
	for (const f of files) {
		if (f.size > 0 && total + f.size > MAX_BUFFER_TOTAL_BYTES) {
			skipped.push(f.name);
			continue;
		}
		try {
			const item = await downloadRestFile(opened, `${opened.base}/_layouts/15/download.aspx?SourceUrl=${encodeSpPath(f.relPath)}`, f.name);
			if (!item) throw new Error('download failed');
			total += item.filesize ?? 0;
			media.push(item);
		} catch {
			skipped.push(f.name);
		}
	}
	if (!media.length) {
		return { status: 'error', error: 'Could not download any file from this folder', failureKind: 'gone' };
	}
	return {
		status: 'success',
		media,
		title: folderName,
		caption:
			`📁 <b>${escapeHtml(folderName)}</b>\n${media.length} file${media.length !== 1 ? 's' : ''}` +
			(skipped.length ? `\nSkipped: ${skipped.join(', ')}` : ''),
	};
}

// ─── Direct OneDrive download links ──────────────────────────────────────────

async function downloadDirect(directUrl: string): Promise<DownloaderResult> {
	let res: Response;
	try {
		res = await fetch(directUrl, {
			method: 'HEAD',
			signal: AbortSignal.timeout(FETCH_TIMEOUT),
			headers: { 'User-Agent': BROWSER_UA },
		});
	} catch (err: unknown) {
		return { status: 'error', error: (err as Error).message || 'Could not reach OneDrive', failureKind: classifyError(err) };
	}
	if (!res.ok) return { status: 'error', error: `OneDrive returned ${res.status}`, failureKind: kindFromStatus(res.status) };
	const item = itemFromHeaders(directUrl, res.headers, 'onedrive-file');
	return fileSuccess(item, item.filename ?? 'file');
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

// ─── Response interpretation ─────────────────────────────────────────────────

/**
 * Classify a file. When `filename` is given, the first argument is a MIME
 * type; when it is not, the first argument IS the filename and the extension
 * decides. Two call shapes, one name — the argument names say which is which.
 */
function mediaTypeFor(typeOrName: string, filename?: string): MediaItem['type'] {
	const name = filename ?? typeOrName;
	const contentType = filename === undefined ? '' : typeOrName;
	if (contentType.startsWith('video/')) return 'video';
	if (contentType.startsWith('audio/')) return 'audio';
	if (contentType.startsWith('image/')) return 'photo';
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', '3gp'].includes(ext)) return 'video';
	if (['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'opus', 'wma'].includes(ext)) return 'audio';
	if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif'].includes(ext)) return 'photo';
	return 'document';
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
