import type { IDownloaderProvider } from '../../../types/downloader-provider';
import type { DownloaderMode, DownloaderResult } from '../../../types/downloader';
import { DownloadError, classifyError, kindFromStatus, mostPermanent, type FailureKind } from '../failure';
import { BROWSER_UA, formatFileSize, metaContent } from '../media-helpers';

/** Sci-Hub mirrors, tried in order until one serves the article page. */
export const SCI_HUB_INSTANCES = ['https://sci-hub.se', 'https://sci-hub.st', 'https://sci-hub.ru'];

export const SCI_NET_BASE = 'https://sci-net.xyz';

/**
 * Every anonymous source, in order. Sci-Net serves its article page without a
 * login for papers its members already hold (and Sci-Hub mirrors redirect some
 * DOIs there), so it belongs in the same chain; the login below is only a
 * last resort for member-only papers.
 */
export const PAPER_INSTANCES = [...SCI_HUB_INSTANCES, SCI_NET_BASE];

const PAGE_HEADERS = {
	'User-Agent': BROWSER_UA,
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.9',
};

const FETCH_TIMEOUT = 15_000;

/** A DOI, without its resolver prefix: `10.<registrant>/<suffix>`. The suffix stops at whitespace and HTML delimiters. */
const DOI_RE = /10\.\d{4,9}\/[^\s"'<>\]]+/;

/**
 * The paper's identifier out of anything a user pastes: a doi.org link, a Sci-Hub or
 * Sci-Net link (whose path is the DOI itself, sometimes wrapped in a full doi.org URL),
 * a `doi:` string, or a bare DOI. Trailing sentence punctuation is not part of a DOI.
 */
export function extractDoi(input: string): string | null {
	const match = input.replace(/^doi:\s*/i, '').match(DOI_RE);
	if (!match) return null;
	return match[0].replace(/[.,;)\]]+$/, '');
}

export interface PaperPage {
	pdfUrl: string;
	title?: string;
	journal?: string;
	year?: string;
}

const decodeEntities = (s: string): string =>
	s
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');

/**
 * The article page carries the paper as citation meta tags (the same markup Google
 * Scholar reads): `citation_pdf_url` is the file, relative on Sci-Hub's own storage.
 * Fallbacks cover the older page shape — the PDF in an iframe/embed or a download
 * anchor. A page with none of these (the ALTCHA robot check, a request form) is a miss.
 */
export function parsePaperPage(html: string, pageUrl: string): PaperPage | null {
	let pdf = metaContent(html, 'citation_pdf_url');
	pdf ??= html.match(/<(?:iframe|embed)[^>]+src\s*=\s*"([^"]+\.pdf(?:[?#][^"]*)?)"/i)?.[1];
	pdf ??= html.match(/<a[^>]+href\s*=\s*"([^"]+\.pdf(?:[?#][^"]*)?)"/i)?.[1];
	if (!pdf) return null;
	// Sci-Net pages carry no citation meta — their <title> is the paper title.
	// Sci-Hub's is "Sci-Hub. <title> / <journal>, <year>", so strip both wrappings.
	const rawTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '';
	const tagTitle = (/^Sci-Hub/i.test(rawTag.trim()) ? rawTag.replace(/\s*\/\s*[^/]*$/, '') : rawTag)
		.replace(/^\s*Sci-(?:Hub|Net)[.:]\s*/i, '')
		.trim();
	return {
		// The viewer fragment (#view=FitH&navpanes=0) is display state, not address.
		pdfUrl: new URL(decodeEntities(pdf).split('#')[0], pageUrl).toString(),
		title: metaContent(html, 'citation_title') ? decodeEntities(metaContent(html, 'citation_title')!) : tagTitle || undefined,
		journal: metaContent(html, 'citation_journal_title') ? decodeEntities(metaContent(html, 'citation_journal_title')!) : undefined,
		year: metaContent(html, 'citation_publication_date') ?? metaContent(html, 'citation_date'),
	};
}

/** True when the instance answered with its ALTCHA robot check instead of the article. */
export const isCaptchaPage = (html: string): boolean => html.includes('altcha-widget') || /are you a? robot/i.test(html);

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface SciNetCredentials {
	username?: string;
	password?: string;
}

/**
 * Research papers by DOI, exactly like the Internet Archive provider one platform over:
 * the user sends a link (here a doi.org, Sci-Hub or Sci-Net link — or a bare DOI, which
 * the URL detector turns into a doi.org link) and gets the item's PDF back as a document.
 *
 * Sci-Hub mirrors serve the article page anonymously: it names the PDF in a
 * `citation_pdf_url` meta tag. Sci-Net serves its article page anonymously too for
 * papers its members already hold (PDF in an iframe; unheld papers bounce to the
 * login page), and mirrors redirect some DOIs there — so it is part of the same
 * chain. Behind its login (a plain form POST of user/pass/action=login, no token
 * or signing) it may hold more, so with SCI_NET_USERNAME / SCI_NET_PASSWORD
 * secrets set it is tried once more, logged in, at the end. Registration there
 * is invite-only, so the bot cannot create its own account.
 */
export class SciHubProvider implements IDownloaderProvider {
	readonly platforms = ['sci-hub.se', 'sci-hub.st', 'sci-hub.ru', 'sci-net.xyz', 'doi.org'];

	constructor(private readonly sciNet: SciNetCredentials = {}) {}

	async download(url: string, _mode: DownloaderMode): Promise<DownloaderResult> {
		const doi = extractDoi(url);
		if (!doi)
			return { status: 'error', error: 'Send a DOI link (doi.org/10.…), a Sci-Hub link, or a bare DOI', failureKind: 'unsupported' };

		const failures: FailureKind[] = [];
		for (const base of PAPER_INSTANCES) {
			try {
				return await this.fromInstance(base, doi);
			} catch (e) {
				failures.push(classifyError(e));
				// A 404 is the mirror saying it does not hold the paper — another mirror
				// may, so keep going; every other failure is recorded the same way.
				if (e instanceof DownloadError && e.kind === 'gone') continue;
			}
		}
		if (this.sciNet.username && this.sciNet.password) {
			try {
				return await this.fromSciNet(doi);
			} catch (e) {
				failures.push(classifyError(e));
			}
		}
		// Unlike the btch fleet (one backend raced), these are independent sources:
		// one mirror's 404 says nothing about a mirror that only bot-walled us. So
		// the result is `gone` only when every source answered definitively; any
		// transient failure keeps it retryable and the message honest.
		const kind: FailureKind =
			failures.length && failures.every((k) => k === 'gone')
				? 'gone'
				: failures.includes('rate_limited')
					? 'rate_limited'
					: mostPermanent(failures);
		return {
			status: 'error',
			error:
				kind === 'gone'
					? `No paper found for DOI ${doi} on Sci-Hub or Sci-Net`
					: `Sci-Hub did not serve DOI ${doi} (the mirrors may be busy or robot-checking) — try again`,
			failureKind: kind,
		};
	}

	/** One mirror: fetch its article page for the DOI, then confirm the PDF it names. */
	private async fromInstance(base: string, doi: string): Promise<DownloaderResult> {
		const pageUrl = `${base}/${doi}`;
		const res = await fetch(pageUrl, { headers: PAGE_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT) });
		// DDoS-Guard answers fresh clients 403 before it lets them through; that is a
		// statement about this attempt, not about the paper, so it stays retryable.
		if (res.status === 403) throw new DownloadError(`${base} served a bot wall (403)`, 'rate_limited');
		if (!res.ok) throw new DownloadError(`${base} returned ${res.status}`, kindFromStatus(res.status));
		const html = await res.text();
		// Mirrors redirect some DOIs to Sci-Net — relative PDF paths belong to the
		// host that finally served the page, not the one we asked.
		const paper = parsePaperPage(html, res.url || pageUrl);
		if (!paper) {
			// The robot check is a statement about this mirror right now, not about the
			// paper — classify it transient so the caller's auto-retry can help.
			if (isCaptchaPage(html)) throw new DownloadError(`${base} served a robot check`, 'rate_limited');
			throw new DownloadError(`${base} has no PDF for this DOI`, 'gone');
		}
		return this.toResult(paper, doi);
	}

	/** Sci-Net: log in once per isolate (plain form POST), reuse the session cookie. */
	private async fromSciNet(doi: string): Promise<DownloaderResult> {
		const cookie = await sciNetSession(this.sciNet);
		const pageUrl = `${SCI_NET_BASE}/${doi}`;
		const res = await fetch(pageUrl, {
			headers: { 'User-Agent': BROWSER_UA, Cookie: cookie },
			redirect: 'follow',
			signal: AbortSignal.timeout(FETCH_TIMEOUT),
		});
		if (!res.ok) throw new DownloadError(`sci-net returned ${res.status}`, kindFromStatus(res.status));
		const html = await res.text();
		// Bounced back to the login page means the session did not stick.
		if (html.includes('name = "action" value = "login"') || html.includes('name="action" value="login"')) {
			throw new DownloadError('sci-net login failed — check SCI_NET_USERNAME / SCI_NET_PASSWORD', 'gone');
		}
		const paper = parsePaperPage(html, res.url || pageUrl);
		if (!paper) throw new DownloadError('sci-net has no PDF for this DOI (it may need a member request first)', 'gone');
		return this.toResult(paper, doi);
	}

	/** HEAD the PDF for its real name and size, then hand back the document item. */
	private async toResult(paper: PaperPage, doi: string): Promise<DownloaderResult> {
		let filesize: number | undefined;
		try {
			const head = await fetch(paper.pdfUrl, {
				method: 'HEAD',
				headers: { 'User-Agent': BROWSER_UA },
				redirect: 'follow',
				signal: AbortSignal.timeout(FETCH_TIMEOUT),
			});
			const type = (head.headers.get('content-type') || '').toLowerCase();
			if (head.ok && type.includes('pdf')) filesize = Number(head.headers.get('content-length') || 0) || undefined;
			await head.body?.cancel();
		} catch {
			/* size is decoration — the link itself already resolved */
		}
		const filename = decodeURIComponent(paper.pdfUrl.split('/').pop()?.split(/[?#]/)[0] ?? '') || `${doi.replace('/', '_')}.pdf`;
		const title = paper.title || doi;
		const meta = [paper.journal, paper.year].filter(Boolean).join(', ');
		const size = formatFileSize(filesize);
		return {
			status: 'success',
			media: [{ type: 'document', url: paper.pdfUrl, filename, filesize }],
			title,
			caption: `📄 <b>${escapeHtml(title)}</b>${meta ? `\n${escapeHtml(meta)}` : ''}\n<code>${escapeHtml(doi)}</code>${size ? `\n${size}` : ''}`,
		};
	}
}

// ─── Sci-Net session ─────────────────────────────────────────────────────────

let cachedSession: { user: string; cookie: string; at: number } | null = null;
const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Sci-Net's login is a plain HTML form POST (fields user / pass / action=login) —
 * verified against the live site: no signing, no captcha on the login form itself.
 * The session arrives as Set-Cookie headers; keep them for half an hour per isolate.
 */
async function sciNetSession(creds: SciNetCredentials): Promise<string> {
	if (cachedSession && cachedSession.user === creds.username && Date.now() - cachedSession.at < SESSION_TTL_MS) return cachedSession.cookie;
	const res = await fetch(`${SCI_NET_BASE}/`, {
		method: 'POST',
		headers: { 'User-Agent': BROWSER_UA, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ user: creds.username!, pass: creds.password!, action: 'login' }).toString(),
		redirect: 'manual',
		signal: AbortSignal.timeout(FETCH_TIMEOUT),
	});
	const cookies = (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') ?? ''])
		.map((c) => c.split(';')[0].trim())
		.filter(Boolean);
	await res.body?.cancel();
	if (!cookies.length) throw new DownloadError('sci-net login failed — check SCI_NET_USERNAME / SCI_NET_PASSWORD', 'gone');
	cachedSession = { user: creds.username!, cookie: cookies.join('; '), at: Date.now() };
	return cachedSession.cookie;
}
