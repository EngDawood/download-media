import { SITE_CSS } from './styles';
import { SITE_COPY, localePath, type SiteLocale } from './copy';
import { structuredData } from './seo';

/** Public entry points the site links to. Keep in sync with DEFAULT_INSTAGRAM_FOOTER. */
export const BOT_URL = 'https://t.me/download_media_4bot';
export const CHANNEL_URL = 'https://t.me/dawo5d';
export const SITE_ORIGIN = 'https://dl.engdawood.com';

interface PageOptions {
	locale: SiteLocale;
	page: 'home' | 'docs';
	/** Body markup for the page, between <main> tags. */
	body: string;
}

/**
 * Wraps page markup in the shared shell: head, sticky nav, footer, inlined CSS.
 *
 * Everything is server rendered and static, and the site ships no JavaScript.
 * English lives at the root and Arabic under /ar; the two are cross-linked with
 * hreflang and a switch in the nav rather than sniffing Accept-Language, so a
 * shared link always lands on the language it names.
 */
export function renderPage({ locale, page, body }: PageOptions): string {
	const t = SITE_COPY[locale];
	const other: SiteLocale = locale === 'ar' ? 'en' : 'ar';
	const home = localePath(locale, 'home');
	const docs = localePath(locale, 'docs');
	const self = page === 'docs' ? docs : home;
	const meta = page === 'docs' ? t.docs : t.home;

	const navLinks = [
		{ href: `${home === '/' ? '' : home}/#platforms`, label: t.nav.platforms },
		{ href: `${home === '/' ? '' : home}/#developers`, label: t.nav.developers },
		{ href: docs, label: t.nav.docs, current: page === 'docs' },
	];

	return `<!DOCTYPE html>
<html lang="${t.htmlLang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${meta.title}</title>
<meta name="description" content="${meta.description}">
<meta name="theme-color" content="#fbfaf7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131311" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${SITE_ORIGIN}${self}">
<link rel="alternate" hreflang="en" href="${SITE_ORIGIN}${localePath('en', page)}">
<link rel="alternate" hreflang="ar" href="${SITE_ORIGIN}${localePath('ar', page)}">
<link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${localePath('en', page)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Download Media">
<meta property="og:locale" content="${locale === 'ar' ? 'ar_AR' : 'en_US'}">
<meta property="og:title" content="${meta.title}">
<meta property="og:description" content="${meta.description}">
<meta property="og:url" content="${SITE_ORIGIN}${self}">
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://cdn.simpleicons.org" crossorigin>
${structuredData(locale, page)}
<style>${SITE_CSS}</style>
</head>
<body>
<a class="skip" href="#main">${t.skip}</a>
<header class="nav">
	<div class="wrap nav__inner">
		<a class="nav__mark" href="${home}">Download<span>.</span>Media</a>
		<nav class="nav__links" aria-label="${t.nav.docs}">
			${navLinks.map((l) => `<a href="${l.href}"${l.current ? ' aria-current="page"' : ''}>${l.label}</a>`).join('')}
		</nav>
		<a class="nav__lang" href="${localePath(other, page)}" hreflang="${t.nav.switchToLang}" lang="${t.nav.switchToLang}" aria-label="${t.nav.switchTo}">
			<span class="nav__lang--full">${t.nav.switchTo}</span><span class="nav__lang--short" aria-hidden="true">${t.nav.switchToShort}</span>
		</a>
		<a class="btn btn--primary" href="${BOT_URL}" rel="noopener">${t.cta.telegram}</a>
	</div>
</header>
<main id="main">
${body}
</main>
<footer class="footer">
	<div class="wrap footer__inner">
		<div class="footer__links">
			<a href="${BOT_URL}" rel="noopener">${t.footer.bot}</a>
			<a href="${CHANNEL_URL}" rel="noopener">${t.footer.channel}</a>
			<a href="${docs}">${t.footer.docs}</a>
			<a href="/health">${t.footer.status}</a>
		</div>
		<p class="footer__note">${t.footer.note}</p>
	</div>
</footer>
</body>
</html>`;
}
