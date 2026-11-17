import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Bot } from 'grammy';
import { downloadAndSendMedia } from '../src/services/telegram-bot/handlers/download-and-send';
import { downloadMedia } from '../src/services/media-downloader';

vi.mock('../src/services/media-downloader', () => ({
	downloadMedia: vi.fn(),
	formatFileSize: (n?: number) => (n === undefined ? undefined : `${n}B`),
}));

const mockedDownloadMedia = vi.mocked(downloadMedia);

// Fake D1: records every bound statement; run/first/all are no-ops.
function fakeDb() {
	const writes: Array<{ sql: string; args: unknown[] }> = [];
	const db = {
		prepare(sql: string) {
			return {
				bind(...args: unknown[]) {
					writes.push({ sql, args });
					return {
						run: async () => ({ meta: { changes: 1 } }),
						first: async () => null,
						all: async () => ({ results: [] }),
					};
				},
			};
		},
		batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
			for (const s of stmts) await s.run();
			return [];
		},
	};
	return { db: db as unknown as D1Database, writes };
}

function stubBot() {
	const sendMessage = vi.fn(async () => ({ message_id: 10 }));
	const editMessageText = vi.fn(async () => ({}));
	const sendAudio = vi.fn(async () => ({}));
	const sendVideo = vi.fn(async () => ({}));
	const bot = { api: { sendMessage, editMessageText, sendAudio, sendVideo } } as unknown as Bot;
	return { bot, sendMessage, editMessageText, sendAudio, sendVideo };
}

function firstButton(editMessageText: ReturnType<typeof vi.fn>) {
	const opts = editMessageText.mock.calls[0][3] as {
		reply_markup?: { inline_keyboard: Array<Array<{ callback_data?: string; text?: string }>> };
	};
	return opts.reply_markup?.inline_keyboard[0][0];
}

const YT_URL = 'https://www.youtube.com/watch?v=x';

describe('video offer after audio', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('offers Download Video after an audio download (YouTube, mode audio)', async () => {
		mockedDownloadMedia.mockResolvedValue({
			status: 'success',
			media: [{ type: 'audio', buffer: new Uint8Array([0xff, 0xfb, 0x90, 0x00]), filename: 'test.mp3' }],
			caption: '',
			title: 'Test track',
		});
		const { db, writes } = fakeDb();
		const { bot, editMessageText, sendAudio } = stubBot();
		await downloadAndSendMedia(bot, 1, YT_URL, 'YouTube', 'audio', undefined, undefined, {
			db,
			adminId: 111,
			userId: 111,
			firstName: 'Dawood',
			locale: 'en',
		});
		expect(sendAudio).toHaveBeenCalledTimes(1);
		expect(editMessageText).toHaveBeenCalled();
		expect(firstButton(editMessageText)?.callback_data).toBe('dl:video');
		expect(firstButton(editMessageText)?.text).toBe('🎬 Download Video');
		const stored = writes.find((w) => w.sql.includes('INSERT INTO session_store'));
		expect(stored?.args[2]).toContain(YT_URL);
	});

	it('offers Download Video after an audio download (TikTok, mode audio)', async () => {
		mockedDownloadMedia.mockResolvedValue({
			status: 'success',
			media: [{ type: 'audio', buffer: new Uint8Array([0xff, 0xfb, 0x90, 0x00]), filename: 'test.mp3' }],
			caption: '',
			title: 'Test track',
		});
		const { db } = fakeDb();
		const { bot, editMessageText, sendAudio } = stubBot();
		await downloadAndSendMedia(bot, 1, 'https://www.tiktok.com/@u/video/1', 'TikTok', 'audio', undefined, undefined, {
			db,
			adminId: 111,
			userId: 111,
			firstName: 'Dawood',
			locale: 'en',
		});
		expect(sendAudio).toHaveBeenCalledTimes(1);
		expect(firstButton(editMessageText)?.callback_data).toBe('dl:video');
	});

	it('still offers Extract Audio after a video download (regression)', async () => {
		mockedDownloadMedia.mockResolvedValue({
			status: 'success',
			media: [{ type: 'video', url: 'https://cdn.example/v.mp4' }],
			caption: '',
			title: 'Test video',
			mp3Url: 'https://cdn.example/a.mp3',
		});
		const { db } = fakeDb();
		const { bot, editMessageText, sendVideo } = stubBot();
		await downloadAndSendMedia(bot, 1, YT_URL, 'YouTube', 'auto', undefined, undefined, {
			db,
			adminId: 111,
			userId: 111,
			firstName: 'Dawood',
			locale: 'en',
		});
		expect(sendVideo).toHaveBeenCalledTimes(1);
		expect(firstButton(editMessageText)?.callback_data).toBe('dl:yt:mp3');
	});
});
