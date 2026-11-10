import { describe, it, expect, vi } from 'vitest';
import { GrammyError, InputFile } from 'grammy';
import type { Bot } from 'grammy';
import { sniffAudioContainer, sendMediaToChannel } from '../src/services/telegram-bot/handlers/send-media';

// Magic bytes of each container, as they arrive from the extractor CDNs.
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x88]); // EBML header
const OGG = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]); // "OggS"
const MP3_ID3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]); // "ID3"
const MP3_FRAME = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00]); // MPEG frame sync
const M4A = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); // "....ftyp"

describe('sniffAudioContainer()', () => {
	it('detects WebM — the container YouTube "mp3" downloads actually are (itag 249)', () => {
		expect(sniffAudioContainer(WEBM)).toBe('webm');
	});

	it('detects Ogg', () => {
		expect(sniffAudioContainer(OGG)).toBe('ogg');
	});

	it('leaves real MP3 and M4A alone — sendAudio accepts those', () => {
		expect(sniffAudioContainer(MP3_ID3)).toBeNull();
		expect(sniffAudioContainer(MP3_FRAME)).toBeNull();
		expect(sniffAudioContainer(M4A)).toBeNull();
	});

	it('returns null for short or empty buffers', () => {
		expect(sniffAudioContainer(new Uint8Array([0x1a, 0x45]))).toBeNull();
		expect(sniffAudioContainer(new Uint8Array(0))).toBeNull();
	});
});

describe('sendMediaToChannel audio fallback fetch', () => {
	it('fetches refused audio with a Range header and delivers WebM as a document', async () => {
		// Telegram refuses the WebM stream by URL (sendAudio takes only MP3/M4A)…
		const sendAudio = vi.fn(async () => {
			throw new GrammyError(
				'Call to sendAudio failed!',
				{ ok: false, error_code: 400, description: 'Bad Request: wrong file type' },
				'sendAudio',
				{},
			);
		});
		const sendDocument = vi.fn(async () => ({}));
		const bot = { api: { sendAudio, sendDocument, sendMessage: vi.fn() } } as unknown as Bot;

		// …so the bot downloads the bytes itself. The vidsnap proxy that serves
		// YouTube audio stalls on a plain GET but answers a Range request at
		// full speed, so the fallback fetch must ask for a range.
		const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);
		const fetchSpy = vi.fn(async () => new Response(webm, { status: 206, headers: { 'content-type': 'audio/webm' } }));
		vi.stubGlobal('fetch', fetchSpy);

		await sendMediaToChannel(bot, 1, {
			type: 'audio',
			url: 'https://api.vidsnap.app/proxy?u=stream',
			caption: '',
			title: 'Some Track',
		});

		expect(fetchSpy).toHaveBeenCalled();
		const init = fetchSpy.mock.calls[0][1] as RequestInit;
		expect((init.headers as Record<string, string>).Range).toBe('bytes=0-');

		expect(sendDocument).toHaveBeenCalledTimes(1);
		const file = sendDocument.mock.calls[0][1];
		expect(file).toBeInstanceOf(InputFile);
		expect((file as InputFile).filename).toBe('Some Track.webm');
		vi.unstubAllGlobals();
	});
});
