import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';

const GITHUB_API = 'https://api.github.com';
const API_HEADERS = {
	'User-Agent': 'download-media-bot/1.0',
	'Accept': 'application/vnd.github.v3+json',
};
const MAX_FILES = 50;
const MAX_TOTAL_SIZE = 45 * 1024 * 1024; // 45 MB — under Telegram's 50 MB bot upload limit

export class GitHubProvider implements IDownloaderProvider {
	readonly platforms = ['github.com'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const parsed = parseGitHubUrl(url);
		if (!parsed) return { status: 'error', error: 'Invalid GitHub folder URL' };

		const { owner, repo, ref, folderPath } = parsed;

		try {
			const counter = [MAX_FILES] as [number];
			const files = await listFiles(owner, repo, folderPath, ref, counter);
			if (files.length === 0) return { status: 'error', error: 'Folder is empty or not found' };

			const fileData = await downloadFiles(files);
			const totalSize = fileData.reduce((s, f) => s + f.data.length, 0);
			if (totalSize > MAX_TOTAL_SIZE) {
				return { status: 'error', error: `Folder too large (${(totalSize / 1024 / 1024).toFixed(1)} MB > 45 MB limit)` };
			}

			// Strip the folder prefix so zip paths are relative to the folder root
			const prefix = folderPath + '/';
			const entries = fileData.map(f => ({
				name: f.name.startsWith(prefix) ? f.name.slice(prefix.length) : f.name,
				data: f.data,
			}));

			const zip = createZip(entries);
			const folderName = folderPath.split('/').pop() || 'folder';
			const truncatedNote = counter[0] <= 0 ? `\n⚠️ Truncated to ${MAX_FILES} files` : '';

			return {
				status: 'success',
				media: [{
					type: 'document',
					url: '',
					buffer: zip,
					filename: `${repo}-${folderName}.zip`,
					filesize: zip.length,
				}],
				caption: `📁 <code>${owner}/${repo}/${folderPath}</code>\n${files.length} file${files.length !== 1 ? 's' : ''}${truncatedNote}`,
			};
		} catch (err: unknown) {
			return { status: 'error', error: (err as Error).message || 'Failed to download folder' };
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
		const parts = new URL(url).pathname.split('/').filter(Boolean);
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

// ─── GitHub API file listing ──────────────────────────────────────────────────

interface GitHubFile { path: string; download_url: string }

async function listFiles(owner: string, repo: string, path: string, ref: string, counter: [number]): Promise<GitHubFile[]> {
	if (counter[0] <= 0) return [];
	const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
	const resp = await fetch(url, { headers: API_HEADERS, signal: AbortSignal.timeout(10_000) });
	if (resp.status === 404) throw new Error(`Path not found: ${path}`);
	if (!resp.ok) throw new Error(`GitHub API error ${resp.status}`);
	const items = await resp.json() as Array<{ type: string; path: string; download_url: string | null }>;

	const files: GitHubFile[] = [];
	for (const item of items) {
		if (counter[0] <= 0) break;
		if (item.type === 'file' && item.download_url) {
			files.push({ path: item.path, download_url: item.download_url });
			counter[0]--;
		} else if (item.type === 'dir') {
			const sub = await listFiles(owner, repo, item.path, ref, counter);
			files.push(...sub);
		}
	}
	return files;
}

async function downloadFiles(files: GitHubFile[]): Promise<{ name: string; data: Uint8Array }[]> {
	return Promise.all(files.map(async (f) => {
		const resp = await fetch(f.download_url, {
			headers: { 'User-Agent': API_HEADERS['User-Agent'] },
			signal: AbortSignal.timeout(20_000),
		});
		if (!resp.ok) throw new Error(`Failed to download ${f.path}: ${resp.status}`);
		return { name: f.path, data: new Uint8Array(await resp.arrayBuffer()) };
	}));
}

// ─── Minimal ZIP builder (store / no compression) ────────────────────────────

function createZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
	const enc = new TextEncoder();
	const locals: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const { name, data } of files) {
		const nameBytes = enc.encode(name);
		const crc = crc32(data);

		const local = new Uint8Array(30 + nameBytes.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true); // local file header sig
		lv.setUint16(4, 20, true);          // version needed
		lv.setUint16(8, 0, true);           // compression: store
		lv.setUint32(14, crc, true);
		lv.setUint32(18, data.length, true);
		lv.setUint32(22, data.length, true);
		lv.setUint16(26, nameBytes.length, true);
		local.set(nameBytes, 30);

		const cdr = new Uint8Array(46 + nameBytes.length);
		const cv = new DataView(cdr.buffer);
		cv.setUint32(0, 0x02014b50, true);  // central dir sig
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, data.length, true);
		cv.setUint32(24, data.length, true);
		cv.setUint16(28, nameBytes.length, true);
		cv.setUint32(42, offset, true);     // local header offset
		cdr.set(nameBytes, 46);

		locals.push(local, data);
		central.push(cdr);
		offset += local.length + data.length;
	}

	const centralSize = central.reduce((s, b) => s + b.length, 0);
	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true);     // end of central dir sig
	ev.setUint16(8, files.length, true);
	ev.setUint16(10, files.length, true);
	ev.setUint32(12, centralSize, true);
	ev.setUint32(16, offset, true);

	const all = [...locals, ...central, eocd];
	const total = all.reduce((s, b) => s + b.length, 0);
	const out = new Uint8Array(total);
	let pos = 0;
	for (const b of all) { out.set(b, pos); pos += b.length; }
	return out;
}

const CRC32_TABLE: Uint32Array = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		t[i] = c;
	}
	return t;
})();

function crc32(data: Uint8Array): number {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < data.length; i++) {
		crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xFF];
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}
