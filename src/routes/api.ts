import { Context } from 'hono';
import { downloadMedia } from '../services/media-downloader';
import type { DownloaderMode } from '../types/downloader';
import { detectMediaUrl, isBlockedDomain } from '../utils/url-detector';

const VALID_MODES: DownloaderMode[] = ['auto', 'audio', 'hd', 'sd'];

/**
 * Public download API — lets external apps fetch media without going through the bot.
 *
 *   POST /api/download
 *   Header: X-API-Key: <PUBLIC_API_KEY>
 *   Body:   { "url": "https://...", "mode"?: "auto" | "audio" | "hd" | "sd", "platform"?: string }
 *
 * Returns the raw DownloaderResult JSON: { status, media: [{ type, url, ... }], caption, ... }.
 * Requires the PUBLIC_API_KEY secret to be set; the endpoint is disabled (503) otherwise.
 */
export async function handleApiDownload(c: Context) {
	const apiKey = c.env.PUBLIC_API_KEY;
	// Fail closed: if no key is configured the API stays disabled rather than wide open.
	if (!apiKey) {
		return c.json({ status: 'error', error: 'API is not enabled' }, 503);
	}
	if (c.req.header('X-API-Key') !== apiKey) {
		return c.json({ status: 'error', error: 'Unauthorized' }, 401);
	}

	let body: { url?: string; mode?: string; platform?: string };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ status: 'error', error: 'Invalid JSON body' }, 400);
	}

	if (!body.url || typeof body.url !== 'string') {
		return c.json({ status: 'error', error: 'url is required' }, 400);
	}

	const mode = (VALID_MODES as string[]).includes(body.mode ?? '')
		? (body.mode as DownloaderMode)
		: 'auto';

	// Reuse the bot's detection so the API normalizes URLs and enforces the same content policy.
	const detected = detectMediaUrl(body.url);
	if (!detected) {
		return c.json({ status: 'error', error: 'No supported URL found' }, 400);
	}
	if (isBlockedDomain(detected.url)) {
		return c.json({ status: 'error', error: 'This content is not allowed' }, 403);
	}

	const platform = body.platform || detected.platform;
	const result = await downloadMedia(detected.url, mode, platform, c.env);
	return c.json({ ...result, platform }, result.status === 'success' ? 200 : 502);
}
