import type { DownloaderResult } from '../types/downloader';
import { log } from '../utils/logger';

const MODERATION_URL = 'https://api.openai.com/v1/moderations';
const MODERATION_TIMEOUT_MS = 4000;
const MAX_TEXT_CHARS = 2000;

/**
 * True when OpenAI's moderation model flags the result's caption or preview image as sexual content.
 * The endpoint takes text and images only, so the video itself is never scanned: a clean thumbnail passes.
 *
 * Fails open. A missing key, timeout or API error returns false so the moderation service
 * can never block a download on its own.
 */
export async function isSexualResult(apiKey: string | undefined, result: DownloaderResult): Promise<boolean> {
	if (!apiKey) return false;

	const text = (result.caption || result.title || '').slice(0, MAX_TEXT_CHARS).trim();
	const imageUrl = result.thumbnail ?? result.media?.find((m) => m.type === 'photo' && !m.buffer)?.url;

	const input: Array<Record<string, unknown>> = [];
	if (text) input.push({ type: 'text', text });
	if (imageUrl && /^https?:\/\//i.test(imageUrl)) input.push({ type: 'image_url', image_url: { url: imageUrl } });
	if (input.length === 0) return false;

	try {
		const res = await fetch(MODERATION_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
			body: JSON.stringify({ model: 'omni-moderation-latest', input }),
			signal: AbortSignal.timeout(MODERATION_TIMEOUT_MS),
		});
		if (!res.ok) {
			log('warn', 'moderation', 'Moderation API rejected request', { status: res.status });
			return false;
		}
		const data = (await res.json()) as { results?: Array<{ categories?: Record<string, boolean> }> };
		const categories = data.results?.[0]?.categories;
		return categories?.sexual === true || categories?.['sexual/minors'] === true;
	} catch (e) {
		log('warn', 'moderation', 'Moderation check failed', { error: (e as Error)?.message });
		return false;
	}
}
