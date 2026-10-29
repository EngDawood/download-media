import { describe, it, expect, vi } from 'vitest';
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
