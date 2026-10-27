import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadWithToken } from '../src/services/downloader/github-private';
import { GitHubProvider } from '../src/services/downloader/platforms/github';

afterEach(() => vi.restoreAllMocks());

const okResponse = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });

describe('downloadWithToken()', () => {
	it('fetches a repo zip from codeload with the Bearer token', async () => {
		const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
		const result = await downloadWithToken('https://github.com/me/secret/archive/HEAD.zip', 'tok');
		expect(spy.mock.calls[0][0]).toBe('https://codeload.github.com/me/secret/zip/HEAD');
		expect((spy.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
		expect(result?.media?.[0]).toMatchObject({ type: 'document', filename: 'secret.zip', filesize: 3 });
	});

	it('names a branch zip after the branch and keeps slashes in the ref', async () => {
		const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
		const result = await downloadWithToken('https://github.com/me/secret/archive/refs/heads/feat/x.zip', 'tok');
		expect(spy.mock.calls[0][0]).toBe('https://codeload.github.com/me/secret/zip/refs/heads/feat/x');
		expect(result?.media?.[0].filename).toBe('secret-x.zip');
	});

	it('fetches a raw file with the token scheme', async () => {
		const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
		const result = await downloadWithToken('https://raw.githubusercontent.com/me/secret/main/src/a b.ts', 'tok');
		expect(spy.mock.calls[0][0]).toBe('https://raw.githubusercontent.com/me/secret/main/src/a%20b.ts');
		expect((spy.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('token tok');
		expect(result?.media?.[0].filename).toBe('a b.ts');
	});

	it('reports a missing repo as gone and ignores other URLs', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
		const missing = await downloadWithToken('https://github.com/me/nope/archive/HEAD.zip', 'tok');
		expect(missing).toMatchObject({ status: 'error', failureKind: 'gone' });
		expect(await downloadWithToken('https://example.com/x.zip', 'tok')).toBeNull();
	});
});

describe('GitHubProvider token gating', () => {
	it('never fetches a repo zip without a token', async () => {
		const spy = vi.spyOn(globalThis, 'fetch');
		const result = await new GitHubProvider().download('https://github.com/me/secret/archive/HEAD.zip', 'auto');
		expect(result.status).toBe('error');
		expect(spy).not.toHaveBeenCalled();
	});
});
