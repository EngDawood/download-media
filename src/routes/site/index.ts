import { Context } from 'hono';
import { renderPage } from './layout';
import { renderHome } from './home';
import { renderDocs } from './docs';

/**
 * Public marketing site served at the root of dl.engdawood.com.
 *
 * The Custom Domain routes every path to this Worker, so these handlers own `/`
 * and `/docs` while the bot, API, and MCP keep their own paths. Pages are static
 * strings with inlined CSS and no client JavaScript, so they cost one render and
 * cache well at the edge.
 */

/** Static pages change only on deploy, so let the edge and the browser hold them. */
const CACHE_CONTROL = 'public, max-age=300, s-maxage=86400';

export function handleHome(c: Context) {
	return c.html(
		renderPage({
			title: 'Download Media | Media downloader for Telegram',
			description:
				'A Telegram bot that downloads video, photo, and audio from TikTok, Instagram, X, YouTube, and six more platforms. Also available as a REST API and MCP server.',
			path: '/',
			body: renderHome(),
		}),
		200,
		{ 'Cache-Control': CACHE_CONTROL },
	);
}

export function handleDocs(c: Context) {
	return c.html(
		renderPage({
			title: 'API and MCP reference | Download Media',
			description:
				'Reference for the Download Media REST endpoint and MCP server: authentication, request fields, response shape, status codes, and tools.',
			path: '/docs',
			body: renderDocs(),
		}),
		200,
		{ 'Cache-Control': CACHE_CONTROL },
	);
}
