import { describe, it, expect } from 'vitest';
import app from '../src/index';

const KEY = 'test-api-key';

/** Minimal env — the /mcp route only reads PUBLIC_API_KEY. */
const env = { PUBLIC_API_KEY: KEY } as unknown as Env;
const envNoKey = {} as unknown as Env;

function rpc(body: unknown, init: { key?: string | null; bearer?: string; env?: Env } = {}) {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (init.bearer) headers['Authorization'] = `Bearer ${init.bearer}`;
	else if (init.key !== null) headers['X-API-Key'] = init.key ?? KEY;

	return app.fetch(
		new Request('https://worker/mcp', { method: 'POST', headers, body: JSON.stringify(body) }),
		init.env ?? env,
	);
}

async function call(name: string, args: Record<string, unknown> = {}) {
	const res = await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } });
	const body = (await res.json()) as any;
	return body.result;
}

describe('MCP endpoint', () => {
	describe('auth', () => {
		it('fails closed with 503 when PUBLIC_API_KEY is unset', async () => {
			const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { env: envNoKey });
			expect(res.status).toBe(503);
		});

		it('rejects a missing or wrong key with 401', async () => {
			expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { key: null })).status).toBe(401);
			expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { key: 'nope' })).status).toBe(401);
		});

		it('accepts the key as an Authorization bearer token', async () => {
			const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { bearer: KEY });
			expect(res.status).toBe(200);
		});

		// claude.ai custom connectors cannot reliably send headers, so the key may
		// arrive as the last path segment instead.
		it('accepts the key as a path segment', async () => {
			const res = await app.fetch(
				new Request(`https://worker/mcp/${KEY}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
				}),
				env,
			);
			expect(res.status).toBe(200);
		});

		it('rejects a wrong path token with 401', async () => {
			const res = await app.fetch(
				new Request('https://worker/mcp/not-the-key', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
				}),
				env,
			);
			expect(res.status).toBe(401);
		});

		it('still fails closed on the path form when no key is configured', async () => {
			const res = await app.fetch(
				new Request('https://worker/mcp/anything', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
				}),
				envNoKey,
			);
			expect(res.status).toBe(503);
		});
	});

	describe('transport', () => {
		it('returns 405 on GET and DELETE (stateless: no SSE stream, no session)', async () => {
			for (const path of ['/mcp', `/mcp/${KEY}`]) {
				for (const method of ['GET', 'DELETE']) {
					const res = await app.fetch(
						new Request(`https://worker${path}`, { method, headers: { 'X-API-Key': KEY } }),
						env,
					);
					expect(res.status).toBe(405);
				}
			}
		});

		it('answers CORS preflight', async () => {
			const res = await app.fetch(new Request('https://worker/mcp', { method: 'OPTIONS' }), env);
			expect(res.status).toBe(204);
			expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-API-Key');
		});

		it('rejects malformed JSON with a parse error', async () => {
			const res = await app.fetch(
				new Request('https://worker/mcp', { method: 'POST', headers: { 'X-API-Key': KEY }, body: '{oops' }),
				env,
			);
			expect(res.status).toBe(400);
			expect(((await res.json()) as any).error.code).toBe(-32700);
		});

		it('rejects JSON-RPC batches (removed from MCP in 2025-06-18)', async () => {
			const res = await rpc([{ jsonrpc: '2.0', id: 1, method: 'ping' }]);
			expect(res.status).toBe(400);
			expect(((await res.json()) as any).error.code).toBe(-32600);
		});
	});

	describe('lifecycle', () => {
		it('echoes a protocol version it supports', async () => {
			const res = await rpc({
				jsonrpc: '2.0', id: 1, method: 'initialize',
				params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } },
			});
			const body = (await res.json()) as any;
			expect(body.result.protocolVersion).toBe('2025-11-25');
			expect(body.result.capabilities.tools).toBeDefined();
			expect(body.result.serverInfo.name).toBe('download-media');
		});

		it('falls back to a known version when the client asks for one we do not speak', async () => {
			const res = await rpc({
				jsonrpc: '2.0', id: 1, method: 'initialize',
				params: { protocolVersion: '1999-01-01', capabilities: {} },
			});
			expect(((await res.json()) as any).result.protocolVersion).toBe('2025-06-18');
		});

		it('acknowledges notifications with 202 and an empty body', async () => {
			const res = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
			expect(res.status).toBe(202);
			expect(await res.text()).toBe('');
		});

		it('returns method-not-found for unknown methods', async () => {
			const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'does/not/exist' });
			expect(((await res.json()) as any).error.code).toBe(-32601);
		});
	});

	describe('tools/list', () => {
		it('advertises the three tools with valid JSON Schema', async () => {
			const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
			const { tools } = ((await res.json()) as any).result;

			expect(tools.map((t: any) => t.name).sort()).toEqual([
				'download_media', 'get_media_info', 'list_supported_platforms',
			]);
			for (const tool of tools) {
				expect(tool.inputSchema.type).toBe('object');
				expect(tool.description.length).toBeGreaterThan(0);
			}

			const download = tools.find((t: any) => t.name === 'download_media');
			expect(download.inputSchema.required).toEqual(['url']);
			expect(download.inputSchema.properties.mode.enum).toEqual(['auto', 'audio', 'hd', 'sd']);
		});
	});

	describe('tools/call', () => {
		it('lists supported platforms without touching the network', async () => {
			const result = await call('list_supported_platforms');
			expect(result.isError).toBeUndefined();
			expect(result.structuredContent.platforms).toContain('TikTok');
			expect(result.structuredContent.platforms).toContain('YouTube');
		});

		it('reports an unknown tool as a protocol error', async () => {
			const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } });
			expect(((await res.json()) as any).error.code).toBe(-32602);
		});

		it('flags a missing url as a tool error, not a crash', async () => {
			const result = await call('download_media', {});
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toMatch(/url/i);
		});

		it('flags input with no detectable URL as a tool error', async () => {
			const result = await call('download_media', { url: 'not a url at all' });
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toMatch(/No supported URL found/);
		});

		it('reports no preview for platforms without a picker', async () => {
			const result = await call('get_media_info', { url: 'https://open.spotify.com/track/abc123' });
			expect(result.isError).toBeUndefined();
			expect(result.structuredContent.platform).toBe('Spotify');
			expect(result.structuredContent.preview).toBeNull();
		});
	});
});
