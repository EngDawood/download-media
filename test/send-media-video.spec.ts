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
