import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadWithToken, resolveGithubToken, parseOwners, type GithubAuth } from '../src/services/downloader/github-private';
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

const auth = (isAdmin: boolean, owners = 'EngDawood'): GithubAuth => ({ token: 'tok', isAdmin, protectedOwners: parseOwners(owners) });

describe('resolveGithubToken()', () => {
	it('gives guests the token for other owners but not for a protected owner (any case)', () => {
		expect(resolveGithubToken(auth(false), 'someone')).toBe('tok');
		expect(resolveGithubToken(auth(false), 'EngDawood')).toBeUndefined();
		expect(resolveGithubToken(auth(false), 'engdawood')).toBeUndefined();
	});

	it('gives the admin the token for every owner, protected ones included', () => {
		expect(resolveGithubToken(auth(true), 'EngDawood')).toBe('tok');
		expect(resolveGithubToken(auth(true), 'someone')).toBe('tok');
	});

	it('keeps the token admin-only when no protected owner is configured, or no token exists', () => {
		expect(resolveGithubToken(auth(false, ''), 'someone')).toBeUndefined();
		expect(resolveGithubToken(auth(true, ''), 'someone')).toBe('tok');
		expect(resolveGithubToken({ isAdmin: true, protectedOwners: [] }, 'x')).toBeUndefined();
		expect(resolveGithubToken(undefined, 'x')).toBeUndefined();
	});
});

describe('GitHubProvider token policy', () => {
	const ZIP = 'archive/HEAD.zip';

	it('never fetches a repo zip anonymously', async () => {
		const spy = vi.spyOn(globalThis, 'fetch');
		const result = await new GitHubProvider().download(`https://github.com/me/secret/${ZIP}`, 'auto');
		expect(result.status).toBe('error');
		expect(spy).not.toHaveBeenCalled();
	});

	it('does not send the token to a guest asking for a protected owner repo', async () => {
		const spy = vi.spyOn(globalThis, 'fetch');
		const result = await new GitHubProvider(auth(false)).download(`https://github.com/EngDawood/private/${ZIP}`, 'auto');
		expect(result.status).toBe('error');
		expect(spy).not.toHaveBeenCalled();
	});

	it('sends the token for a guest asking for another owner, and for the admin on a protected repo', async () => {
		const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => okResponse());
		await new GitHubProvider(auth(false)).download(`https://github.com/someone/repo/${ZIP}`, 'auto');
		await new GitHubProvider(auth(true)).download(`https://github.com/EngDawood/private/${ZIP}`, 'auto');
		expect(spy.mock.calls.map((c) => (c[1]?.headers as Record<string, string>).Authorization)).toEqual(['Bearer tok', 'Bearer tok']);
	});
});
