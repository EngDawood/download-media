import { describe, it, expect } from 'vitest';
import {
	parseDriveUrl,
	parseConfirmForm,
	parseContentDisposition,
	accessMessage,
	pdfAlternative,
} from '../src/services/downloader/platforms/google-drive';

// Captured verbatim from drive.usercontent.google.com for a large public file.
// The confirm/uuid pair in this form is what authorises the actual download, so the
// parser has to survive Google's exact markup — unquoted attributes and all.
const INTERSTITIAL = `<!DOCTYPE html><html><head><title>Google Drive - Virus scan warning</title></head><body>
<form id="download-form" action="https://drive.usercontent.google.com/download" method="get">
<input type="submit" id="uc-download-link" class="goog-inline-block jfk-button jfk-button-action" value="Download anyway"/>
<input type="hidden" name="id" value="0B7EVK8r0v71pZjFTYXZWM3FlRnM">
<input type="hidden" name="export" value="download">
<input type="hidden" name="confirm" value="t">
<input type="hidden" name="uuid" value="eaa22718-2b69-4f96-8e83-1940e1c1db15">
</form></body></html>`;

describe('parseDriveUrl()', () => {
	it('parses the canonical share link', () => {
		expect(parseDriveUrl('https://drive.google.com/file/d/1AbC_def-123456789/view?usp=sharing')).toEqual({
			kind: 'file',
			id: '1AbC_def-123456789',
		});
	});

	it('parses legacy and already-direct id forms', () => {
		const id = '1AbC_def-123456789';
		expect(parseDriveUrl(`https://drive.google.com/open?id=${id}`)).toEqual({ kind: 'file', id });
		expect(parseDriveUrl(`https://drive.google.com/uc?export=download&id=${id}`)).toEqual({ kind: 'file', id });
		expect(parseDriveUrl(`https://drive.usercontent.google.com/download?id=${id}&export=download`)).toEqual({ kind: 'file', id });
	});

	it('parses Workspace editor URLs as exports', () => {
		const id = '1AbC_def-123456789';
		expect(parseDriveUrl(`https://docs.google.com/document/d/${id}/edit`)).toEqual({ kind: 'workspace', id, editor: 'document' });
		expect(parseDriveUrl(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toEqual({
			kind: 'workspace',
			id,
			editor: 'spreadsheets',
		});
		expect(parseDriveUrl(`https://docs.google.com/presentation/d/${id}/edit`)).toEqual({ kind: 'workspace', id, editor: 'presentation' });
	});

	it('treats a docs.google.com file link as an ordinary Drive file, not an export', () => {
		expect(parseDriveUrl('https://docs.google.com/file/d/1AbC_def-123456789/view')).toEqual({
			kind: 'file',
			id: '1AbC_def-123456789',
		});
	});

	it('flags folders so the provider can explain itself', () => {
		expect(parseDriveUrl('https://drive.google.com/drive/folders/1AbC_def-123456789')).toEqual({
			kind: 'folder',
			id: '1AbC_def-123456789',
		});
		expect(parseDriveUrl('https://drive.google.com/drive/u/0/folders/1AbC_def-123456789')).toEqual({
			kind: 'folder',
			id: '1AbC_def-123456789',
		});
	});

	it('rejects links that carry no file id', () => {
		// /d/e/{id}/pub addresses a published snapshot — exporting `e` would fetch the wrong doc.
		expect(parseDriveUrl('https://docs.google.com/document/d/e/2PACX-1vabc/pub')).toBeNull();
		expect(parseDriveUrl('https://drive.google.com/')).toBeNull();
		expect(parseDriveUrl('https://drive.google.com/drive/my-drive')).toBeNull();
		expect(parseDriveUrl('not a url')).toBeNull();
	});
});

describe('parseConfirmForm()', () => {
	it('rebuilds the virus-scan form as a GET url', () => {
		const url = parseConfirmForm(INTERSTITIAL);
		expect(url).not.toBeNull();
		const parsed = new URL(url!);
		expect(parsed.origin + parsed.pathname).toBe('https://drive.usercontent.google.com/download');
		expect(parsed.searchParams.get('id')).toBe('0B7EVK8r0v71pZjFTYXZWM3FlRnM');
		expect(parsed.searchParams.get('confirm')).toBe('t');
		expect(parsed.searchParams.get('uuid')).toBe('eaa22718-2b69-4f96-8e83-1940e1c1db15');
	});

	it('ignores inputs with no name, so the submit button never becomes a param', () => {
		const url = new URL(parseConfirmForm(INTERSTITIAL)!);
		expect(url.searchParams.has('')).toBe(false);
		expect([...url.searchParams.keys()].sort()).toEqual(['confirm', 'export', 'id', 'uuid']);
	});

	it('returns null for pages that are not the interstitial', () => {
		expect(parseConfirmForm('<html><title>Error 404 (Not Found)!!1</title></html>')).toBeNull();
		expect(parseConfirmForm('<form id="other"><input name="id" value="x"></form>')).toBeNull();
	});
});

describe('pdfAlternative()', () => {
	const alt = (url: string, filename?: string) => pdfAlternative(parseDriveUrl(url)!, filename);
	const ID = '1AbC_def-123456789';

	it('offers a PDF for Docs and Slides, named after the file', () => {
		expect(alt(`https://docs.google.com/document/d/${ID}/edit`, 'CV.docx')).toEqual({
			label: 'pdf',
			url: `https://docs.google.com/document/d/${ID}/export?format=pdf`,
			filename: 'CV.pdf',
		});
		expect(alt(`https://docs.google.com/presentation/d/${ID}/edit`, 'Deck.pptx')!.filename).toBe('Deck.pdf');
	});

	it('offers nothing where no PDF renderer applies', () => {
		// Sheets slices wide tables across pages; an uploaded file has no renderer at all.
		expect(alt(`https://docs.google.com/spreadsheets/d/${ID}/edit`, 'Data.xlsx')).toBeUndefined();
		expect(alt(`https://docs.google.com/drawings/d/${ID}/edit`, 'Sketch.png')).toBeUndefined();
		expect(alt(`https://drive.google.com/file/d/${ID}/view`, 'report.pdf')).toBeUndefined();
	});

	it('still names the file when the export sent no filename', () => {
		expect(alt(`https://docs.google.com/document/d/${ID}/edit`, undefined)!.filename).toBe(`document-${ID}.pdf`);
	});
});

describe('accessMessage()', () => {
	// Wordings captured live from drive.usercontent.google.com. Each refusal needs a
	// different fix from the user, so they must not collapse into one generic message.
	it('names a download-disabled file', () => {
		const html = `<title>Google Drive - Can&#39;t download file</title>Sorry, the owner hasn&#39;t given you permission to download this file. Only the owner and editors can download this file.`;
		expect(accessMessage('https://drive.usercontent.google.com/download?id=x', html)).toContain('owner disabled downloads');
	});

	it('names an exceeded quota', () => {
		const html = '<title>Google Drive - Quota exceeded</title>Sorry, you can&#39;t view or download this file at this time.';
		expect(accessMessage('https://drive.usercontent.google.com/download?id=x', html)).toContain('quota exceeded');
	});

	it('names a private file when Drive bounces us to sign-in', () => {
		expect(accessMessage('https://accounts.google.com/v3/signin/identifier', '<html>sign in</html>')).toContain('private');
		expect(accessMessage('https://drive.usercontent.google.com/download', '<a href="/ServiceLogin">x</a>')).toContain('private');
	});

	it('falls back to a generic refusal for an unrecognised page', () => {
		expect(accessMessage('https://drive.usercontent.google.com/download', '<html>something new</html>')).toContain(
			'did not return the file',
		);
	});
});

describe('parseContentDisposition()', () => {
	it('reads a quoted filename', () => {
		expect(parseContentDisposition('attachment; filename="holiday clip.mp4"')).toBe('holiday clip.mp4');
	});

	it('prefers and decodes the RFC 5987 form', () => {
		expect(parseContentDisposition(`attachment; filename="report.pdf"; filename*=UTF-8''%D8%AA%D9%82%D8%B1%D9%8A%D8%B1.pdf`)).toBe(
			'تقرير.pdf',
		);
	});

	it('reads an unquoted filename', () => {
		expect(parseContentDisposition('attachment; filename=song.mp3')).toBe('song.mp3');
	});

	it('returns null when there is nothing to read', () => {
		expect(parseContentDisposition(null)).toBeNull();
		expect(parseContentDisposition('attachment')).toBeNull();
	});
});
