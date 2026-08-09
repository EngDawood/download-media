import { Context } from 'hono';
import { downloadMedia, fetchFacebookInfo, fetchTikTokInfo } from '../services/media-downloader';
import type { DownloaderMode, DownloaderResult, MediaItem } from '../types/downloader';
import { detectMediaUrl, isBlockedDomain } from '../utils/url-detector';

/**
 * MCP (Model Context Protocol) server — exposes the downloader to AI agents.
 *
 *   POST /mcp        Streamable HTTP transport, stateless (no sessions, no SSE stream)
 *   GET/DELETE /mcp  405, per the 2026-07-28 transport revision
 *   Header: X-API-Key: <PUBLIC_API_KEY>   (or Authorization: Bearer <PUBLIC_API_KEY>)
 *
 * Every tool call is a pure function of the incoming URL, so there is no session state
 * to keep — the endpoint is deliberately stateless and needs no Durable Object.
 * Shares auth, content policy and the download pipeline with POST /api/download.
 */

const SERVER_INFO = { name: 'download-media', version: '1.0.0' };

/** Protocol versions we can speak. We echo the client's if we know it, else fall back. */
const SUPPORTED_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

const VALID_MODES: DownloaderMode[] = ['auto', 'audio', 'hd', 'sd'];

const SUPPORTED_PLATFORMS = [
	'TikTok',
	'Instagram',
	'Twitter',
	'YouTube',
	'Facebook',
	'Threads',
	'SoundCloud',
	'Spotify',
	'Pinterest',
	'GitHub',
];

const INSTRUCTIONS =
	'Downloads media (video, photo, audio) from social platforms. Call download_media with a post URL ' +
	'to get direct, downloadable file links — the tool returns links, not file bytes, so fetch the ' +
	'returned URLs yourself. Links are often signed and short-lived: download promptly rather than storing them.';

const TOOLS = [
	{
		name: 'download_media',
		title: 'Download media',
		description:
			'Resolve a social media post URL into direct, downloadable media links (video, photo and/or audio). ' +
			'Returns every item in the post — galleries and albums yield multiple items, so iterate the whole list. ' +
			'Returns links only; fetch them yourself to get the bytes.',
		inputSchema: {
			type: 'object' as const,
			properties: {
				url: {
					type: 'string',
					description: 'URL of the post. A bare host ("tiktok.com/@u/video/1") is accepted and normalized.',
				},
				mode: {
					type: 'string',
					enum: VALID_MODES,
					description:
						'auto = best video/photo (default); audio = audio-only extraction (YouTube, TikTok, SoundCloud, Spotify); ' +
						'hd / sd = quality hint for platforms exposing both (e.g. Facebook).',
				},
			},
			required: ['url'],
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
	},
	{
		name: 'get_media_info',
		title: 'Get media info',
		description:
			'Preview a post before downloading it: caption and available quality options. ' +
			'Only TikTok and Facebook expose a real preview; for any other platform this reports that ' +
			'no preview exists and you should call download_media directly.',
		inputSchema: {
			type: 'object' as const,
			properties: {
				url: { type: 'string', description: 'URL of the post to inspect.' },
			},
			required: ['url'],
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
	},
	{
		name: 'list_supported_platforms',
		title: 'List supported platforms',
		description:
			'List the platforms with dedicated extractors. Any other URL is still attempted through a ' +
			'generic fallback, which may or may not return media.',
		inputSchema: { type: 'object' as const, properties: {} },
		annotations: { readOnlyHint: true },
	},
];

// ─── JSON-RPC plumbing ───────────────────────────────────────────────────────

type JsonRpcId = string | number | null;

/** Shape we can rely on before validating; fields stay `unknown` until checked. */
interface JsonRpcMessage {
	id?: JsonRpcId;
	method?: unknown;
	params?: {
		protocolVersion?: unknown;
		name?: unknown;
		arguments?: unknown;
	};
}

function rpcResult(id: JsonRpcId, result: unknown) {
	return { jsonrpc: '2.0', id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string) {
	return { jsonrpc: '2.0', id, error: { code, message } };
}

/** Tool-level failure: an ordinary result carrying isError, so the model can read and react to it. */
function toolError(message: string) {
	return { content: [{ type: 'text', text: message }], isError: true };
}

function toolResult(payload: unknown) {
	return {
		content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
		structuredContent: payload,
	};
}

// ─── Result shaping ──────────────────────────────────────────────────────────

/**
 * Strip Telegram-upload plumbing before serialising. `buffer` is a Uint8Array that would
 * balloon into a huge JSON object, and buffer-only items have no link to hand to a client.
 */
function toPublicMedia(media: MediaItem[] = []) {
	const linkable = media.filter((item) => typeof item.url === 'string' && item.url.length > 0);
	const items = linkable.map(({ type, url, quality, filesize }) => ({
		type,
		url,
		...(quality ? { quality } : {}),
		...(filesize ? { filesize } : {}),
	}));
	return { items, omittedBinaryItems: media.length - linkable.length };
}

function shapeResult(result: DownloaderResult, platform: string) {
	const { items, omittedBinaryItems } = toPublicMedia(result.media);
	return {
		platform,
		media: items,
		...(omittedBinaryItems ? { omittedBinaryItems } : {}),
		...(result.caption ? { caption: result.caption } : {}),
		...(result.thumbnail ? { thumbnail: result.thumbnail } : {}),
		...(result.mp3Url ? { mp3Url: result.mp3Url } : {}),
	};
}

// ─── Tools ───────────────────────────────────────────────────────────────────

/** Shared front door: normalize the URL and apply the same content policy as the bot. */
function resolveUrl(args: Record<string, unknown>) {
	const url = args.url;
	if (typeof url !== 'string' || !url.trim()) {
		return { error: 'The "url" argument is required and must be a non-empty string.' };
	}
	const detected = detectMediaUrl(url);
	if (!detected) return { error: `No supported URL found in: ${url}` };
	if (isBlockedDomain(detected.url)) {
		return { error: 'This content is not allowed. Do not retry this URL.' };
	}
	return { detected };
}

async function callDownloadMedia(args: Record<string, unknown>, env: Env) {
	const resolved = resolveUrl(args);
	if (resolved.error) return toolError(resolved.error);
	const { url, platform } = resolved.detected!;

	const mode = (VALID_MODES as string[]).includes(String(args.mode)) ? (args.mode as DownloaderMode) : 'auto';

	const result = await downloadMedia(url, mode, platform, env);
	if (result.status !== 'success' || !result.media?.length) {
		const retry = result.retryable ? ' This is transient — retrying in a few seconds may succeed.' : '';
		return toolError(`Download failed for ${platform}: ${result.error ?? 'no media found'}.${retry}`);
	}

	const shaped = shapeResult(result, platform);
	if (!shaped.media.length) {
		return toolError(`${platform} returned media that has no downloadable link.`);
	}
	return toolResult(shaped);
}

async function callGetMediaInfo(args: Record<string, unknown>) {
	const resolved = resolveUrl(args);
	if (resolved.error) return toolError(resolved.error);
	const { url, platform } = resolved.detected!;

	if (platform === 'TikTok') {
		const info = await fetchTikTokInfo(url);
		if (!info) return toolError('Could not fetch TikTok info for this URL.');
		return toolResult({
			platform,
			caption: info.caption,
			isImagePost: info.isImagePost,
			availableModes: info.audioAvailable ? ['auto', 'audio'] : ['auto'],
		});
	}

	if (platform === 'Facebook') {
		const info = await fetchFacebookInfo(url);
		if (!info) return toolError('Could not fetch Facebook info for this URL.');
		return toolResult({
			platform,
			availableModes: ['auto', 'hd', 'sd'],
			qualities: { hd: info.hdLabel, sd: info.sdLabel },
		});
	}

	return toolResult({
		platform,
		preview: null,
		note: `No preview is available for ${platform}. Call download_media directly.`,
	});
}

async function dispatchTool(name: string, args: Record<string, unknown>, env: Env) {
	switch (name) {
		case 'download_media':
			return callDownloadMedia(args, env);
		case 'get_media_info':
			return callGetMediaInfo(args);
		case 'list_supported_platforms':
			return toolResult({
				platforms: SUPPORTED_PLATFORMS,
				fallback: 'Other URLs are attempted via a generic extractor and may still work.',
			});
		default:
			return null;
	}
}

// ─── Request handling ────────────────────────────────────────────────────────

/**
 * Accepts the key three ways: `X-API-Key`, an `Authorization` bearer token, or as
 * the last path segment (`POST /mcp/<key>`).
 *
 * The path form exists for clients that cannot attach custom headers — notably
 * claude.ai custom connectors, where header auth is still a gated beta. It is the
 * same secret, just carried in the URL, which makes the endpoint a capability URL:
 * treat it as a password and avoid pasting it anywhere that logs full URLs.
 */
function isAuthorized(c: Context, apiKey: string): boolean {
	if (c.req.header('X-API-Key') === apiKey) return true;
	if (c.req.param('token') === apiKey) return true;
	const auth = c.req.header('Authorization');
	return auth === `Bearer ${apiKey}`;
}

async function handleRpc(message: JsonRpcMessage, env: Env): Promise<object | null> {
	const id: JsonRpcId = message?.id ?? null;
	const method = message?.method;

	if (typeof method !== 'string') {
		return rpcError(id, -32600, 'Invalid Request: missing method');
	}

	// Notifications carry no id and expect no response body.
	if (method.startsWith('notifications/')) return null;

	switch (method) {
		case 'initialize': {
			const asked = message?.params?.protocolVersion;
			const agreed = typeof asked === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(asked);
			return rpcResult(id, {
				protocolVersion: agreed ? asked : DEFAULT_PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: SERVER_INFO,
				instructions: INSTRUCTIONS,
			});
		}
		case 'ping':
			return rpcResult(id, {});
		case 'tools/list':
			return rpcResult(id, { tools: TOOLS });
		case 'tools/call': {
			const name = message?.params?.name;
			if (typeof name !== 'string') {
				return rpcError(id, -32602, 'Invalid params: tool name is required');
			}
			const args = (message?.params?.arguments ?? {}) as Record<string, unknown>;
			try {
				const result = await dispatchTool(name, args, env);
				if (!result) return rpcError(id, -32602, `Unknown tool: ${name}`);
				return rpcResult(id, result);
			} catch (err) {
				// Tool crashes come back as readable tool errors, not protocol errors.
				const reason = err instanceof Error ? err.message : 'unknown error';
				return rpcResult(id, toolError(`Tool "${name}" failed: ${reason}`));
			}
		}
		// Declared capabilities are tools-only, but answer politely if a client probes anyway.
		case 'resources/list':
			return rpcResult(id, { resources: [] });
		case 'prompts/list':
			return rpcResult(id, { prompts: [] });
		default:
			return rpcError(id, -32601, `Method not found: ${method}`);
	}
}

export async function handleMcp(c: Context) {
	const apiKey = c.env.PUBLIC_API_KEY;
	// Fail closed, exactly like /api/download: no key configured means no MCP server.
	if (!apiKey) {
		return c.json(rpcError(null, -32000, 'MCP server is not enabled'), 503);
	}
	if (!isAuthorized(c, apiKey)) {
		return c.json(rpcError(null, -32001, 'Unauthorized'), 401);
	}

	let message: JsonRpcMessage;
	try {
		message = await c.req.json();
	} catch {
		return c.json(rpcError(null, -32700, 'Parse error'), 400);
	}

	// JSON-RPC batching was removed from MCP in the 2025-06-18 revision.
	if (Array.isArray(message)) {
		return c.json(rpcError(null, -32600, 'Batch requests are not supported'), 400);
	}

	const response = await handleRpc(message, c.env);
	if (!response) return c.body(null, 202);
	return c.json(response);
}

/**
 * GET/DELETE on the MCP endpoint. This server is stateless: there is no SSE stream to
 * resume and no session to delete, so the spec calls for 405.
 */
export function handleMcpMethodNotAllowed(c: Context) {
	return c.json(rpcError(null, -32000, 'Method Not Allowed: this MCP server is stateless (POST only)'), 405);
}

/** CORS preflight — lets browser clients (e.g. the MCP Inspector) reach the endpoint. */
export function handleMcpOptions(c: Context) {
	return c.body(null, 204, {
		'Access-Control-Allow-Origin': c.req.header('Origin') ?? '*',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization, MCP-Protocol-Version',
		'Access-Control-Max-Age': '86400',
	});
}
