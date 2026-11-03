import { describe, it, expect } from 'vitest';
import { sniffAudioContainer } from '../src/services/telegram-bot/handlers/send-media';

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
