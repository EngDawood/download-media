import { describe, it, expect, vi } from 'vitest';
import { GrammyError, InputFile } from 'grammy';
import type { Bot } from 'grammy';
import { sendMediaToChannel, MAX_UPLOAD_SIZE } from '../src/services/telegram-bot/handlers/send-media';

function stubBot() {
	const sendVideo = vi.fn(async () => ({}));
	return { bot: { api: { sendVideo, sendMessage: vi.fn() } } as unknown as Bot, sendVideo };
}

describe('sendMediaToChannel video', () => {
	it('refuses a video whose known size is over the upload ceiling without fetching it', async () => {
		const { bot, sendVideo } = stubBot();
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		await expect(
			sendMediaToChannel(bot, 1, { type: 'video', url: 'https://cdn.example/v.mp4', caption: '', filesize: 348 * 1024 * 1024 }),
		).rejects.toThrow(/File too large \(348\.0MB\)/);
		expect(sendVideo).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('fetches a refused cobalt tunnel with a plain GET — tunnels reject Range requests', async () => {
		// Telegram refuses tokenized tunnel URLs by URL, so the bot falls back
		// to fetching the bytes itself. Cobalt tunnels answer a Range request
		// with an error body instead of media (rue verified live), so the
		// fallback fetch must NOT send the Range header that the vidsnap proxy
		// needs — sending it is what broke every cobalt YouTube video in the
		// bot while the API (which never fetches bytes) kept working.
		const sendVideo = vi.fn(async (_chatId: number, file: unknown) => {
			if (typeof file === 'string') {
				throw new GrammyError(
					'Call to sendVideo failed!',
					{ ok: false, error_code: 400, description: 'Bad Request: wrong file type' },
					'sendVideo',
					{},
				);
			}
			return {};
		});
		const bot = { api: { sendVideo, sendMessage: vi.fn() } } as unknown as Bot;
		const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]);
		const fetchSpy = vi.fn(async () => new Response(mp4, { status: 200, headers: { 'content-type': 'video/mp4' } }));
		vi.stubGlobal('fetch', fetchSpy);

		await sendMediaToChannel(bot, 1, {
			type: 'video',
			url: 'https://rue-cobalt.xenon.zone/tunnel?id=abc&exp=1&sig=x',
			caption: '',
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const init = fetchSpy.mock.calls[0][1] as RequestInit;
		expect((init.headers as Record<string, string>).Range).toBeUndefined();
		expect(sendVideo).toHaveBeenCalledTimes(2);
		expect(sendVideo.mock.calls[1][1]).toBeInstanceOf(InputFile);
		vi.unstubAllGlobals();
	});

	it('rescues a Range-demanding host by flipping the header shape after a refusal', async () => {
		const sendVideo = vi.fn(async (_chatId: number, file: unknown) => {
			if (typeof file === 'string') {
				throw new GrammyError(
					'Call to sendVideo failed!',
					{ ok: false, error_code: 400, description: 'Bad Request: wrong file type' },
					'sendVideo',
					{},
				);
			}
			return {};
		});
		const bot = { api: { sendVideo, sendMessage: vi.fn() } } as unknown as Bot;
		const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 5, 6, 7, 8]);
		const fetchSpy = vi.fn(async (_input: string, init?: RequestInit) => {
			const range = (init?.headers as Record<string, string>)?.Range;
			return range
				? new Response(mp4, { status: 206, headers: { 'content-type': 'video/mp4' } })
				: new Response('range required', { status: 400 });
		});
		vi.stubGlobal('fetch', fetchSpy);

		await sendMediaToChannel(bot, 1, { type: 'video', url: 'https://cdn.example/needs-range.mp4', caption: '' });

		expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
		const lastInit = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][1] as RequestInit;
		expect((lastInit.headers as Record<string, string>).Range).toBe('bytes=0-');
		expect(sendVideo.mock.calls[1][1]).toBeInstanceOf(InputFile);
		vi.unstubAllGlobals();
	});

	it('aborts an oversize chunked body at the cap instead of draining it', async () => {
		// Cobalt tunnels stream chunked with no content-length, so the size
		// guards that read headers never fire: a full movie would be pulled
		// until the fetch times out or the Worker runs out of memory, and the
		// user gets the generic error instead of the too-large screen. The
		// body read must stop at the upload ceiling and throw 'File too large'.
		const sendVideo = vi.fn(async (_chatId: number, file: unknown) => {
			if (typeof file === 'string') {
				throw new GrammyError(
					'Call to sendVideo failed!',
					{ ok: false, error_code: 400, description: 'Bad Request: wrong file type' },
					'sendVideo',
					{},
				);
			}
			return {};
		});
		const bot = { api: { sendVideo, sendMessage: vi.fn() } } as unknown as Bot;
		const CHUNKS = 60; // 60 × 1MB = 60MB total, cap is 50MB
		let pulls = 0;
		let cancelled = false;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls++;
				if (pulls > CHUNKS) {
					controller.close();
					return;
				}
				controller.enqueue(new Uint8Array(1024 * 1024));
			},
			cancel() {
				cancelled = true;
			},
		});
		vi.stubGlobal('fetch', async () => new Response(stream, { status: 200, headers: { 'content-type': 'video/mp4' } }));

		await expect(
			sendMediaToChannel(bot, 1, { type: 'video', url: 'https://rue-cobalt.xenon.zone/tunnel?id=movie', caption: '' }),
		).rejects.toThrow(/File too large \(5[01]\.\dMB\)/);
		expect(pulls).toBeLessThan(CHUNKS);
		expect(cancelled).toBe(true);
		vi.unstubAllGlobals();
	});

	it('refuses a 200 with an empty body instead of uploading 0 bytes to Telegram', async () => {
		// The rue-cobalt tunnels for two YouTube videos answered 200 with no
		// bytes at all (November 13, 2026): the bot uploaded the empty file
		// and Telegram rejected it with a generic error. An empty download is
		// a failed download — say so instead of sending nothing.
		const sendVideo = vi.fn(async (_chatId: number, file: unknown) => {
			if (typeof file === 'string') {
				throw new GrammyError(
					'Call to sendVideo failed!',
					{ ok: false, error_code: 400, description: 'Bad Request: wrong file type' },
					'sendVideo',
					{},
				);
			}
			return {};
		});
		const bot = { api: { sendVideo, sendMessage: vi.fn() } } as unknown as Bot;
		const fetchSpy = vi.fn(async () => new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'video/mp4' } }));
		vi.stubGlobal('fetch', fetchSpy);

		await expect(
			sendMediaToChannel(bot, 1, { type: 'video', url: 'https://rue-cobalt.xenon.zone/tunnel?id=empty', caption: '' }),
		).rejects.toThrow(/empty \(0 bytes\)/);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(sendVideo).toHaveBeenCalledTimes(1);
		vi.unstubAllGlobals();
	});

	it('delivers a small chunked body whole', async () => {
		const sendVideo = vi.fn(async (_chatId: number, file: unknown) => {
			if (typeof file === 'string') {
				throw new GrammyError(
					'Call to sendVideo failed!',
					{ ok: false, error_code: 400, description: 'Bad Request: wrong file type' },
					'sendVideo',
					{},
				);
			}
			return {};
		});
		const bot = { api: { sendVideo, sendMessage: vi.fn() } } as unknown as Bot;
		let pulls = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls++;
				if (pulls > 3) {
					controller.close();
					return;
				}
				controller.enqueue(new Uint8Array([pulls, pulls, pulls]));
			},
		});
		vi.stubGlobal('fetch', async () => new Response(stream, { status: 200, headers: { 'content-type': 'video/mp4' } }));

		await sendMediaToChannel(bot, 1, { type: 'video', url: 'https://cdn.example/small.mp4', caption: '' });

		expect(sendVideo).toHaveBeenCalledTimes(2);
		expect(sendVideo.mock.calls[1][1]).toBeInstanceOf(InputFile);
		vi.unstubAllGlobals();
	});

	it('uploads provided bytes instead of the URL', async () => {
		const { bot, sendVideo } = stubBot();
		await sendMediaToChannel(bot, 1, {
			type: 'video',
			url: 'https://cdn.example/v.mp4',
			caption: 'c',
			buffer: new Uint8Array([1, 2, 3]),
			filename: 'tiktok.mp4',
			filesize: MAX_UPLOAD_SIZE + 1, // ignored: the bytes are already in hand
		});
		expect(sendVideo).toHaveBeenCalledTimes(1);
		const file = (sendVideo.mock.calls[0] as unknown[])[1];
		expect(typeof file).not.toBe('string');
	});
});
