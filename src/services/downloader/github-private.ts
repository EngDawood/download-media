import type { DownloaderResult } from '../../types/downloader';
import { DownloadError, classifyError, kindFromStatus } from './failure';

const CODELOAD = 'https://codeload.github.com';
const RAW = 'https://raw.githubusercontent.com';
const USER_AGENT = 'download-media-bot/1.0';
// Workers cap an isolate at 128 MB and the body is buffered (~2x while chunks are joined),
// so this stays well under that and under Telegram's 50 MB bot upload limit.
export const MAX_ARCHIVE_SIZE = 48 * 1024 * 1024;

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Buffer a GitHub download, capped at MAX_ARCHIVE_SIZE. The token is optional (public repos work without one).
 * codeload takes `Bearer`; raw.githubusercontent.com takes the older `token` scheme.
 */
export async function fetchBytes(url: string, token: string | undefined, scheme: 'Bearer' | 'token', what: string): Promise<Uint8Array> {
	const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
	if (token) headers.Authorization = `${scheme} ${token}`;
	const resp = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
	if (resp.status === 404) throw new DownloadError(`Repository, ref or file not found: ${what}`, 'gone');
	if (!resp.ok || !resp.body) throw new DownloadError(`GitHub download error ${resp.status}`, kindFromStatus(resp.status));

	const tooLarge = () => new DownloadError(`Download too large (> ${MAX_ARCHIVE_SIZE / 1024 / 1024} MB)`, 'gone');
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

/**
 * Whole-repo zip (`github.com/<owner>/<repo>/archive/...`) or a single file
 * (`raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`), fetched with a token so private
 * repos work. Returns null for any other URL. Only call this with a token the requester may use.
 */
export async function downloadWithToken(url: string, token: string): Promise<DownloaderResult | null> {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return null;
	}
	const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);

	try {
		if (u.hostname === 'raw.githubusercontent.com' && parts.length >= 4) {
			const [owner, repo, ref, ...path] = parts;
			const where = `${owner}/${repo}/${path.join('/')}`;
			const data = await fetchBytes(`${RAW}/${owner}/${repo}/${encodePath(ref)}/${encodePath(path.join('/'))}`, token, 'token', where);
			return {
				status: 'success',
				media: [{ type: 'document', url: '', buffer: data, filename: path[path.length - 1], filesize: data.length }],
				caption: `📄 <code>${escapeHtml(where)}</code>`,
			};
		}
		if (u.hostname === 'github.com' && parts.length >= 4 && parts[2] === 'archive') {
			const [owner, repo, , ...rest] = parts;
			// HEAD.zip, refs/heads/<branch>.zip or refs/tags/<tag>.zip: codeload takes the same ref after /zip/.
			const ref = rest.join('/').replace(/\.zip$/, '');
			const data = await fetchBytes(`${CODELOAD}/${owner}/${repo}/zip/${encodePath(ref)}`, token, 'Bearer', `${owner}/${repo}@${ref}`);
			const filename = ref === 'HEAD' ? `${repo}.zip` : `${repo}-${ref.split('/').pop()}.zip`;
			return {
				status: 'success',
				media: [{ type: 'document', url: '', buffer: data, filename, filesize: data.length }],
				caption: `📦 <code>${escapeHtml(`${owner}/${repo}`)}</code>`,
			};
		}
	} catch (err: unknown) {
		return { status: 'error', error: (err as Error).message || 'Failed to download from GitHub', failureKind: classifyError(err) };
	}
	return null;
}
