import { describe, it, expect } from 'vitest';
import { parseAioGallery, parseLinksSection } from '../src/services/downloader/aio-parser';

describe('parseAioGallery()', () => {
	it('extracts MediaItems from gallery items with resources[0].src', () => {
		const items = [
			{
				resources: [{ src: 'https://cdn.com/1.jpg' }],
			},
			{
				resources: [{ src: 'https://cdn.com/2.mp4' }],
			},
		];
		const result = parseAioGallery(items);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({ type: 'photo', url: 'https://cdn.com/1.jpg' });
		expect(result[1]).toEqual({ type: 'video', url: 'https://cdn.com/2.mp4' });
	});

	it('extracts MediaItems from gallery items with urls.url fallback', () => {
		const items = [
			{
				urls: { url: 'https://cdn.com/img.png' },
			},
		];
		const result = parseAioGallery(items);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ type: 'photo', url: 'https://cdn.com/img.png' });
	});

	it('filters out items without valid URLs', () => {
		const items = [
			{
				resources: [{ src: 'not-a-url' }],
			},
			{
				urls: { url: null },
			},
		];
		const result = parseAioGallery(items);
		expect(result).toHaveLength(0);
	});
});

describe('parseLinksSection()', () => {
	it('extracts links when input is an array', () => {
		const links = [
			{ url: 'https://cdn.com/v1.mp4', q_text: '720p' },
			{ url: 'https://cdn.com/v2.mp4', resolution: '1080p' },
		];
		const result = parseLinksSection(links, 'video');
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({ type: 'video', url: 'https://cdn.com/v1.mp4', quality: '720p' });
		expect(result[1]).toEqual({ type: 'video', url: 'https://cdn.com/v2.mp4', quality: '1080p' });
	});

	it('extracts links when input is an object (key-value)', () => {
		const links = {
			sd: { url: 'https://cdn.com/sd.mp4', q_text: 'SD' },
			hd: { url: 'https://cdn.com/hd.mp4', q_text: 'HD' },
		};
		const result = parseLinksSection(links, 'video');
		expect(result).toHaveLength(2);
		expect(result).toContainEqual({ type: 'video', url: 'https://cdn.com/sd.mp4', quality: 'SD' });
		expect(result).toContainEqual({ type: 'video', url: 'https://cdn.com/hd.mp4', quality: 'HD' });
	});

	it('returns empty array when input is null or undefined', () => {
		expect(parseLinksSection(null, 'video')).toEqual([]);
		expect(parseLinksSection(undefined, 'video')).toEqual([]);
	});
});
