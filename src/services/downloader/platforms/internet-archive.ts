import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { classifyError, kindFromStatus } from '../failure';
import { BROWSER_UA, formatFileSize } from '../media-helpers';

interface IaFile {
	name: string;
	format?: string;
	size?: string;
	/** `"true"` on files that exist but are not publicly downloadable. */
	private?: string;
}

interface IaMetadata {
	is_dark?: boolean;
	files?: IaFile[];
	metadata?: { title?: string | string[]; 'access-restricted-item'?: string };
}

/** Item id from /details/, /download/, /stream/ or /embed/ URLs. */
const ITEM_ID_RE = /^\/(?:details|download|stream|embed)\/([^/?#]+)/;

/** A link straight to one stored file: `https://ia600705.us.archive.org/34/items/<id>/<path>`. */
const STORED_FILE_RE = /^\/\d+\/items\/[^/]+\/(.+)$/;

/**
 * Readable PDF formats, best first. Borrow-only books carry only an encrypted ACS/LCP file
 * (a different format label), so matching on the label keeps those out.
 */
const PDF_FORMATS = ['Text PDF', 'Image Container PDF', 'Additional Text PDF', 'PDF'];

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `/download/<id>/<name>` is the stable address; it redirects to whichever storage node holds the file. */
const fileUrl = (id: string, name: string) => `https://archive.org/download/${id}/${name.split('/').map(encodeURIComponent).join('/')}`;

function pickPdf(files: IaFile[]): IaFile | undefined {
	for (const format of PDF_FORMATS) {
		const hit = files.find((f) => f.format === format && f.private !== 'true' && /\.pdf$/i.test(f.name));
		if (hit) return hit;
	}
	return undefined;
}

const pickEpub = (files: IaFile[]): IaFile | undefined => files.find((f) => f.format === 'EPUB' && f.private !== 'true');

/**
 * Internet Archive books and documents. The metadata API lists every file in an item, so the
 * PDF is found by its format label rather than guessed from the filename. The EPUB, when the
 * item has one, is offered afterwards as an alternate format (and sent as the file if there is no PDF).
 */
export class InternetArchiveProvider implements IDownloaderProvider {
	readonly platforms = ['archive.org'];

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		let id: string | undefined;
		try {
			const { hostname, pathname } = new URL(url);
			// Already the file itself — nothing to look up.
			const stored = hostname !== 'archive.org' && hostname !== 'www.archive.org' ? STORED_FILE_RE.exec(pathname)?.[1] : undefined;
			if (stored) {
				const filename = decodeURIComponent(stored.split('/').pop() ?? stored);
				return {
					status: 'success',
					media: [{ type: 'document', url, filename }],
					title: filename,
					caption: `📄 <b>${escapeHtml(filename)}</b>`,
				};
			}
			id = decodeURIComponent(ITEM_ID_RE.exec(pathname)?.[1] ?? '');
		} catch {
			/* malformed URL — handled below */
		}
		if (!id) return { status: 'error', error: 'Send a link to a single archive.org item', failureKind: 'unsupported' };

		let data: IaMetadata;
		try {
			const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, {
				headers: { 'User-Agent': BROWSER_UA },
				signal: AbortSignal.timeout(15_000),
			});
			if (!res.ok) return { status: 'error', error: `archive.org returned ${res.status}`, failureKind: kindFromStatus(res.status) };
			data = (await res.json()) as IaMetadata;
		} catch (e) {
			return { status: 'error', error: (e as Error).message || 'Failed to reach archive.org', failureKind: classifyError(e) };
		}

		// A missing item answers 200 with an empty object.
		if (!data.files?.length) return { status: 'error', error: 'This archive.org item does not exist', failureKind: 'gone' };

		const pdf = pickPdf(data.files);
		const epub = pickEpub(data.files);
		const main = pdf ?? epub;
		if (!main) {
			const borrowOnly = data.metadata?.['access-restricted-item'] === 'true' || data.is_dark;
			return {
				status: 'error',
				error: borrowOnly
					? 'This item is borrow-only on archive.org and has no downloadable PDF'
					: 'No PDF or EPUB found in this archive.org item',
				failureKind: borrowOnly ? 'unsupported' : 'gone',
			};
		}

		const rawTitle = data.metadata?.title;
		const title = (Array.isArray(rawTitle) ? rawTitle[0] : rawTitle) || id;
		const filename = main.name.split('/').pop() ?? main.name;
		const filesize = Number(main.size) || undefined;
		const size = formatFileSize(filesize);
		const alt = pdf && epub ? epub : undefined;
		return {
			status: 'success',
			media: [{ type: 'document', url: fileUrl(id, main.name), filename, filesize }],
			title,
			caption: `📄 <b>${escapeHtml(title)}</b>${size ? `\n${size}` : ''}`,
			altFormat: alt && { label: 'epub', url: fileUrl(id, alt.name), filename: alt.name.split('/').pop() ?? alt.name },
		};
	}
}
