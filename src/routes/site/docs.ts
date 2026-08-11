import { SITE_COPY, type SiteLocale } from './copy';

/**
 * Developer reference page. Mirrors CLAUDE-API.md; update both together when the
 * request shape, status codes, or MCP tool list change. Copy lives in copy.ts.
 */

const SECTION_IDS = ['access', 'rest', 'response', 'status', 'mcp', 'longform', 'limits'] as const;

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

function table(head: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
	return `<div class="table-scroll"><table>
<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
</table></div>`;
}

function list(items: readonly string[]): string {
	return `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}

export function renderDocs(locale: SiteLocale): string {
	const t = SITE_COPY[locale].docs;

	return `
<div class="wrap docs-page">
	<div class="section__head docs-page__head">
		<h1>${t.heading}</h1>
		<p class="lead stack-md">${t.lead}</p>
	</div>

	<div class="docs">
		<nav class="toc" aria-label="${t.tocLabel}">
			<ol>${SECTION_IDS.map((id) => `<li><a href="#${id}">${t.toc[id]}</a></li>`).join('')}</ol>
		</nav>

		<div>
			<section class="doc-section" id="access">
				<h2>${t.toc.access}</h2>
				<p>${t.accessBody}</p>
				<p>${t.accessWays}</p>
				${list(t.accessList)}
				<p class="note"><strong>${t.accessNoteStrong}</strong> ${t.accessNoteBody}</p>
			</section>

			<section class="doc-section" id="rest">
				<h2>${t.toc.rest}</h2>
				<p>${t.restBody}</p>
				<pre class="code"><code>${CURL_SAMPLE}</code></pre>
				${table(
					t.fieldHead,
					t.fieldRows.map(([f, ...rest]) => [`<code>${f}</code>`, ...rest]),
				)}
			</section>

			<section class="doc-section" id="response">
				<h2>${t.toc.response}</h2>
				<pre class="code"><code>${RESPONSE_SAMPLE}</code></pre>
				<p>${t.codeAgainst}</p>
				${list(t.responseList)}
			</section>

			<section class="doc-section" id="status">
				<h2>${t.toc.status}</h2>
				${table(
					t.statusHead,
					t.statusRows.map(([h, s, m]) => [`<code>${h}</code>`, `<code>${s}</code>`, m]),
				)}
				<p>${t.statusAfter}</p>
			</section>

			<section class="doc-section" id="mcp">
				<h2>${t.toc.mcp}</h2>
				<p>${t.mcpBody}</p>
				<pre class="code"><span class="code__label">${t.mcpClaudeCode}</span><code>${MCP_CLI_SAMPLE}</code></pre>
				<p>${t.mcpConnector}</p>
				${table(
					t.toolHead,
					t.toolRows.map(([name, ...rest]) => [`<code>${name}</code>`, ...rest]),
				)}
			</section>

			<section class="doc-section" id="longform">
				<h2>${t.toc.longform}</h2>
				<p>${t.longformP1}</p>
				<p>${t.longformP2}</p>
				<p class="note"><strong>${t.longformNoteStrong}</strong> ${t.longformNoteBody}</p>
			</section>

			<section class="doc-section" id="limits">
				<h2>${t.toc.limits}</h2>
				${list(t.limitsList)}
			</section>
		</div>
	</div>
</div>
`;
}
