import { Context } from 'hono';
import { SITE_COPY, LOCALES, localePath, type SiteLocale } from './copy';
import { BOT_URL, SITE_ORIGIN } from './layout';

/**
 * Crawler-facing endpoints: robots.txt and sitemap.xml, plus the JSON-LD block
 * embedded in every page.
 *
 * The Custom Domain hands this Worker every path, so the operational routes
 * (/setup, /telegram, /api, /mcp, /test) sit on the same hostname as the public
 * site. `/setup` in particular re-registers the Telegram webhook on a plain GET,
 * so it must be kept out of any crawler's reach.
 */

const DISALLOWED = ['/setup', '/telegram', '/api/', '/mcp', '/test', '/health'];

export function handleRobots(c: Context) {
	const body = [
		'User-agent: *',
		...DISALLOWED.map((path) => `Disallow: ${path}`),
		'Allow: /',
		'',
		`Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
		'',
	].join('\n');
	return c.text(body, 200, { 'Cache-Control': 'public, max-age=86400' });
}

/**
 * Sitemap with reciprocal hreflang links. This is the strongest signal we can give
 * Google that the Arabic pages are a translation of the English ones rather than
 * duplicates, which is what gets them indexed for Arabic queries.
 */
export function handleSitemap(c: Context) {
	const pages: Array<'home' | 'docs'> = ['home', 'docs'];
	const entries = pages.flatMap((page) =>
		LOCALES.map((locale) => {
			const alternates = LOCALES.map(
				(alt) => `\t\t<xhtml:link rel="alternate" hreflang="${alt}" href="${SITE_ORIGIN}${localePath(alt, page)}"/>`,
			).join('\n');
			return [
				'\t<url>',
				`\t\t<loc>${SITE_ORIGIN}${localePath(locale, page)}</loc>`,
				alternates,
				`\t\t<xhtml:link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${localePath('en', page)}"/>`,
				`\t\t<changefreq>monthly</changefreq>`,
				`\t\t<priority>${page === 'home' ? '1.0' : '0.8'}</priority>`,
				'\t</url>',
			].join('\n');
		}),
	);

	const xml = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		...entries,
		'</urlset>',
		'',
	].join('\n');

	return c.body(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
}

/**
 * JSON-LD for the page. Only claims that are verifiably true go in here: no
 * ratings, no download counts, nothing a crawler could later flag as fabricated.
 */
export function structuredData(locale: SiteLocale, page: 'home' | 'docs'): string {
	const t = SITE_COPY[locale];
	const meta = page === 'docs' ? t.docs : t.home;
	const url = `${SITE_ORIGIN}${localePath(locale, page)}`;

	const graph: unknown[] = [
		{
			'@type': 'WebSite',
			'@id': `${SITE_ORIGIN}/#website`,
			url: SITE_ORIGIN,
			name: 'Download Media',
			inLanguage: locale,
		},
		{
			'@type': 'WebPage',
			'@id': `${url}#webpage`,
			url,
			name: meta.title,
			description: meta.description,
			inLanguage: locale,
			isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
		},
	];

	if (page === 'home') {
		graph.push({
			'@type': 'SoftwareApplication',
			name: 'Download Media',
			applicationCategory: 'MultimediaApplication',
			operatingSystem: 'Telegram',
			url: BOT_URL,
			description: meta.description,
			inLanguage: ['en', 'ar'],
			offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
		});
	}

	// `<` is escaped so a value can never close the script element early.
	const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
	return `<script type="application/ld+json">${json}</script>`;
}
