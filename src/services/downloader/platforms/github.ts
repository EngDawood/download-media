import { env } from 'cloudflare:workers';
import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { DownloadError, classifyError, kindFromStatus } from '../failure';

const CODELOAD = 'https://codeload.github.com';
const USER_AGENT = 'download-media-bot/1.0';
// Workers cap an isolate at 128 MB. The archive is buffered (~2x while chunks are joined),
// then the folder zip is built next to it, so both limits are kept well under that.
const MAX_ARCHIVE_SIZE = 48 * 1024 * 1024;
const MAX_ZIP_SIZE = 40 * 1024 * 1024; // under Telegram's 50 MB bot upload limit

export class GitHubProvider implements IDownloaderProvider {
	readonly platforms = ['github.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const parsed = parseGitHubUrl(url);
		if (!parsed) return { status: 'error', error: 'Invalid GitHub folder URL', failureKind: 'unsupported' };

		const { owner, repo, ref, folderPath } = parsed;

		try {
			// One request for the whole repo instead of one per file: a folder with
			// thousands of files would blow the Workers subrequest limit.
			const archive = await fetchArchive(owner, repo, ref);
			const entries = selectFolderEntries(archive, folderPath);
			if (entries.length === 0) return { status: 'error', error: 'Folder is empty or not found', failureKind: 'gone' };

			const zip = buildZip(archive, entries);
			if (zip.length > MAX_ZIP_SIZE) {
				return {
					status: 'error',
					error: `Folder too large (${(zip.length / 1024 / 1024).toFixed(1)} MB > ${MAX_ZIP_SIZE / 1024 / 1024} MB limit)`,
					failureKind: 'gone',
				};
			}

			const folderName = folderPath.split('/').pop() || 'folder';
			return {
				status: 'success',
				media: [{ type: 'document', url: '', buffer: zip, filename: `${repo}-${folderName}.zip`, filesize: zip.length }],
				caption: `📁 <code>${owner}/${repo}/${folderPath}</code>\n${entries.length} file${entries.length !== 1 ? 's' : ''}`,
			};
		} catch (err: unknown) {
			return { status: 'error', error: (err as Error).message || 'Failed to download folder', failureKind: classifyError(err) };
		}
	}
}

// ─── URL parsing ─────────────────────────────────────────────────────────────

interface ParsedGitHubUrl {
	owner: string;
	repo: string;
	ref: string;
	folderPath: string;
}

function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
	try {
		const parts = new URL(url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
		if (parts.length < 5 || parts[2] !== 'tree') return null;
		return {
			owner: parts[0],
			repo: parts[1],
			ref: parts[3],
			folderPath: parts.slice(4).join('/'),
		};
	} catch {
		return null;
	}
}

// ─── Repo archive download ───────────────────────────────────────────────────

async function fetchArchive(owner: string, repo: string, ref: string): Promise<Uint8Array> {
	// Works for branches, tags and commit SHAs. The token (optional) also unlocks private repos.
	const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
	if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
	const resp = await fetch(`${CODELOAD}/${owner}/${repo}/zip/${encodeURIComponent(ref)}`, {
		headers,
		signal: AbortSignal.timeout(30_000),
	});
	if (resp.status === 404) throw new DownloadError(`Repository or ref not found: ${owner}/${repo}@${ref}`, 'gone');
	if (!resp.ok || !resp.body) throw new DownloadError(`GitHub archive error ${resp.status}`, kindFromStatus(resp.status));

	const tooLarge = () => new DownloadError(`Repository archive too large (> ${MAX_ARCHIVE_SIZE / 1024 / 1024} MB)`, 'gone');
	if (Number(resp.headers.get('content-length') ?? 0) > MAX_ARCHIVE_SIZE) throw tooLarge();

	const reader = resp.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.length;
		if (total > MAX_ARCHIVE_SIZE) {
			await reader.cancel();
			throw tooLarge();
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let pos = 0;
	for (const c of chunks) {
		out.set(c, pos);
		pos += c.length;
	}
	return out;
}

// ─── ZIP: read the central directory, copy selected entries without recompressing ─

interface ZipEntry {
	name: string; // path relative to the requested folder
	flags: number;
	method: number;
	crc: number;
	csize: number;
	usize: number;
	localOffset: number;
}

function selectFolderEntries(zip: Uint8Array, folderPath: string): ZipEntry[] {
	const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
	let eocd = -1;
	for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
		if (v.getUint32(i, true) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new DownloadError('Invalid repository archive', 'gone');
	const count = v.getUint16(eocd + 10, true);
	let pos = v.getUint32(eocd + 16, true);
	if (count === 0xffff || pos === 0xffffffff) throw new DownloadError('Repository archive too large (ZIP64)', 'gone');

	const dec = new TextDecoder();
	const entries: ZipEntry[] = [];
	let prefix: string | null = null; // codeload nests everything under "<repo>-<ref>/"
	for (let n = 0; n < count; n++) {
		if (v.getUint32(pos, true) !== 0x02014b50) break;
		const nameLen = v.getUint16(pos + 28, true);
		const skip = nameLen + v.getUint16(pos + 30, true) + v.getUint16(pos + 32, true);
		const full = dec.decode(zip.subarray(pos + 46, pos + 46 + nameLen));
		prefix ??= full.slice(0, full.indexOf('/') + 1) + folderPath + '/';
		if (full.startsWith(prefix) && !full.endsWith('/')) {
			entries.push({
				name: full.slice(prefix.length),
				flags: v.getUint16(pos + 8, true) & 0x0800, // keep only the UTF-8 name flag
				method: v.getUint16(pos + 10, true),
				crc: v.getUint32(pos + 16, true),
				csize: v.getUint32(pos + 20, true),
				usize: v.getUint32(pos + 24, true),
				localOffset: v.getUint32(pos + 42, true),
			});
		}
		pos += 46 + skip;
	}
	return entries;
}

function buildZip(src: Uint8Array, entries: ZipEntry[]): Uint8Array {
	const sv = new DataView(src.buffer, src.byteOffset, src.byteLength);
	const enc = new TextEncoder();
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const e of entries) {
		// Compressed bytes sit after the local header, whose name/extra lengths may differ from the central dir
		const dataStart = e.localOffset + 30 + sv.getUint16(e.localOffset + 26, true) + sv.getUint16(e.localOffset + 28, true);
		const data = src.subarray(dataStart, dataStart + e.csize);
		const nameBytes = enc.encode(e.name);

		const local = new Uint8Array(30 + nameBytes.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true);
		lv.setUint16(6, e.flags, true);
		lv.setUint16(8, e.method, true);
		lv.setUint32(14, e.crc, true);
		lv.setUint32(18, e.csize, true);
		lv.setUint32(22, e.usize, true);
		lv.setUint16(26, nameBytes.length, true);
		local.set(nameBytes, 30);

		const cdr = new Uint8Array(46 + nameBytes.length);
		const cv = new DataView(cdr.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint16(8, e.flags, true);
		cv.setUint16(10, e.method, true);
		cv.setUint32(16, e.crc, true);
		cv.setUint32(20, e.csize, true);
		cv.setUint32(24, e.usize, true);
		cv.setUint16(28, nameBytes.length, true);
		cv.setUint32(42, offset, true);
		cdr.set(nameBytes, 46);

		parts.push(local, data);
		central.push(cdr);
		offset += local.length + data.length;
	}

	const centralSize = central.reduce((s, b) => s + b.length, 0);
	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(12, centralSize, true);
	ev.setUint32(16, offset, true);

	const all = [...parts, ...central, eocd];
	const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
	let pos = 0;
	for (const b of all) {
		out.set(b, pos);
		pos += b.length;
	}
	return out;
}
