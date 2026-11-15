import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadMedia } from '../src/services/media-downloader';

// Regression: the bot's MP3 button re-feeds the extracted audio link (a
// vidsnap proxy URL wrapping a googlevideo stream) into downloadMedia, and
// the extractor answers "Unsupported platform or no media found" — seen live
// 2026-11-15 on dvfJHMLR54Y + scJuro118jA (صالح المطري). A URL that is
// already a media file must be returned as media, never re-extracted.

const proxy = (inner: string) => `https://api.vidsnap.app/proxy?u=${encodeURIComponent(inner)}`;
const gv = (qs: string) => `https://rr5---sn-2obg0c-qq.googlevideo.com/videoplayback?${qs}`;

const AUDIO_139 = proxy(gv('expire=1794794818&itag=139&mime=audio%2Fmp4&clen=1369777&dur=224.397'));
const AUDIO_249 = proxy(gv('expire=1&itag=249&mime=audio%2Fwebm&clen=1231355'));
const VIDEO_22 = proxy(gv('expire=1&itag=22&mime=video%2Fmp4&clen=9000000'));
const BARE_18 = gv('expire=1&itag=18&mime=video%2Fmp4&clen=5000000');
const BARE_140 = gv('expire=1&itag=140&mime=audio%2Fmp4&clen=3000000');
const LIVE = proxy(gv('expire=1&itag=140&mime=audio%2Fmp4&live=1&sq=5'));
const WATCH = 'https://www.youtube.com/watch?v=dvfJHMLR54Y';

describe('downloadMedia with a direct media URL', () => {
	let fetchCalls = 0;
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	beforeEach(() => {
		fetchCalls = 0;
		vi.stubGlobal('fetch', async () => {
			fetchCalls++;
			throw new Error('network must not be touched for a direct media URL');
		});
	});

	it('returns the vidsnap audio (itag 139) as audio without fetching', async () => {
		const result = await downloadMedia(AUDIO_139, 'audio');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({ type: 'audio', url: AUDIO_139, filename: 'audio.m4a' });
		expect(fetchCalls).toBe(0);
	});

	it('returns the vidsnap audio (itag 249) as WebM audio without fetching', async () => {
		const result = await downloadMedia(AUDIO_249, 'audio');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({ type: 'audio', url: AUDIO_249, filename: 'audio.webm' });
		expect(fetchCalls).toBe(0);
	});

	it('returns the vidsnap video (itag 22) as video without fetching', async () => {
		const result = await downloadMedia(VIDEO_22, 'auto');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({ type: 'video', url: VIDEO_22, filename: 'video.mp4' });
		expect(fetchCalls).toBe(0);
	});

	it('returns a bare googlevideo video (itag 18) as video without fetching', async () => {
		const result = await downloadMedia(BARE_18, 'auto');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({ type: 'video', url: BARE_18, filename: 'video.mp4' });
		expect(fetchCalls).toBe(0);
	});

	it('returns a bare googlevideo audio (itag 140) as audio without fetching', async () => {
		const result = await downloadMedia(BARE_140, 'audio');
		expect(result.status).toBe('success');
		expect(result.media?.[0]).toEqual({ type: 'audio', url: BARE_140, filename: 'audio.m4a' });
		expect(fetchCalls).toBe(0);
	});

	it('does NOT treat a live stream link as direct media', async () => {
		// A live googlevideo URL is a single few-second chunk, not a file —
		// PR #59's bug in a new coat. It must go through the normal flow.
		const result = await downloadMedia(LIVE, 'audio');
		expect(result.status).toBe('error');
		expect(fetchCalls).toBeGreaterThan(0);
	});

	it('does NOT treat an ordinary YouTube watch URL as direct media', async () => {
		const result = await downloadMedia(WATCH, 'auto');
		expect(result.status).toBe('error');
		expect(fetchCalls).toBeGreaterThan(0);
	});
});
