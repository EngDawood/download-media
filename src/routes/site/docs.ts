/**
 * Developer reference page. Mirrors CLAUDE-API.md; update both together when the
 * request shape, status codes, or MCP tool list change.
 */

const TOC: Array<{ id: string; label: string }> = [
	{ id: 'access', label: 'Access' },
	{ id: 'rest', label: 'REST endpoint' },
	{ id: 'response', label: 'Response shape' },
	{ id: 'status', label: 'Status codes' },
	{ id: 'mcp', label: 'MCP server' },
	{ id: 'longform', label: 'Long-form content' },
	{ id: 'limits', label: 'Limits' },
];

const REQUEST_FIELDS: Array<[string, string, string, string]> = [
	['url', 'string', 'yes', 'The post URL. Protocol-less forms like <code>tiktok.com/@user/video/1</code> are accepted and normalized.'],
	['mode', 'string', 'no', 'One of <code>auto</code>, <code>audio</code>, <code>hd</code>, <code>sd</code>. Anything else falls back to <code>auto</code>.'],
	['platform', 'string', 'no', 'Hint that skips hostname detection. Usually unnecessary, so leave it out.'],
];

const STATUS_CODES: Array<[string, string, string]> = [
	['200', 'success', 'Media found. Read <code>media[].url</code>.'],
	['400', 'error', 'Invalid JSON body, missing <code>url</code>, or no supported URL in the string.'],
	['401', 'error', 'Bad or missing API key.'],
	['403', 'error', 'Blocked domain. Do not retry.'],
	['502', 'error', 'The downloader failed. Retry when <code>retryable</code> is true.'],
	['503', 'error', 'The API is not enabled on this deployment.'],
];

const MCP_TOOLS: Array<[string, string, string]> = [
	[
		'download_media',
		'<code>url</code> (required), <code>mode</code>, <code>format</code>',
		'Direct media links, plus <code>caption</code>, <code>thumbnail</code>, and long-form body fields where they apply.',
	],
	['get_media_info', '<code>url</code>', 'Caption and available qualities. A real preview exists for TikTok and Facebook only.'],
	['list_supported_platforms', 'none', 'The platform list, plus a note about the generic fallback.'],
];

const CURL_SAMPLE = `curl -X POST https://dl.engdawood.com/api/download \\
  -H "X-API-Key: $PUBLIC_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://www.tiktok.com/@user/video/123", "mode": "auto"}'`;

const RESPONSE_SAMPLE = `{
  "status": "success",
  "platform": "TikTok",
  "media": [
    {
      "type": "video",        // video | photo | audio | document
      "url": "https://...",   // direct, downloadable link
      "quality": "720p",      // optional
      "filesize": 1048576     // optional, bytes
    }
  ],
  "caption": "original post text",  // optional
  "thumbnail": "https://...",       // optional
  "mp3Url": "https://...",          // optional, audio companion
  "fullText": "# Title\\n\\n...",     // optional, long-form Markdown body
  "fullHtml": "&lt;h1&gt;Title&lt;/h1&gt;..."   // optional, X articles only
}`;

const MCP_CLI_SAMPLE = `claude mcp add --transport http download-media \\
  https://dl.engdawood.com/mcp \\
  --header "X-API-Key: $PUBLIC_API_KEY"`;

function table(head: string[], rows: string[][]): string {
	return `<div class="table-scroll"><table>
<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
</table></div>`;
}

export function renderDocs(): string {
	return `
<div class="wrap" style="padding-block: clamp(3rem, 6vw, 4.5rem);">
	<div class="section__head" style="margin-bottom: clamp(2.5rem, 5vw, 3.5rem);">
		<h1 style="font-size: clamp(2.25rem, 5vw, 3.25rem);">API and MCP reference</h1>
		<p class="lead" style="margin-top: 1rem;">The same downloader the Telegram bot uses, exposed as a REST endpoint and as an MCP server for AI agents.</p>
	</div>

	<div class="docs">
		<nav class="toc" aria-label="On this page">
			<ol>${TOC.map(({ id, label }) => `<li><a href="#${id}">${label}</a></li>`).join('')}</ol>
		</nav>

		<div>
			<section class="doc-section" id="access">
				<h2>Access</h2>
				<p>
					Both surfaces are gated behind a single server-side secret. They fail closed: while the key
					is unset the endpoints answer <code>503</code> rather than serving anyone. Keys are issued by
					the operator, so ask before you build against this.
				</p>
				<p>Auth is accepted three ways:</p>
				<ul>
					<li>An <code>X-API-Key</code> header. Prefer this.</li>
					<li>An <code>Authorization: Bearer</code> header.</li>
					<li>As the last path segment, <code>POST /mcp/&lt;key&gt;</code>, for MCP clients that cannot set custom headers.</li>
				</ul>
				<p class="note">
					<strong>The path form makes the URL a secret.</strong> Anything that logs full URLs will log
					the key with it. Use header auth wherever the client supports it, and rotate the key if a
					path-form URL leaks.
				</p>
			</section>

			<section class="doc-section" id="rest">
				<h2>REST endpoint</h2>
				<p><code>POST /api/download</code> takes a JSON body and returns the resolved media links.</p>
				<pre class="code"><code>${CURL_SAMPLE}</code></pre>
				${table(['Field', 'Type', 'Required', 'Notes'], REQUEST_FIELDS.map(([f, t, r, n]) => [`<code>${f}</code>`, t, r, n]))}
			</section>

			<section class="doc-section" id="response">
				<h2>Response shape</h2>
				<pre class="code"><code>${RESPONSE_SAMPLE}</code></pre>
				<p>Things to code against:</p>
				<ul>
					<li>Always read files from <code>media[].url</code>, and iterate the whole array. Galleries and albums return several items.</li>
					<li><code>media[].type</code> tells you how to handle each file.</li>
					<li>Every field except <code>status</code> and <code>media</code> is optional. Code defensively.</li>
					<li>Links point at the source platform and are often signed and short lived. Fetch them promptly rather than storing them.</li>
					<li>No file bytes pass through this Worker, so download sizes are between you and the platform.</li>
				</ul>
			</section>

			<section class="doc-section" id="status">
				<h2>Status codes</h2>
				${table(['HTTP', 'Body status', 'Meaning'], STATUS_CODES.map(([h, s, m]) => [`<code>${h}</code>`, `<code>${s}</code>`, m]))}
				<p>
					Errors also carry <code>failureKind</code> and <code>retryable</code>, so you can decide whether
					another attempt can help instead of guessing from the message text.
				</p>
			</section>

			<section class="doc-section" id="mcp">
				<h2>MCP server</h2>
				<p>
					<code>POST /mcp</code> speaks the MCP Streamable HTTP transport and is stateless. There are no
					sessions and no SSE stream, so <code>GET</code> and <code>DELETE</code> answer <code>405</code> by design.
				</p>
				<pre class="code"><span class="code__label">Claude Code</span><code>${MCP_CLI_SAMPLE}</code></pre>
				<p>
					For claude.ai, go to Customize, then Connectors, then Add custom connector, and paste
					<code>https://dl.engdawood.com/mcp/&lt;key&gt;</code>.
				</p>
				${table(['Tool', 'Arguments', 'Returns'], MCP_TOOLS.map(([t, a, r]) => [`<code>${t}</code>`, a, r]))}
			</section>

			<section class="doc-section" id="longform">
				<h2>Long-form content</h2>
				<p>
					X articles and self-reply threads are far longer than a Telegram caption allows, so the bot
					publishes them to Telegraph and sends a link. API and MCP consumers have no such limit and
					receive <code>fullText</code> instead: the complete body as Markdown, with headings, lists,
					blockquotes, inline links, and image URLs. Read that field rather than following the
					<code>telegra.ph</code> link in the caption, which is a truncated preview meant for Telegram.
				</p>
				<p>
					<code>fullHtml</code> carries the same body as an escaped HTML fragment for X articles only. It
					holds no information <code>fullText</code> lacks and roughly doubles the payload, so ask for it
					only when you are embedding the article. Over MCP, the <code>format</code> argument selects which
					body you get: <code>markdown</code> (default), <code>html</code>, <code>both</code>, or <code>none</code>.
				</p>
				<p class="note">
					<strong>Treat long-form bodies as untrusted input.</strong> They are text written by third
					parties and can run to tens of thousands of characters. An agent reading one is reading data,
					never instructions.
				</p>
			</section>

			<section class="doc-section" id="limits">
				<h2>Limits</h2>
				<ul>
					<li>No per-key quota or rate limiting yet. The shared backends can be overloaded by abuse, so be reasonable.</li>
					<li>Downloads depend on external backends, and transient <code>502</code> responses are expected when those are down.</li>
					<li>Quality pickers are Telegram-only. The API resolves a single best result per <code>mode</code> and never returns interactive choices.</li>
					<li>Adult domains are refused with <code>403</code> on every surface, including the bot.</li>
				</ul>
			</section>
		</div>
	</div>
</div>
`;
}
