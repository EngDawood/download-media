/**
 * Stylesheet for the public site (/ and /docs), inlined into every page.
 *
 * There is no asset pipeline in this Worker, so the CSS ships as a string and the
 * type stack is system fonts (no external font request, no FOUT, no build step).
 *
 * Theme: light by default, dark swapped through the same token names under
 * prefers-color-scheme. There is deliberately no manual toggle, because the
 * Simple Icons logos carry their own prefers-color-scheme rule and would not
 * follow a class-based override.
 *
 * Radius rule, applied everywhere: containers 12px, controls and code 8px.
 */
export const SITE_CSS = `
:root {
	--paper: #fbfaf7;
	--surface: #fefefd;
	--sunken: #f2efe9;
	--ink: #1a1917;
	--ink-2: #56544c;
	--line: #e4e0d8;
	--line-strong: #d3cec2;
	--accent: #1b5e4a;
	--accent-soft: #e8f0ec;
	--logo: 4a4741;
	--logo-dark: a9a69b;
	--r: 12px;
	--r-sm: 8px;
	--font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
	--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
	--ease: cubic-bezier(0.16, 1, 0.3, 1);
	color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
	:root {
		--paper: #131311;
		--surface: #1a1a17;
		--sunken: #201f1c;
		--ink: #edebe4;
		--ink-2: #a9a69b;
		--line: #2e2e29;
		--line-strong: #3c3b35;
		--accent: #6fcfaa;
		--accent-soft: #16241f;
	}
}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
	margin: 0;
	background: var(--paper);
	color: var(--ink);
	font-family: var(--font-sans);
	font-size: 1.0625rem;
	line-height: 1.65;
	letter-spacing: -0.005em;
	-webkit-font-smoothing: antialiased;
}
img { max-width: 100%; height: auto; }

a { color: var(--accent); text-underline-offset: 3px; text-decoration-thickness: 1px; }
a:hover { text-decoration-thickness: 2px; }

:focus-visible {
	outline: 2px solid var(--accent);
	outline-offset: 3px;
	border-radius: 2px;
}

.wrap { width: min(1120px, 100% - 2.5rem); margin-inline: auto; }
.narrow { max-width: 62ch; }

h1, h2, h3 { margin: 0; letter-spacing: -0.03em; line-height: 1.1; text-wrap: balance; font-weight: 620; }
h2 { font-size: clamp(1.75rem, 3.4vw, 2.5rem); }
h3 { font-size: 1.125rem; letter-spacing: -0.015em; line-height: 1.3; }
p { margin: 0; }
.lead { color: var(--ink-2); font-size: 1.125rem; }
.muted { color: var(--ink-2); }

/* ── Skip link ───────────────────────────────────────────────────── */
.skip {
	position: absolute;
	left: -9999px;
	top: 0;
	background: var(--ink);
	color: var(--paper);
	padding: 0.75rem 1rem;
	border-radius: var(--r-sm);
	z-index: 20;
}
.skip:focus { left: 1rem; top: 1rem; }

/* ── Navigation: one line, 68px, never wraps ─────────────────────── */
.nav {
	position: sticky;
	top: 0;
	z-index: 10;
	height: 68px;
	display: flex;
	align-items: center;
	background: color-mix(in srgb, var(--paper) 88%, transparent);
	backdrop-filter: saturate(180%) blur(12px);
	-webkit-backdrop-filter: saturate(180%) blur(12px);
	border-bottom: 1px solid var(--line);
}
.nav__inner { display: flex; align-items: center; gap: 2rem; width: 100%; }
.nav__mark {
	font-weight: 640;
	letter-spacing: -0.03em;
	font-size: 1.0625rem;
	color: var(--ink);
	text-decoration: none;
	white-space: nowrap;
}
.nav__mark span { color: var(--accent); }
.nav__links { display: flex; gap: 1.75rem; margin-left: auto; }
.nav__links a {
	color: var(--ink-2);
	text-decoration: none;
	font-size: 0.9375rem;
	white-space: nowrap;
	transition: color 0.2s var(--ease);
}
.nav__links a:hover, .nav__links a[aria-current="page"] { color: var(--ink); }
.nav .btn { margin-left: 1.5rem; }

@media (max-width: 720px) {
	.nav__links { display: none; }
	.nav .btn { margin-left: auto; }
}

/* ── Buttons: ink fill or hairline ghost, controls radius ────────── */
.btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	padding: 0.6875rem 1.125rem;
	border-radius: var(--r-sm);
	border: 1px solid transparent;
	font: inherit;
	font-size: 0.9375rem;
	font-weight: 540;
	line-height: 1.2;
	white-space: nowrap;
	text-decoration: none;
	cursor: pointer;
	transition: transform 0.15s var(--ease), background-color 0.2s var(--ease), border-color 0.2s var(--ease);
}
.btn--primary { background: var(--ink); color: var(--paper); }
.btn--primary:hover { background: color-mix(in srgb, var(--ink) 86%, var(--accent)); }
.btn--ghost { background: transparent; color: var(--ink); border-color: var(--line-strong); }
.btn--ghost:hover { border-color: var(--ink-2); background: var(--surface); }
.btn:active { transform: translateY(1px); }

/* ── Section rhythm ──────────────────────────────────────────────── */
.section { padding-block: clamp(4rem, 9vw, 7rem); }
.section--tight { padding-block: clamp(2.5rem, 5vw, 3.5rem); }
.section + .section { border-top: 1px solid var(--line); }
.section__head { max-width: 46ch; margin-bottom: clamp(2.25rem, 4vw, 3.25rem); }
.section__head p { margin-top: 0.875rem; color: var(--ink-2); }

/* ── Hero: left aligned, asymmetric whitespace on the right ──────── */
.hero { padding-top: clamp(3.5rem, 8vw, 6rem); padding-bottom: clamp(3rem, 6vw, 4.5rem); }
.hero__grid { display: grid; grid-template-columns: repeat(12, 1fr); }
.hero__body { grid-column: 1 / -1; }
@media (min-width: 900px) { .hero__body { grid-column: 1 / 9; } }
.hero h1 {
	font-size: clamp(2.5rem, 6.4vw, 4.25rem);
	line-height: 1.02;
	letter-spacing: -0.042em;
}
.hero p { margin-top: 1.5rem; max-width: 46ch; font-size: clamp(1.0625rem, 1.6vw, 1.25rem); color: var(--ink-2); }
.hero__cta { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2.25rem; }

/* ── Platform logo wall: logos only, no labels ───────────────────── */
.logos {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 1px;
	background: var(--line);
	border: 1px solid var(--line);
	border-radius: var(--r);
	overflow: hidden;
}
.logos li {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 1.5rem 1rem;
	background: var(--surface);
}
.logos img { width: 24px; height: 24px; opacity: 0.72; transition: opacity 0.2s var(--ease); }
.logos li:hover img { opacity: 1; }
@media (max-width: 640px) { .logos { grid-template-columns: repeat(3, minmax(0, 1fr)); } }

/* ── Capability grid: spacing groups it, no card chrome ──────────── */
.grid-2 { display: grid; gap: clamp(2rem, 4vw, 3rem) clamp(2.5rem, 6vw, 5rem); grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-2 p { margin-top: 0.625rem; color: var(--ink-2); font-size: 0.9875rem; }
@media (max-width: 760px) { .grid-2 { grid-template-columns: 1fr; } }

/* ── Split: prose beside a code panel ────────────────────────────── */
.split { display: grid; gap: clamp(2rem, 5vw, 4rem); grid-template-columns: minmax(0, 4fr) minmax(0, 6fr); align-items: start; }
@media (max-width: 900px) { .split { grid-template-columns: 1fr; } }

/* ── Code ────────────────────────────────────────────────────────── */
.code {
	background: var(--sunken);
	border: 1px solid var(--line);
	border-radius: var(--r-sm);
	padding: 1.125rem 1.25rem;
	overflow-x: auto;
	margin: 0;
}
.code code {
	font-family: var(--font-mono);
	font-size: 0.8125rem;
	line-height: 1.7;
	color: var(--ink);
	white-space: pre;
	display: block;
	tab-size: 2;
}
.code + .code { margin-top: 0.75rem; }
.code__label {
	display: block;
	font-family: var(--font-mono);
	font-size: 0.75rem;
	color: var(--ink-2);
	margin-bottom: 0.5rem;
}
p code, li code, td code {
	font-family: var(--font-mono);
	font-size: 0.85em;
	background: var(--sunken);
	border: 1px solid var(--line);
	border-radius: 4px;
	padding: 0.1em 0.35em;
}

/* ── Notes ───────────────────────────────────────────────────────── */
.note {
	border-left: 2px solid var(--accent);
	background: var(--accent-soft);
	border-radius: 0 var(--r-sm) var(--r-sm) 0;
	padding: 1rem 1.25rem;
	color: var(--ink-2);
	font-size: 0.9375rem;
}
.note strong { color: var(--ink); font-weight: 600; }

/* ── Docs layout ─────────────────────────────────────────────────── */
.docs { display: grid; gap: clamp(2rem, 5vw, 4rem); grid-template-columns: 200px minmax(0, 1fr); align-items: start; }
@media (max-width: 940px) { .docs { grid-template-columns: 1fr; } .toc { position: static; } }
.toc { position: sticky; top: 92px; }
.toc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
.toc a { display: block; color: var(--ink-2); text-decoration: none; font-size: 0.875rem; line-height: 1.4; }
.toc a:hover { color: var(--ink); }

.doc-section { padding-block: clamp(2.5rem, 5vw, 3.5rem); scroll-margin-top: 92px; }
.doc-section:first-child { padding-top: 0; }
.doc-section + .doc-section { border-top: 1px solid var(--line); }
.doc-section > * + * { margin-top: 1.125rem; }
.doc-section h2 { font-size: clamp(1.5rem, 2.6vw, 1.875rem); }
.doc-section p { color: var(--ink-2); max-width: 68ch; }
.doc-section ul { margin: 0; padding-left: 1.1rem; color: var(--ink-2); max-width: 68ch; }
.doc-section li + li { margin-top: 0.5rem; }

/* Reference tables: header rule plus light row rules, nothing decorative. */
.table-scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.9375rem; min-width: 480px; }
th {
	text-align: left;
	font-weight: 600;
	color: var(--ink);
	padding: 0 1rem 0.625rem 0;
	border-bottom: 1px solid var(--line-strong);
	white-space: nowrap;
}
td { padding: 0.75rem 1rem 0.75rem 0; border-bottom: 1px solid var(--line); color: var(--ink-2); vertical-align: top; }
tr:last-child td { border-bottom: 0; }

/* ── Footer ──────────────────────────────────────────────────────── */
.footer { border-top: 1px solid var(--line); padding-block: clamp(2.5rem, 5vw, 3.5rem); }
.footer__inner { display: flex; flex-wrap: wrap; gap: 1.5rem 2.5rem; align-items: baseline; justify-content: space-between; }
.footer__links { display: flex; flex-wrap: wrap; gap: 1.5rem; }
.footer a { color: var(--ink-2); text-decoration: none; font-size: 0.9375rem; }
.footer a:hover { color: var(--ink); }
.footer__note { color: var(--ink-2); font-size: 0.875rem; }

@media (prefers-reduced-motion: reduce) {
	*, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
`;
