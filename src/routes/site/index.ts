import { Context } from 'hono';
import { renderPage } from './layout';
import { renderHome } from './home';
import { renderDocs } from './docs';
import type { SiteLocale } from './copy';

/**
 * Public marketing site served at the root of dl.engdawood.com.
 *
 * The Custom Domain routes every path to this Worker, so these handlers own `/`,
 * `/docs`, and the Arabic pair under `/ar`. Pages are static strings with inlined
 * CSS and no client JavaScript, so they cost one render and cache well at the edge.
 */

/** Static pages change only on deploy, so let the edge and the browser hold them. */
const CACHE_CONTROL = 'public, max-age=300, s-maxage=86400';

/** Tells shared caches that the same path is one document per locale, not per user. */
const HEADERS = { 'Cache-Control': CACHE_CONTROL, 'Content-Language': '' };

function page(c: Context, locale: SiteLocale, which: 'home' | 'docs') {
	const body = which === 'docs' ? renderDocs(locale) : renderHome(locale);
	return c.html(renderPage({ locale, page: which, body }), 200, { ...HEADERS, 'Content-Language': locale });
}

export { handleRobots, handleSitemap } from './seo';

export const handleHome = (c: Context) => page(c, 'en', 'home');
export const handleDocs = (c: Context) => page(c, 'en', 'docs');
export const handleHomeAr = (c: Context) => page(c, 'ar', 'home');
export const handleDocsAr = (c: Context) => page(c, 'ar', 'docs');
