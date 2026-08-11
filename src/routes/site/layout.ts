import { SITE_CSS } from './styles';

/** Public entry points the site links to. Keep in sync with DEFAULT_INSTAGRAM_FOOTER. */
export const BOT_URL = 'https://t.me/download_media_4bot';
export const CHANNEL_URL = 'https://t.me/dawo5d';
export const SITE_ORIGIN = 'https://dl.engdawood.com';

const NAV_LINKS: Array<{ href: string; label: string }> = [
	{ href: '/#platforms', label: 'Platforms' },
	{ href: '/#developers', label: 'Developers' },
	{ href: '/docs', label: 'Docs' },
];

interface PageOptions {
	/** Goes in <title> and og:title. */
	title: string;
	/** Meta + og description. One sentence. */
	description: string;
	/** Current path, used to mark the active nav item. */
	path: string;
	/** Body markup for the page, between <main> tags. */
	body: string;
}

function navLink(link: { href: string; label: string }, path: string): string {
	const current = link.href === path ? ' aria-current="page"' : '';
	return `<a href="${link.href}"${current}>${link.label}</a>`;
}

/**
 * Wraps page markup in the shared shell: head, sticky nav, footer, inlined CSS.
 * Everything is server rendered and static; the site ships no JavaScript.
 */
export function renderPage({ title, description, path, body }: PageOptions): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#fbfaf7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131311" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${SITE_ORIGIN}${path === '/' ? '/' : path}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Download Media">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${SITE_ORIGIN}${path === '/' ? '/' : path}">
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://cdn.simpleicons.org" crossorigin>
<style>${SITE_CSS}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
	<div class="wrap nav__inner">
		<a class="nav__mark" href="/">Download<span>.</span>Media</a>
		<nav class="nav__links" aria-label="Primary">${NAV_LINKS.map((l) => navLink(l, path)).join('')}</nav>
		<a class="btn btn--primary" href="${BOT_URL}" rel="noopener">Open in Telegram</a>
	</div>
</header>
<main id="main">
${body}
</main>
<footer class="footer">
	<div class="wrap footer__inner">
		<div class="footer__links">
			<a href="${BOT_URL}" rel="noopener">Telegram bot</a>
			<a href="${CHANNEL_URL}" rel="noopener">Channel</a>
			<a href="/docs">API docs</a>
			<a href="/health">Status</a>
		</div>
		<p class="footer__note">Built on Cloudflare Workers. Download for personal use and respect each platform's terms.</p>
	</div>
</footer>
</body>
</html>`;
}
