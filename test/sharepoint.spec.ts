import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseSharePointUrl, encodeShareToken, SharePointProvider } from '../src/services/downloader/platforms/sharepoint';
import { detectMediaUrl } from '../src/utils/url-detector';

afterEach(() => vi.unstubAllGlobals());

const SHARE_FOLDER_URL = 'https://contoso-my.sharepoint.com/:f:/g/personal/alice_contoso_com/Eabc123?e=def456';
const SHARE_FILE_URL =
	'https://contoso-my.sharepoint.com/:w:/r/personal/alice_contoso_com/Documents/Report.docx?sourcedoc=%7B11111111-2222-3333-4444-555555555555%7D&file=Report.docx&e=def456';
const ONEDRIVE_MS_FOLDER = 'https://1drv.ms/f/s!AtuAM_NacwVahiFpuMGS_BiQCwWu';
const ONEDRIVE_MS_FILE = 'https://1drv.ms/u/s!AtuAM_NacwVahiFpuMGS_BiQCwWu';
const PAGE_URL =
	'https://joufuniversity-my.sharepoint.com/personal/emena_ju_edu_sa/_layouts/15/onedrive.aspx?id=%2Fpersonal%2Femena_ju_edu_sa%2FDocuments%2FFolder&ga=1';

type Handler = (input: string, init?: RequestInit) => Promise<Response>;

function stubFetch(handler: Handler) {
	vi.stubGlobal('fetch', handler);
}

function jsonResponse(body: unknown, status = 200, url?: string): Response {
	const res = Response.json(body, { status });
	if (url) Object.defineProperty(res, 'url', { value: url });
	return res;
}

function textResponse(body: string, status = 200, url?: string, headers?: Record<string, string>): Response {
	const res = new Response(body, { status, headers });
	if (url) Object.defineProperty(res, 'url', { value: url });
	return res;
}

/** Shares-API file item, shaped like the real driveItem. */
function sharesFileItem() {
	return {
		id: 'file-id',
		name: 'Report.docx',
		size: 12345,
		file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
		'@microsoft.graph.downloadUrl': 'https://contoso-my.sharepoint.com/personal/alice_contoso_com/Documents/Report.docx?download=1',
	};
}

/** Shares-API folder item with children, shaped like the real driveItem. */
function sharesFolderItem() {
	return {
		id: 'folder-id',
		name: 'Folder',
		folder: { childCount: 3 },
		children: [
			{
				name: 'a.pdf',
				size: 1000,
				file: { mimeType: 'application/pdf' },
				'@microsoft.graph.downloadUrl': 'https://contoso-my.sharepoint.com/x/a.pdf',
			},
			{
				name: 'b.jpg',
				size: 2000,
				file: { mimeType: 'image/jpeg' },
				'@microsoft.graph.downloadUrl': 'https://contoso-my.sharepoint.com/x/b.jpg',
			},
			{ name: 'Sub', folder: { childCount: 2 } },
		],
	};
}

describe('parseSharePointUrl()', () => {
	it('parses a :f: folder share link', () => {
		expect(parseSharePointUrl(SHARE_FOLDER_URL)).toEqual({
			kind: 'share',
			shareType: 'folder',
			shareUrl: SHARE_FOLDER_URL,
		});
	});

	it('parses :w: / :x: / :p: file share links', () => {
		expect(parseSharePointUrl(SHARE_FILE_URL)).toMatchObject({ kind: 'share', shareType: 'file' });
		expect(
			parseSharePointUrl(
				'https://contoso.sharepoint.com/:x:/r/sites/Team/Shared%20Documents/Data.xlsx?sourcedoc=%7B11111111-2222-3333-4444-555555555555%7D',
			),
		).toMatchObject({ kind: 'share', shareType: 'file' });
		expect(
			parseSharePointUrl(
				'https://contoso.sharepoint.com/:p:/r/sites/Team/Shared%20Documents/Deck.pptx?sourcedoc=%7B11111111-2222-3333-4444-555555555555%7D',
			),
		).toMatchObject({ kind: 'share', shareType: 'file' });
	});

	it('parses 1drv.ms folder and file links', () => {
		expect(parseSharePointUrl(ONEDRIVE_MS_FOLDER)).toMatchObject({ kind: 'share', shareType: 'folder' });
		expect(parseSharePointUrl(ONEDRIVE_MS_FILE)).toMatchObject({ kind: 'share', shareType: 'file' });
	});

	it('parses an onedrive.aspx page URL with its folder path', () => {
		expect(parseSharePointUrl(PAGE_URL)).toEqual({
			kind: 'page',
			folderPath: '/personal/emena_ju_edu_sa/Documents/Folder',
			host: 'joufuniversity-my.sharepoint.com',
		});
	});

	it('decodes a redeem token back to the share link', () => {
		// redeem=<base64 of the 1drv.ms URL> — what onedrive.live.com lands on after a share click.
		const redeem = 'aHR0cHM6Ly8xZHJ2Lm1zL2YvcyFBdHVBTV9OYWN3VmFoaUZwdU1HU19CaVFDd1d1';
		expect(parseSharePointUrl(`https://onedrive.live.com/?id=x&cid=y&redeem=${redeem}&ga=1`)).toMatchObject({
			kind: 'share',
			shareType: 'folder',
			shareUrl: ONEDRIVE_MS_FOLDER,
		});
	});

	it('parses a direct onedrive.live.com download link', () => {
		expect(parseSharePointUrl('https://onedrive.live.com/download?cid=ABC&resid=ABC%21123&authkey=!xyz')).toMatchObject({ kind: 'direct' });
	});

	it('parses plain onedrive.live.com share/view URLs', () => {
		expect(parseSharePointUrl('https://onedrive.live.com/?id=/personal/alice/Documents/Folder&cid=ABC')).toMatchObject({
			kind: 'share',
			shareType: 'folder',
		});
		expect(parseSharePointUrl('https://onedrive.live.com/?resid=ABC%21123&cid=ABC')).toMatchObject({
			kind: 'share',
			shareType: 'file',
		});
		expect(parseSharePointUrl('https://onedrive.live.com/')).toBeNull();
	});

	it('rejects plain SharePoint site URLs and random links', () => {
		expect(parseSharePointUrl('https://contoso.sharepoint.com/sites/Team')).toBeNull();
		expect(parseSharePointUrl('https://example.com/file.pdf')).toBeNull();
		expect(parseSharePointUrl('not a url')).toBeNull();
	});
});

describe('encodeShareToken()', () => {
	it('matches the token from Microsoft’s own shares-API docs example', () => {
		// The docs example link and its u! token, verbatim.
		expect(encodeShareToken('https://1drv.ms/f/s!AtuAM_NacwVahiFpuMGS_BiQCwWu')).toBe(
			'u!aHR0cHM6Ly8xZHJ2Lm1zL2YvcyFBdHVBTV9OYWN3VmFoaUZwdU1HU19CaVFDd1d1',
		);
	});

	it('uses URL-safe base64 with no padding', () => {
		const token = encodeShareToken('https://contoso.sharepoint.com/:f:/g/personal/a/E1?e=xy+z/1');
		expect(token.startsWith('u!')).toBe(true);
		expect(token).not.toMatch(/[+/=]/);
	});
});

describe('detectMediaUrl() — SharePoint / OneDrive', () => {
	it('routes share links, 1drv.ms links, page URLs and live.com links to SharePoint', () => {
		expect(detectMediaUrl(SHARE_FOLDER_URL)?.platform).toBe('SharePoint');
		expect(detectMediaUrl(ONEDRIVE_MS_FOLDER)?.platform).toBe('SharePoint');
		expect(detectMediaUrl(ONEDRIVE_MS_FILE)?.platform).toBe('SharePoint');
		expect(detectMediaUrl(PAGE_URL)?.platform).toBe('SharePoint');
		expect(detectMediaUrl('https://onedrive.live.com/?id=/personal/alice/Documents/Folder&cid=ABC')?.platform).toBe('SharePoint');
	});

	it('does not route plain SharePoint site URLs to the SharePoint provider', () => {
		// The generic fallback names it after the hostname ("Sharepoint"); the
		// provider's own 'SharePoint' pattern must not claim it.
		expect(detectMediaUrl('https://contoso.sharepoint.com/sites/Team')?.platform).not.toBe('SharePoint');
	});
});

describe('SharePointProvider.download() — shares API', () => {
	const provider = new SharePointProvider();

	it('returns a single file from a shares-API file item', async () => {
		stubFetch(async (input) => {
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse(sharesFileItem());
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FILE_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media).toHaveLength(1);
		expect(result.media![0].filename).toBe('Report.docx');
		expect(result.media![0].filesize).toBe(12345);
		expect(result.media![0].url).toContain('Report.docx');
	});

	it('returns the server-side zip when /content answers application/zip', async () => {
		stubFetch(async (input, init) => {
			if (input.includes('/root/content') && init?.method === 'HEAD') {
				return new Response(null, {
					status: 200,
					headers: { 'content-type': 'application/zip', 'content-length': '1000000' },
				});
			}
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse(sharesFolderItem());
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FOLDER_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media).toHaveLength(1);
		expect(result.media![0].type).toBe('document');
		expect(result.media![0].filename).toBe('Folder.zip');
		expect(result.media![0].filesize).toBe(1000000);
		expect(result.media![0].url).toContain('/root/content');
	});

	it('falls back to enumerating children when the zip probe fails', async () => {
		stubFetch(async (input, init) => {
			if (input.includes('/root/content') && init?.method === 'HEAD') {
				return new Response(null, { status: 405 });
			}
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse(sharesFolderItem());
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FOLDER_URL, 'auto');
		expect(result.status).toBe('success');
		// Two files; the Sub folder is skipped and named in the caption.
		expect(result.media).toHaveLength(2);
		expect(result.media!.map((m) => m.filename)).toEqual(['a.pdf', 'b.jpg']);
		expect(result.caption).toContain('Sub');
	});

	it('falls back to enumerating when the zip is over the 40MB cap', async () => {
		stubFetch(async (input, init) => {
			if (input.includes('/root/content') && init?.method === 'HEAD') {
				return new Response(null, {
					status: 200,
					headers: { 'content-type': 'application/zip', 'content-length': String(45 * 1024 * 1024) },
				});
			}
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse(sharesFolderItem());
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FOLDER_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media).toHaveLength(2);
	});

	it('sends at most 10 files from a big folder', async () => {
		const many = Array.from({ length: 12 }, (_, i) => ({
			name: `f${i}.pdf`,
			size: 100,
			file: { mimeType: 'application/pdf' },
			'@microsoft.graph.downloadUrl': `https://contoso-my.sharepoint.com/x/f${i}.pdf`,
		}));
		stubFetch(async (input, init) => {
			if (input.includes('/root/content')) return new Response(null, { status: 405 });
			if (input.includes('api.onedrive.com/v1.0/shares/')) {
				return jsonResponse({ name: 'Big', folder: { childCount: 12 }, children: many });
			}
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FOLDER_URL, 'auto');
		expect(result.media).toHaveLength(10);
		expect(result.caption).toContain('10 of 12');
	});

	it('falls back to enumerating when the zip probe answers without a size', async () => {
		stubFetch(async (input, init) => {
			if (input.includes('/root/content') && init?.method === 'HEAD') {
				// application/zip but no content-length — Telegram would get an unguarded URL.
				return new Response(null, { status: 200, headers: { 'content-type': 'application/zip' } });
			}
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse(sharesFolderItem());
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FOLDER_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media).toHaveLength(2);
	});

	it('recurses into subfolders instead of only naming them', async () => {
		const folderWithSub = {
			id: 'folder-id',
			name: 'Folder',
			folder: { childCount: 2 },
			children: [
				{
					name: 'a.pdf',
					size: 1000,
					file: { mimeType: 'application/pdf' },
					'@microsoft.graph.downloadUrl': 'https://contoso-my.sharepoint.com/x/a.pdf',
				},
				{ id: 'sub-id', name: 'Sub', folder: { childCount: 1 } },
			],
		};
		stubFetch(async (input, init) => {
			if (input.includes('/root/content')) return new Response(null, { status: 405 });
			if (input.includes('/items/sub-id/children')) {
				return jsonResponse({
					value: [
						{
							name: 'c.txt',
							size: 300,
							file: { mimeType: 'text/plain' },
							'@microsoft.graph.downloadUrl': 'https://contoso-my.sharepoint.com/x/c.txt',
						},
					],
				});
			}
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse(folderWithSub);
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FOLDER_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media!.map((m) => m.filename)).toEqual(['a.pdf', 'c.txt']);
		expect(result.caption).not.toContain('Sub');
	});

	it('links files over Telegram’s 50MB cap in the caption when enumerating', async () => {
		const children = [
			{ name: 'small.pdf', size: 100, file: {}, '@microsoft.graph.downloadUrl': 'https://x/small.pdf' },
			{ name: 'huge.mp4', size: 60 * 1024 * 1024, file: {}, '@microsoft.graph.downloadUrl': 'https://x/huge.mp4' },
		];
		stubFetch(async (input) => {
			if (input.includes('/root/content')) return new Response(null, { status: 405 });
			if (input.includes('api.onedrive.com/v1.0/shares/')) {
				return jsonResponse({ name: 'Folder', folder: { childCount: 2 }, children });
			}
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FOLDER_URL, 'auto');
		expect(result.media).toHaveLength(1);
		expect(result.media![0].filename).toBe('small.pdf');
		// The big file is not sent, but its direct download URL is offered — the existing "too large" pattern.
		expect(result.caption).toContain('huge.mp4');
		expect(result.caption).toContain('https://x/huge.mp4');
	});

	it('answers a folder of only oversize files with their direct links', async () => {
		const children = [{ name: 'huge.mp4', size: 60 * 1024 * 1024, file: {}, '@microsoft.graph.downloadUrl': 'https://x/huge.mp4' }];
		stubFetch(async (input) => {
			if (input.includes('/root/content')) return new Response(null, { status: 405 });
			if (input.includes('api.onedrive.com/v1.0/shares/')) {
				return jsonResponse({ name: 'Folder', folder: { childCount: 1 }, children });
			}
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FOLDER_URL, 'auto');
		expect(result.status).toBe('error');
		expect(result.error).toContain('huge.mp4');
		expect(result.error).toContain('https://x/huge.mp4');
	});

	it('tells the user to share the link when the shares API answers 401', async () => {
		stubFetch(async (input) => {
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse({ error: { code: 'unauthenticated' } }, 401);
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(ONEDRIVE_MS_FOLDER, 'auto');
		expect(result.status).toBe('error');
		expect(result.failureKind).toBe('gone');
		expect(result.error).toContain('Anyone with the link');
	});

	it('tells the user to share the link when the shares API answers 403', async () => {
		stubFetch(async (input) => {
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse({ error: { code: 'accessDenied' } }, 403);
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(ONEDRIVE_MS_FOLDER, 'auto');
		expect(result.status).toBe('error');
		expect(result.failureKind).toBe('gone');
		expect(result.error).toContain('Anyone with the link');
	});

	it('reports a dead share link as gone on 404', async () => {
		stubFetch(async (input) => {
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse({ error: { code: 'itemNotFound' } }, 404);
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(ONEDRIVE_MS_FOLDER, 'auto');
		expect(result.status).toBe('error');
		expect(result.failureKind).toBe('gone');
	});
});

describe('SharePointProvider.download() — REST fallback (sharept-dl flow)', () => {
	const provider = new SharePointProvider();

	/** Session GET: lands on the tenant host with the folder id and a cookie. */
	function sessionResponse(finalUrl: string): Response {
		const res = textResponse('<html></html>', 200, finalUrl);
		Object.defineProperty(res, 'headers', {
			value: {
				get: () => null,
				getSetCookie: () => ['SPOIDCRL=abc123; Path=/; HttpOnly'],
			},
		});
		return res;
	}

	function restFilesResponse(files: Array<{ Name: string; ServerRelativeUrl: string; Length: number }>): Response {
		return jsonResponse({ d: { results: files } });
	}

	it('enumerates a folder through the REST API when the shares API fails', async () => {
		stubFetch(async (input, init) => {
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse({ error: {} }, 500);
			if (input.includes('/_api/web/GetFolderByServerRelativeUrl') && input.includes('/Files?')) {
				return restFilesResponse([
					{ Name: 'doc.pdf', ServerRelativeUrl: '/personal/alice_contoso_com/Documents/Folder/doc.pdf', Length: 500 },
				]);
			}
			if (input.includes('/_api/web/GetFolderByServerRelativeUrl') && input.includes('/Folders?')) {
				return jsonResponse({ d: { results: [] } });
			}
			if (input.includes('download.aspx')) {
				return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-length': '3' } });
			}
			if (input.startsWith('https://contoso-my.sharepoint.com/:f:/')) {
				return sessionResponse(
					'https://contoso-my.sharepoint.com/:f:/g/personal/alice_contoso_com/Eabc123?id=/personal/alice_contoso_com/Documents/Folder&e=def456',
				);
			}
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FOLDER_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media).toHaveLength(1);
		expect(result.media![0].filename).toBe('doc.pdf');
		expect(result.media![0].buffer).toBeInstanceOf(Uint8Array);
	});

	it('returns the REST folder zip when download.aspx answers with zip bytes', async () => {
		stubFetch(async (input) => {
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse({ error: {} }, 500);
			if (input.includes('download.aspx')) {
				// PK\x03\x04 — a real zip, not an HTML error page.
				return new Response(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]), { status: 200, headers: { 'content-length': '7' } });
			}
			if (input.startsWith('https://contoso-my.sharepoint.com/:f:/')) {
				return sessionResponse(
					'https://contoso-my.sharepoint.com/:f:/g/personal/alice_contoso_com/Eabc123?id=/personal/alice_contoso_com/Documents/Folder&e=def456',
				);
			}
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FOLDER_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media).toHaveLength(1);
		expect(result.media![0].filename).toBe('Folder.zip');
		expect(result.media![0].buffer).toBeInstanceOf(Uint8Array);
	});

	it('resolves a single file through GetFileById when the shares API fails', async () => {
		stubFetch(async (input) => {
			if (input.includes('api.onedrive.com/v1.0/shares/')) return jsonResponse({ error: {} }, 500);
			if (input.includes("/_api/web/GetFileById('11111111-2222-3333-4444-555555555555')")) {
				return jsonResponse({
					d: {
						Name: 'Report.docx',
						ServerRelativeUrl: '/personal/alice_contoso_com/Documents/Report.docx',
						Length: 12345,
					},
				});
			}
			if (input.includes('download.aspx')) {
				return new Response(new Uint8Array([9, 9]), { status: 200, headers: { 'content-length': '2' } });
			}
			if (input.startsWith('https://contoso-my.sharepoint.com/:w:/')) {
				return sessionResponse(
					'https://contoso-my.sharepoint.com/:w:/r/personal/alice_contoso_com/Documents/Report.docx?sourcedoc=%7B11111111-2222-3333-4444-555555555555%7D',
				);
			}
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(SHARE_FILE_URL, 'auto');
		expect(result.status).toBe('success');
		expect(result.media![0].filename).toBe('Report.docx');
		expect(result.media![0].buffer).toBeInstanceOf(Uint8Array);
	});
});

describe('SharePointProvider.download() — onedrive.aspx page URLs', () => {
	const provider = new SharePointProvider();

	it('returns the share-link guidance when the folder needs sign-in (403)', async () => {
		stubFetch(async (input) => {
			if (input.includes('onedrive.aspx')) {
				return textResponse('Access denied', 403, PAGE_URL, { 'x-forms_based_auth_required': '1' });
			}
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(PAGE_URL, 'auto');
		expect(result.status).toBe('error');
		expect(result.failureKind).toBe('gone');
		expect(result.error).toContain('Anyone with the link');
	});

	it('returns the share-link guidance when bounced to the Microsoft login', async () => {
		stubFetch(async (input) => {
			if (input.includes('onedrive.aspx')) {
				return textResponse('<html>login</html>', 200, 'https://login.microsoftonline.com/common/oauth2/authorize?x=1');
			}
			throw new Error(`unexpected fetch: ${input}`);
		});
		const result = await provider.download(PAGE_URL, 'auto');
		expect(result.status).toBe('error');
		expect(result.error).toContain('Anyone with the link');
	});
});
