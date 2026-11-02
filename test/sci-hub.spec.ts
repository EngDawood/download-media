import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractDoi, parsePaperPage, isCaptchaPage, SciHubProvider } from '../src/services/downloader/platforms/sci-hub';
import { detectMediaUrl } from '../src/utils/url-detector';

// Captured from sci-hub.st for 10.1038/nature12373 (head trimmed). The citation
// meta tags are the whole contract: citation_pdf_url names the file on the
// mirror's own storage, the rest fills the caption.
const ARTICLE_PAGE = `<!DOCTYPE html><html><head>
<title>Sci-Hub. Nanometre-scale thermometry in a living cell / Nature, 2013</title>
<meta  name="citation_title" content="Nanometre-scale thermometry in a living cell">
<meta name="citation_author" content="Kucsko, G.">
<meta  name="citation_publication_date" content="2013">
<meta  name="citation_journal_title" content="Nature">
<meta name="citation_doi" content="10.1038/nature12373">
<meta name="citation_pdf_url" content="/storage/2024/2161/f1fa2076e55135dec9460db8704912d7/kucsko2013.pdf">
<script async defer src = "/scripts/altcha.min.js" type="module"></script>
</head><body></body></html>`;

// The robot check sci-hub serves instead of the article (title verbatim).
const CAPTCHA_PAGE = `<!DOCTYPE html><html><head><title translate = "en:title">Sci-Hub: are you are robot?</title></head>
<body><altcha-widget challengeurl = "/captcha/challenge/54229059" hidelogo hidefooter></altcha-widget></body></html>`;

const PDF_URL = 'https://sci-hub.st/storage/2024/2161/f1fa2076e55135dec9460db8704912d7/kucsko2013.pdf';

describe('extractDoi()', () => {
	it('reads the DOI out of every link shape a user can paste', () => {
		expect(extractDoi('https://doi.org/10.1007/s00402-024-05464-6')).toBe('10.1007/s00402-024-05464-6');
		expect(extractDoi('https://doi.org/10.1177/0092070302250897')).toBe('10.1177/0092070302250897');
		expect(extractDoi('https://doi.org/10.1093/jcr/ucx050')).toBe('10.1093/jcr/ucx050');
		expect(extractDoi('https://sci-hub.st/10.1038/nature12373')).toBe('10.1038/nature12373');
		expect(extractDoi('https://sci-hub.se/https://doi.org/10.1038/nature12373')).toBe('10.1038/nature12373');
		expect(extractDoi('https://sci-net.xyz/10.1038/nature12373')).toBe('10.1038/nature12373');
	});

	it('accepts a bare DOI and a doi: prefix', () => {
		expect(extractDoi('10.1038/nature12373')).toBe('10.1038/nature12373');
		expect(extractDoi('doi:10.1038/nature12373')).toBe('10.1038/nature12373');
		expect(extractDoi('please fetch 10.1038/nature12373 for me')).toBe('10.1038/nature12373');
	});

	it('drops trailing sentence punctuation', () => {
		expect(extractDoi('(see 10.1038/nature12373).')).toBe('10.1038/nature12373');
	});

	it('returns null when there is no DOI', () => {
		expect(extractDoi('https://www.tiktok.com/@u/video/1')).toBeNull();
		expect(extractDoi('https://sci-hub.st/')).toBeNull();
		expect(extractDoi('')).toBeNull();
	});
});

describe('parsePaperPage()', () => {
	it('resolves the citation_pdf_url against the mirror', () => {
		expect(parsePaperPage(ARTICLE_PAGE, 'https://sci-hub.st/10.1038/nature12373')).toEqual({
			pdfUrl: PDF_URL,
			title: 'Nanometre-scale thermometry in a living cell',
			journal: 'Nature',
			year: '2013',
		});
	});

	it('falls back to an iframe PDF when there are no citation tags (the Sci-Net page shape)', () => {
		// Verbatim shape from sci-net.xyz/10.1007/s00402-024-05464-6: the PDF sits in
		// an iframe under sci-net's own /storage/, with a viewer fragment to drop.
		const html =
			'<html><body><div class = "pdf"><iframe src = "/storage/2024/9110390/abc/paper.pdf#view=FitH&navpanes=0"></iframe></div></body></html>';
		expect(parsePaperPage(html, 'https://sci-net.xyz/10.1007/s00402-024-05464-6')?.pdfUrl).toBe(
			'https://sci-net.xyz/storage/2024/9110390/abc/paper.pdf',
		);
	});

	it('returns null for pages with no PDF (robot check, request form)', () => {
		expect(parsePaperPage(CAPTCHA_PAGE, 'https://sci-hub.st/10.1038/nature12373')).toBeNull();
		expect(parsePaperPage('<html><body>not in the database</body></html>', 'https://sci-hub.st/10.1/x')).toBeNull();
	});
});

describe('isCaptchaPage()', () => {
	it('recognises the robot check', () => {
		expect(isCaptchaPage(CAPTCHA_PAGE)).toBe(true);
		expect(isCaptchaPage(ARTICLE_PAGE)).toBe(false);
	});
});

describe('detectMediaUrl() — papers', () => {
	it('routes doi.org and sci-hub links to Sci-Hub', () => {
		expect(detectMediaUrl('https://doi.org/10.1007/s00402-024-05464-6')).toEqual({
			url: 'https://doi.org/10.1007/s00402-024-05464-6',
			platform: 'Sci-Hub',
		});
		expect(detectMediaUrl('look https://sci-hub.ru/10.1093/jcr/ucx050 please')?.platform).toBe('Sci-Hub');
		expect(detectMediaUrl('https://sci-net.xyz/10.1093/jcr/ucx050')?.platform).toBe('Sci-Hub');
	});

	it('turns a bare DOI into its doi.org link', () => {
		expect(detectMediaUrl('10.1177/0092070302250897')).toEqual({ url: 'https://doi.org/10.1177/0092070302250897', platform: 'Sci-Hub' });
	});
});

// ─── Provider (fetch stubbed per host) ───────────────────────────────────────

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => handler(String(url), init));
}

const pdfHead = () => new Response(null, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Length': '943776' } });

describe('SciHubProvider', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('falls past a dead mirror and returns the PDF the next one names', async () => {
		stubFetch((url, init) => {
			if (url === PDF_URL && init?.method === 'HEAD') return pdfHead();
			if (url.startsWith('https://sci-hub.se/')) return new Response('gone', { status: 404 });
			if (url.startsWith('https://sci-hub.st/')) return new Response(ARTICLE_PAGE, { status: 200 });
			throw new Error(`unexpected fetch ${url}`);
		});
		const result = await new SciHubProvider().download('https://doi.org/10.1038/nature12373', 'auto');
		expect(result.status).toBe('success');
		expect(result.media).toEqual([{ type: 'document', url: PDF_URL, filename: 'kucsko2013.pdf', filesize: 943776 }]);
		expect(result.title).toBe('Nanometre-scale thermometry in a living cell');
		expect(result.caption).toContain('Nature');
		expect(result.caption).toContain('10.1038/nature12373');
	});

	it('reports gone when every mirror 404s', async () => {
		stubFetch(() => new Response('nope', { status: 404 }));
		const result = await new SciHubProvider().download('https://doi.org/10.9999/doesnotexist12345', 'auto');
		expect(result.status).toBe('error');
		expect(result.failureKind).toBe('gone');
		expect(result.error).toContain('No paper found');
	});

	it('falls past a DDoS-Guard 403 bot wall to the next mirror', async () => {
		stubFetch((url, init) => {
			if (url === PDF_URL && init?.method === 'HEAD') return pdfHead();
			if (url.startsWith('https://sci-hub.se/')) return new Response('<title>DDoS-Guard</title>', { status: 403 });
			if (url.startsWith('https://sci-hub.st/')) return new Response(ARTICLE_PAGE, { status: 200 });
			throw new Error(`unexpected fetch ${url}`);
		});
		const result = await new SciHubProvider().download('https://doi.org/10.1038/nature12373', 'auto');
		expect(result.status).toBe('success');
	});

	it('resolves relative PDFs against the host that finally served the page', async () => {
		// Mirrors redirect some DOIs to Sci-Net; the stub models that by answering
		// the sci-hub.st request with a page whose final URL is sci-net's.
		stubFetch((url, init) => {
			if (init?.method === 'HEAD') return pdfHead();
			if (url.startsWith('https://sci-hub.se/')) return new Response('gone', { status: 404 });
			if (url.startsWith('https://sci-hub.st/')) {
				const res = new Response(ARTICLE_PAGE, { status: 200 });
				Object.defineProperty(res, 'url', { value: 'https://sci-net.xyz/10.1038/nature12373' });
				return res;
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		const result = await new SciHubProvider().download('https://doi.org/10.1038/nature12373', 'auto');
		expect(result.media?.[0].url).toBe(PDF_URL.replace('sci-hub.st', 'sci-net.xyz'));
	});

	it('takes the title from <title> when the page has no citation meta (Sci-Net shape)', () => {
		const html = `<html><head><title>Sci-Net: Liquid Consumption</title></head>
<body><div class = "pdf"><iframe src = "/storage/2024/1/abc/paper.pdf"></iframe></div></body></html>`;
		const paper = parsePaperPage(html, 'https://sci-net.xyz/10.1093/jcr/ucx050');
		expect(paper?.title).toBe('Liquid Consumption');
	});

	it('stays retryable when one mirror 404s but another only bot-walls', async () => {
		stubFetch((url) => {
			if (String(url).startsWith('https://sci-hub.se/')) return new Response('nope', { status: 404 });
			return new Response(CAPTCHA_PAGE, { status: 200 });
		});
		const result = await new SciHubProvider().download('https://doi.org/10.1038/nature12373', 'auto');
		expect(result.status).toBe('error');
		expect(result.failureKind).toBe('rate_limited');
	});

	it('classifies the robot check as rate_limited, not as a missing paper', async () => {
		stubFetch(() => new Response(CAPTCHA_PAGE, { status: 200 }));
		const result = await new SciHubProvider().download('https://doi.org/10.1038/nature12373', 'auto');
		expect(result.status).toBe('error');
		expect(result.failureKind).toBe('rate_limited');
	});

	it('rejects input with no DOI as unsupported', async () => {
		const result = await new SciHubProvider().download('https://sci-hub.st/', 'auto');
		expect(result).toMatchObject({ status: 'error', failureKind: 'unsupported' });
	});

	it('uses Sci-Net after the mirrors when credentials are configured', async () => {
		const seen: string[] = [];
		stubFetch((url, init) => {
			seen.push(url);
			if (url.startsWith('https://sci-hub.')) return new Response('nope', { status: 404 });
			if (url === 'https://sci-net.xyz/' && init?.method === 'POST') {
				const res = new Response(null, { status: 302 });
				res.headers.append('Set-Cookie', 'session=abc123; Path=/; HttpOnly');
				return res;
			}
			if (url === 'https://sci-net.xyz/10.1038/nature12373') {
				expect(new Headers(init?.headers).get('Cookie')).toContain('session=abc123');
				return new Response(ARTICLE_PAGE.replaceAll('sci-hub.st', 'sci-net.xyz'), { status: 200 });
			}
			if (init?.method === 'HEAD') return pdfHead();
			throw new Error(`unexpected fetch ${url}`);
		});
		const provider = new SciHubProvider({ username: 'botuser1', password: 'botpass123' });
		const result = await provider.download('https://doi.org/10.1038/nature12373', 'auto');
		expect(result.status).toBe('success');
		expect(result.media?.[0].url).toBe(PDF_URL.replace('sci-hub.st', 'sci-net.xyz'));
		expect(seen.filter((u) => u === 'https://sci-net.xyz/')).toHaveLength(1);
	});

	it('never touches Sci-Net without credentials', async () => {
		stubFetch((url) => {
			if (String(url).includes('sci-net')) throw new Error('sci-net must not be called');
			return new Response('nope', { status: 404 });
		});
		const result = await new SciHubProvider().download('https://doi.org/10.1038/nature12373', 'auto');
		expect(result.status).toBe('error');
	});
});
