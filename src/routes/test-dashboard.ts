import { Context } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { downloadMedia } from '../services/media-downloader';
import urlsJson from '../../test/urls.json';

// Hostname-based guard to ensure test routes only execute locally
export async function localOnlyGuard(c: Context, next: () => Promise<Response | void>) {
	try {
		const hostname = new URL(c.req.url).hostname;
		if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
			return c.text('Not Found', 404);
		}
	} catch {
		return c.text('Not Found', 404);
	}
	return next();
}

function getUrlsFilePath(): string {
	return path.join(process.cwd(), 'test', 'urls.json');
}

// Read urls.json from disk
export async function handleGetTestUrls(c: Context) {
	try {
		const filePath = getUrlsFilePath();
		if (fs.existsSync(filePath)) {
			const data = fs.readFileSync(filePath, 'utf8');
			return c.json(JSON.parse(data));
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[Dashboard API] Error reading urls.json:', msg);
	}
	// Fallback to imported JSON if reading from disk fails
	return c.json(urlsJson);
}

// Write urls.json to disk
export async function handlePostTestUrls(c: Context) {
	try {
		const data = await c.req.json();
		const filePath = getUrlsFilePath();
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
		return c.json({ success: true, message: 'Saved to disk successfully' });
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[Dashboard API] Error writing urls.json:', msg);
		return c.json({ 
			success: false, 
			error: msg || 'Write permission denied', 
			message: 'Could not write to disk. Changes saved to browser storage only.' 
		}, 500);
	}
}

// Execute downloadMedia pipeline
export async function handleTestDownload(c: Context) {
	try {
		const { url, mode, platform } = await c.req.json();
		if (!url) {
			return c.json({ status: 'error', error: 'URL is required' }, 400);
		}

		console.log(`[Dashboard API] testing download: ${url} (mode: ${mode}, platform: ${platform})`);
		const result = await downloadMedia(url, mode || 'auto', platform, c.env);
		return c.json(result);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		return c.json({ status: 'error', error: msg || 'Internal server error' }, 500);
	}
}

// HTML Dashboard content
export async function handleGetDashboard(c: Context) {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Download Media — Dev Test Dashboard</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
	<style>
		:root {
			--bg-base: #0a0a0f;
			--bg-surface: #111218;
			--bg-card: #181a24;
			--bg-hover: #222533;
			--border: #292d3e;
			--border-hover: #3d435c;
			--text-primary: #e8e8ed;
			--text-secondary: #8b8b9e;
			--text-muted: #5a5a6e;
			--accent: #7c4dff;
			--accent-hover: #651fff;
			--accent-glow: rgba(124, 77, 255, 0.25);
			--success: #00e676;
			--success-glow: rgba(0, 230, 118, 0.15);
			--error: #ff1744;
			--error-glow: rgba(255, 23, 68, 0.15);
			--amber: #ffb300;
			--amber-glow: rgba(255, 179, 0, 0.15);
			--info: #00e5ff;
			--radius-sm: 6px;
			--radius-md: 10px;
			--radius-lg: 14px;
			--shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
			--transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		}

		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: 'Outfit', sans-serif;
			background-color: var(--bg-base);
			color: var(--text-primary);
			line-height: 1.5;
			min-height: 100vh;
			overflow-x: hidden;
			background-image: radial-gradient(circle at 80% 20%, rgba(124, 77, 255, 0.03) 0%, transparent 50%),
			                  radial-gradient(circle at 10% 80%, rgba(0, 229, 255, 0.02) 0%, transparent 50%);
		}

		.app {
			max-width: 1440px;
			margin: 0 auto;
			padding: 24px;
			display: flex;
			flex-direction: column;
			gap: 20px;
		}

		/* Header */
		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding-bottom: 16px;
			border-bottom: 1px solid var(--border);
		}

		.header__title h1 {
			font-size: 1.75rem;
			font-weight: 700;
			background: linear-gradient(135deg, var(--text-primary), var(--text-secondary));
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
		}

		.header__title p {
			font-size: 0.9rem;
			color: var(--text-secondary);
		}

		.header__badge {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 6px 14px;
			border-radius: 100px;
			background: var(--bg-card);
			border: 1px solid var(--border);
			font-size: 0.75rem;
			font-weight: 600;
			color: var(--accent);
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.header__badge .dot {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: var(--success);
			box-shadow: 0 0 8px var(--success);
			animation: pulse 2s infinite;
		}

		@keyframes pulse {
			0%, 100% { opacity: 1; transform: scale(1); }
			50% { opacity: 0.5; transform: scale(1.2); }
		}

		/* Stats Grid */
		.stats-bar {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
			gap: 12px;
		}

		.stat-card {
			background: var(--bg-surface);
			border: 1px solid var(--border);
			border-radius: var(--radius-md);
			padding: 16px;
			box-shadow: var(--shadow);
			transition: var(--transition);
		}

		.stat-card:hover {
			border-color: var(--border-hover);
			transform: translateY(-1px);
		}

		.stat-card__label {
			font-size: 0.7rem;
			font-weight: 600;
			color: var(--text-muted);
			text-transform: uppercase;
			letter-spacing: 0.8px;
			margin-bottom: 4px;
		}

		.stat-card__value {
			font-size: 1.5rem;
			font-weight: 700;
		}

		.stat-card__value--accent { color: var(--accent); }
		.stat-card__value--green { color: var(--success); }
		.stat-card__value--amber { color: var(--amber); }
		.stat-card__value--red { color: var(--error); }

		/* Split Layout */
		.workspace-grid {
			display: grid;
			grid-template-columns: 1.4fr 1fr;
			gap: 24px;
			align-items: start;
		}

		@media (max-width: 1024px) {
			.workspace-grid {
				grid-template-columns: 1fr;
			}
		}

		.card {
			background: var(--bg-surface);
			border: 1px solid var(--border);
			border-radius: var(--radius-lg);
			padding: 20px;
			box-shadow: var(--shadow);
		}

		.card-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 16px;
			padding-bottom: 12px;
			border-bottom: 1px solid var(--border);
		}

		.card-title {
			font-size: 1.05rem;
			font-weight: 600;
			display: flex;
			align-items: center;
			gap: 8px;
		}

		/* Controls and Search */
		.controls-bar {
			display: flex;
			gap: 10px;
			margin-bottom: 16px;
			flex-wrap: wrap;
		}

		.search-box {
			flex-grow: 1;
			position: relative;
			min-width: 200px;
		}

		.search-box input {
			width: 100%;
			background-color: var(--bg-card);
			border: 1px solid var(--border);
			border-radius: var(--radius-sm);
			padding: 10px 14px 10px 36px;
			color: var(--text-primary);
			font-family: inherit;
			font-size: 0.9rem;
			outline: none;
			transition: var(--transition);
		}

		.search-box input:focus {
			border-color: var(--accent);
			box-shadow: 0 0 0 3px var(--accent-glow);
		}

		.search-box__icon {
			position: absolute;
			left: 12px;
			top: 50%;
			transform: translateY(-50%);
			color: var(--text-muted);
			font-size: 0.85rem;
		}

		/* Buttons */
		button {
			font-family: inherit;
			font-size: 0.85rem;
			font-weight: 500;
			padding: 9px 16px;
			border-radius: var(--radius-sm);
			border: none;
			cursor: pointer;
			transition: var(--transition);
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			user-select: none;
		}

		.btn-primary {
			background-color: var(--accent);
			color: white;
		}

		.btn-primary:hover:not(:disabled) {
			background-color: var(--accent-hover);
			transform: translateY(-1px);
			box-shadow: 0 4px 12px var(--accent-glow);
		}

		.btn-secondary {
			background-color: var(--bg-card);
			border: 1px solid var(--border);
			color: var(--text-primary);
		}

		.btn-secondary:hover:not(:disabled) {
			background-color: var(--bg-hover);
			border-color: var(--border-hover);
		}

		.btn-success {
			background-color: var(--success-glow);
			border: 1px solid rgba(0, 230, 118, 0.3);
			color: var(--success);
		}

		.btn-success:hover:not(:disabled) {
			background-color: var(--success);
			color: white;
			box-shadow: 0 4px 12px var(--success-glow);
		}

		.btn-danger {
			background-color: var(--error-glow);
			border: 1px solid rgba(255, 23, 68, 0.3);
			color: var(--error);
		}

		.btn-danger:hover:not(:disabled) {
			background-color: var(--error);
			color: white;
			box-shadow: 0 4px 12px var(--error-glow);
		}

		button:disabled {
			opacity: 0.4;
			cursor: not-allowed;
		}

		/* Filter Chips */
		.filter-chips {
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
			margin-bottom: 16px;
			padding-bottom: 14px;
			border-bottom: 1px solid var(--border);
		}

		.chip {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 6px 12px;
			border: 1px solid var(--border);
			border-radius: 100px;
			background: var(--bg-card);
			color: var(--text-secondary);
			font-size: 0.75rem;
			font-weight: 500;
			cursor: pointer;
			transition: var(--transition);
		}

		.chip:hover {
			border-color: var(--border-hover);
			color: var(--text-primary);
		}

		.chip.active {
			background: var(--accent);
			border-color: var(--accent);
			color: white;
			box-shadow: 0 2px 10px var(--accent-glow);
		}

		.chip__count {
			font-size: 0.65rem;
			padding: 1px 6px;
			border-radius: 100px;
			background: rgba(255, 255, 255, 0.1);
			font-weight: 600;
		}

		/* Collapsible Platform Section */
		.platform-section {
			margin-bottom: 12px;
			border-radius: var(--radius-md);
			border: 1px solid var(--border);
			background: var(--bg-card);
			overflow: hidden;
		}

		.platform-section__header {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 12px 16px;
			cursor: pointer;
			user-select: none;
			transition: var(--transition);
		}

		.platform-section__header:hover {
			background-color: var(--bg-hover);
		}

		.platform-section__icon {
			width: 32px;
			height: 32px;
			border-radius: 8px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 0.95rem;
			font-weight: 700;
		}

		.platform-section__info {
			flex-grow: 1;
		}

		.platform-section__name {
			font-size: 0.9rem;
			font-weight: 600;
		}

		.platform-section__meta {
			font-size: 0.7rem;
			color: var(--text-secondary);
		}

		.platform-section__toggle {
			font-size: 1rem;
			color: var(--text-muted);
			transition: var(--transition);
		}

		.platform-section__toggle.open {
			transform: rotate(180deg);
		}

		.platform-section__body {
			border-top: 1px solid var(--border);
			background-color: var(--bg-surface);
		}

		.platform-section__body.hidden {
			display: none;
		}

		.category-group {
			border-bottom: 1px solid var(--border);
		}

		.category-group:last-child {
			border-bottom: none;
		}

		.category-group__label {
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 8px 16px;
			font-size: 0.7rem;
			font-weight: 600;
			color: var(--text-muted);
			text-transform: uppercase;
			letter-spacing: 0.5px;
			background-color: rgba(255, 255, 255, 0.01);
		}

		.category-group__label .cat-count {
			font-size: 0.65rem;
			padding: 1px 5px;
			border-radius: 100px;
			background: rgba(255, 255, 255, 0.05);
		}

		/* URL Table Rows */
		.url-row {
			display: grid;
			grid-template-columns: 36px 1fr 100px 140px;
			align-items: center;
			padding: 10px 16px;
			border-bottom: 1px solid rgba(255, 255, 255, 0.02);
			font-size: 0.85rem;
			transition: var(--transition);
		}

		.url-row:last-child {
			border-bottom: none;
		}

		.url-row:hover {
			background-color: var(--bg-hover);
		}

		.url-row input[type="checkbox"] {
			appearance: none;
			width: 16px;
			height: 16px;
			border: 1.5px solid var(--border-hover);
			border-radius: 4px;
			background: transparent;
			cursor: pointer;
			position: relative;
			transition: var(--transition);
		}

		.url-row input[type="checkbox"]:checked {
			background-color: var(--accent);
			border-color: var(--accent);
		}

		.url-row input[type="checkbox"]:checked::after {
			content: '✓';
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			color: white;
			font-size: 0.65rem;
			font-weight: 700;
		}

		.url-cell {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			padding-right: 12px;
		}

		.url-cell a {
			color: var(--text-primary);
			text-decoration: none;
			transition: var(--transition);
		}

		.url-cell a:hover {
			color: var(--accent);
		}

		/* Status Badges */
		.status {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 4px 10px;
			border-radius: 100px;
			font-size: 0.75rem;
			font-weight: 600;
		}

		.status--pending {
			background-color: var(--bg-card);
			color: var(--text-secondary);
		}

		.status--running {
			background-color: var(--accent-glow);
			color: var(--accent);
		}

		.status--success {
			background-color: var(--success-glow);
			color: var(--success);
		}

		.status--error {
			background-color: var(--error-glow);
			color: var(--error);
		}

		.status .spinner {
			width: 10px;
			height: 10px;
			border: 2px solid transparent;
			border-top-color: currentColor;
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
		}

		@keyframes spin {
			to { transform: rotate(360deg); }
		}

		/* Row Action Buttons */
		.action-btns {
			display: flex;
			gap: 4px;
			justify-content: flex-end;
		}

		.action-btn {
			padding: 4px 8px;
			border: 1px solid var(--border);
			border-radius: var(--radius-sm);
			background: transparent;
			color: var(--text-secondary);
			font-size: 0.75rem;
			font-weight: 500;
			cursor: pointer;
			transition: var(--transition);
		}

		.action-btn:hover {
			color: var(--accent);
			border-color: var(--accent);
			background: var(--accent-glow);
		}

		.action-btn--delete:hover {
			color: var(--error);
			border-color: var(--error);
			background: var(--error-glow);
		}

		.action-btn:disabled {
			opacity: 0.3;
			cursor: not-allowed;
		}

		/* Result Preview Panel */
		.result-pane {
			min-height: 500px;
			display: flex;
			flex-direction: column;
			position: sticky;
			top: 24px;
		}

		.empty-result {
			flex-grow: 1;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			color: var(--text-muted);
			text-align: center;
			padding: 40px;
			border: 2px dashed var(--border);
			border-radius: var(--radius-md);
		}

		.empty-result svg {
			width: 48px;
			height: 48px;
			margin-bottom: 16px;
			color: var(--border);
		}

		.loader {
			display: none;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			flex-grow: 1;
		}

		.spinner-large {
			width: 48px;
			height: 48px;
			border: 4px solid rgba(124, 77, 255, 0.1);
			border-radius: 50%;
			border-top-color: var(--accent);
			animation: spin 1s ease-in-out infinite;
			margin-bottom: 16px;
		}

		/* Media Preview Player */
		.media-preview-container {
			display: none;
			flex-direction: column;
			gap: 16px;
		}

		.preview-player {
			width: 100%;
			border-radius: var(--radius-md);
			overflow: hidden;
			background-color: black;
			border: 1px solid var(--border);
			aspect-ratio: 16 / 9;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.preview-player video {
			width: 100%;
			max-height: 100%;
		}

		.preview-player audio {
			width: 90%;
		}

		.preview-image {
			max-width: 100%;
			max-height: 100%;
			object-fit: contain;
		}

		.doc-preview {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 12px;
			padding: 30px;
			background-color: var(--bg-card);
			border-radius: var(--radius-md);
			width: 100%;
		}

		.doc-icon {
			font-size: 2.5rem;
		}

		.media-meta {
			background-color: var(--bg-card);
			border: 1px solid var(--border);
			border-radius: var(--radius-md);
			padding: 14px;
		}

		.meta-row {
			display: flex;
			justify-content: space-between;
			padding: 6px 0;
			border-bottom: 1px solid rgba(255, 255, 255, 0.04);
			font-size: 0.85rem;
		}

		.meta-row:last-child {
			border-bottom: none;
		}

		.meta-label {
			color: var(--text-secondary);
		}

		.meta-value {
			font-weight: 500;
		}

		pre {
			background-color: #0c0d12;
			border: 1px solid var(--border);
			border-radius: var(--radius-md);
			padding: 14px;
			font-family: monospace;
			font-size: 0.8rem;
			overflow-x: auto;
			max-height: 300px;
		}

		code {
			color: var(--info);
		}

		/* Modal overlay */
		.modal-overlay {
			display: none;
			position: fixed;
			inset: 0;
			background-color: rgba(0, 0, 0, 0.7);
			backdrop-filter: blur(4px);
			z-index: 100;
			align-items: center;
			justify-content: center;
		}

		.modal-overlay.visible {
			display: flex;
		}

		.modal {
			background-color: var(--bg-surface);
			border: 1px solid var(--border);
			border-radius: var(--radius-lg);
			width: 440px;
			max-width: 90%;
			box-shadow: var(--shadow);
			overflow: hidden;
			animation: slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1);
		}

		@keyframes slideDown {
			from { transform: translateY(-20px); opacity: 0; }
			to { transform: translateY(0); opacity: 1; }
		}

		.modal-header {
			padding: 16px 20px;
			border-bottom: 1px solid var(--border);
			display: flex;
			justify-content: space-between;
			align-items: center;
		}

		.modal-body {
			padding: 20px;
		}

		.modal-footer {
			padding: 14px 20px;
			border-top: 1px solid var(--border);
			display: flex;
			justify-content: flex-end;
			gap: 10px;
		}

		.close-modal {
			background: none;
			border: none;
			font-size: 1.5rem;
			color: var(--text-muted);
			cursor: pointer;
		}

		.form-group {
			margin-bottom: 14px;
		}

		label {
			display: block;
			font-size: 0.8rem;
			font-weight: 600;
			color: var(--text-secondary);
			margin-bottom: 6px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		input[type="text"], select, textarea {
			width: 100%;
			background-color: var(--bg-card);
			border: 1px solid var(--border);
			border-radius: var(--radius-sm);
			padding: 10px 14px;
			color: var(--text-primary);
			font-family: inherit;
			font-size: 0.9rem;
			outline: none;
			transition: var(--transition);
		}

		input[type="text"]:focus, select:focus, textarea:focus {
			border-color: var(--accent);
			box-shadow: 0 0 0 3px var(--accent-glow);
		}

		textarea {
			min-height: 100px;
			resize: vertical;
		}

		/* Unsaved Changes Banner */
		.unsaved-bar {
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			padding: 12px 24px;
			background: rgba(17, 18, 24, 0.95);
			border-top: 1px solid var(--amber);
			backdrop-filter: blur(20px);
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 16px;
			z-index: 50;
			transform: translateY(100%);
			transition: transform 0.3s ease;
		}

		.unsaved-bar.visible {
			transform: translateY(0);
		}

		.unsaved-bar__text {
			font-size: 0.85rem;
			color: var(--amber);
			font-weight: 600;
		}

		/* Toast message */
		.toast-container {
			position: fixed;
			bottom: 24px;
			right: 24px;
			z-index: 1000;
			display: flex;
			flex-direction: column;
			gap: 8px;
		}

		.toast {
			padding: 12px 18px;
			border-radius: var(--radius-md);
			background: var(--bg-card);
			border: 1px solid var(--border);
			color: var(--text-primary);
			font-size: 0.85rem;
			font-weight: 500;
			backdrop-filter: blur(20px);
			box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
			animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
			max-width: 360px;
		}

		.toast--success { border-color: var(--success); }
		.toast--error { border-color: var(--error); }

		@keyframes slideIn {
			from { opacity: 0; transform: translateX(40px); }
			to { opacity: 1; transform: translateX(0); }
		}

		@media (max-width: 768px) {
			.url-row {
				grid-template-columns: 36px 1fr 90px;
			}
			.url-row > :nth-child(4) {
				display: none;
			}
			.stats-bar {
				grid-template-columns: repeat(3, 1fr);
			}
		}
	</style>
</head>
<body>
<div class="app">
	<!-- Header -->
	<header class="header">
		<div class="header__title">
			<h1>Download Media — Dev Dashboard</h1>
			<p>Batch integration testing on the local Cloudflare Worker source code</p>
		</div>
		<div class="header__badge">
			<span class="dot"></span> Running Locally
		</div>
	</header>

	<!-- Stats bar -->
	<div class="stats-bar" id="statsBar">
		<!-- Dynamic stats -->
	</div>

	<!-- Main Workspace split -->
	<div class="workspace-grid">
		<!-- Left: URL explorer & Batch runner -->
		<div class="card" style="display: flex; flex-direction: column; gap: 16px;">
			<div class="controls-bar">
				<div class="search-box">
					<span class="search-box__icon">🔍</span>
					<input type="text" id="searchInput" placeholder="Search URLs, platforms, or categories...">
				</div>
				<button class="btn-primary" onclick="openAddModal()">+ Add URL</button>
				<button class="btn-success" id="testSelectedBtn" disabled onclick="testSelected()">▶ Test Selected</button>
				<button class="btn-secondary" id="testAllBtn" style="color: var(--info); border-color: rgba(0, 229, 255, 0.3)" onclick="testAll()">⚡ Test All</button>
				<button class="btn-danger" onclick="clearResults()">✕ Clear Results</button>
			</div>

			<!-- Filter Chips -->
			<div class="filter-chips" id="filterChips">
				<!-- Loaded dynamically -->
			</div>

			<!-- Collapsible sections tree -->
			<div id="mainContent" style="display: flex; flex-direction: column; gap: 8px;">
				<!-- Filled dynamically -->
			</div>
		</div>

		<!-- Right: Live Preview & Metadata inspector -->
		<div class="card result-pane">
			<div class="card-header">
				<h3 class="card-title" id="previewTitle">
					<svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg>
					Preview Inspector
				</h3>
				<div id="previewStatusIndicator"></div>
			</div>

			<div class="empty-result" id="previewEmpty">
				<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
				<p>Select a URL row and click <strong>Test</strong> or <strong>View</strong> to inspect results and media playback.</p>
			</div>

			<div class="loader" id="previewLoader">
				<div class="spinner-large"></div>
				<p style="font-weight: 500;">Invoking <code>downloadMedia()</code> on server...</p>
				<p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">Calling pipeline and fetching from external API.</p>
			</div>

			<!-- Success Media Preview Container -->
			<div class="media-preview-container" id="previewOutput">
				<div class="preview-player" id="mediaContainer">
					<!-- Renders video/audio/photo player here -->
				</div>

				<div class="media-meta">
					<div class="meta-row">
						<span class="meta-label">Status</span>
						<span class="meta-value" id="metaStatus" style="color: var(--success);">Success</span>
					</div>
					<div class="meta-row">
						<span class="meta-label">Execution Time</span>
						<span class="meta-value" id="metaDuration">-</span>
					</div>
					<div class="meta-row">
						<span class="meta-label">Caption</span>
						<span class="meta-value" id="metaCaption">-</span>
					</div>
					<div class="meta-row">
						<span class="meta-label">Media Items Count</span>
						<span class="meta-value" id="metaCount">0</span>
					</div>
				</div>

				<div style="margin-top: 10px;">
					<label style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 6px;">Server Response JSON</label>
					<pre><code id="jsonCode">{}</code></pre>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Unsaved changes bar -->
<div class="unsaved-bar" id="unsavedBar">
	<span class="unsaved-bar__text">⚠️ You have unsaved URL edits (additions, moves, or deletions).</span>
	<button class="btn-primary" onclick="exportUrlsJson()">💾 Save to urls.json</button>
	<button class="btn-secondary" onclick="discardChanges()">Discard</button>
</div>

<!-- Add URL Modal -->
<div class="modal-overlay" id="addModal">
	<div class="modal">
		<div class="modal-header">
			<h3 style="font-weight: 600;">Add Test URLs</h3>
			<button class="close-modal" onclick="closeAddModal()">&times;</button>
		</div>
		<div class="modal-body">
			<form id="addUrlForm" onsubmit="saveNewUrl(event)">
				<div class="form-group">
					<label for="addPlatform">Platform</label>
					<select id="addPlatform" required onchange="updateCategoriesDropdown()">
						<!-- Filled dynamically -->
					</select>
				</div>

				<div class="form-group">
					<label for="addCategory">Category</label>
					<select id="addCategory" required onchange="checkNewCategoryOption()">
						<!-- Filled dynamically -->
					</select>
				</div>

				<!-- New Category Option -->
				<div id="newCategoryFields" style="display: none; padding: 10px; border-left: 2px solid var(--accent); margin-bottom: 12px; background: rgba(124, 77, 255, 0.02)">
					<div class="form-group">
						<label for="newCategoryKey">Category Key (no spaces)</label>
						<input type="text" id="newCategoryKey" placeholder="e.g. funny">
					</div>
					<div class="form-group">
						<label for="newCategoryLabel">Category Label</label>
						<input type="text" id="newCategoryLabel" placeholder="e.g. Funny Videos">
					</div>
				</div>

				<div class="form-group">
					<label for="addUrlsText">URLs (One per line)</label>
					<textarea id="addUrlsText" placeholder="https://..." required></textarea>
				</div>
				
				<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
					<button type="button" class="btn-secondary" onclick="closeAddModal()">Cancel</button>
					<button type="submit" class="btn-primary">Add URLs</button>
				</div>
			</form>
		</div>
	</div>
</div>

<!-- Move URL Modal -->
<div class="modal-overlay" id="moveModal">
	<div class="modal">
		<div class="modal-header">
			<h3 style="font-weight: 600;">Move URL</h3>
			<button class="close-modal" onclick="closeMoveModal()">&times;</button>
		</div>
		<div class="modal-body">
			<form id="moveUrlForm" onsubmit="saveMovedUrl(event)">
				<div class="form-group">
					<label>URL to Move</label>
					<input type="text" id="moveTargetUrl" readonly style="opacity: 0.6; cursor: not-allowed;">
				</div>
				<div class="form-group">
					<label for="movePlatform">Destination Platform</label>
					<select id="movePlatform" required onchange="updateMoveCategories()">
						<!-- Filled dynamically -->
					</select>
				</div>
				<div class="form-group">
					<label for="moveCategory">Destination Category</label>
					<select id="moveCategory" required>
						<!-- Filled dynamically -->
					</select>
				</div>
				
				<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
					<button type="button" class="btn-secondary" onclick="closeMoveModal()">Cancel</button>
					<button type="submit" class="btn-primary">Move URL</button>
				</div>
			</form>
		</div>
	</div>
</div>

<!-- Toast Container -->
<div class="toast-container" id="toastContainer"></div>

<script>
	let urlsState = { platforms: {} };
	let originalJSON = '';
	let testResults = {}; // url -> { status: 'pending'|'running'|'success'|'error', data: {}, timing: ms, error: string }
	let selected = new Set();
	let activeFilter = 'all';
	let searchQuery = '';

	const $ = id => document.getElementById(id);

	window.addEventListener('DOMContentLoaded', async () => {
		await fetchUrls();
	});

	async function fetchUrls() {
		try {
			// 1. Always fetch from the API first to get the most updated data from urls.json
			const res = await fetch('/api/test-urls');
			const apiUrls = await res.json();
			
			// Set original snapshot for dirty tracking
			if (!originalJSON) {
				originalJSON = JSON.stringify(apiUrls);
			}

			// 2. Load from localStorage, but self-heal if empty
			const local = localStorage.getItem('test_urls_config');
			if (local) {
				urlsState = JSON.parse(local);
				const hasPlatforms = urlsState.platforms && Object.keys(urlsState.platforms).length > 0;
				if (!hasPlatforms) {
					urlsState = apiUrls;
					localStorage.setItem('test_urls_config', JSON.stringify(urlsState));
				}
			} else {
				urlsState = apiUrls;
				localStorage.setItem('test_urls_config', JSON.stringify(urlsState));
			}

			checkDirty();
			renderAll();
		} catch (e) {
			showToast('Failed to fetch URL configuration', 'error');
		}
	}

	function checkDirty() {
		const isDirty = JSON.stringify(urlsState) !== originalJSON;
		$('unsavedBar').classList.toggle('visible', isDirty);
	}

	function renderAll() {
		renderStats();
		renderChips();
		renderTree();
		updateSelectedBtn();
		updateTestAllBtn();
	}

	// ─── Flatten list helper ─────────────────────────────────────────
	function flattenUrls() {
		const list = [];
		if (!urlsState?.platforms) return list;
		for (const [pKey, pVal] of Object.entries(urlsState.platforms)) {
			for (const [cKey, cVal] of Object.entries(pVal.categories || {})) {
				for (const url of (cVal.urls || [])) {
					list.push({ url, platform: pKey, category: cKey, categoryLabel: cVal.label });
				}
			}
		}
		return list;
	}

	function countPlatform(pKey) {
		let n = 0;
		const cats = urlsState.platforms[pKey]?.categories || {};
		for (const c of Object.values(cats)) n += (c.urls || []).length;
		return n;
	}

	function totalUrls() {
		let n = 0;
		for (const pKey of Object.keys(urlsState?.platforms || {})) n += countPlatform(pKey);
		return n;
	}

	// ─── Stats ───────────────────────────────────────────────────────
	function renderStats() {
		const total = totalUrls();
		const platforms = Object.keys(urlsState?.platforms || {}).length;
		const cats = Object.values(urlsState?.platforms || {}).reduce(
			(s, p) => s + Object.keys(p.categories || {}).length, 0
		);
		const tested = Object.keys(testResults).length;
		const passed = Object.values(testResults).filter(r => r.status === 'success').length;
		const failed = Object.values(testResults).filter(r => r.status === 'error').length;

		$('statsBar').innerHTML = \`
			<div class="stat-card"><div class="stat-card__label">Total URLs</div><div class="stat-card__value stat-card__value--accent">\${total}</div></div>
			<div class="stat-card"><div class="stat-card__label">Platforms</div><div class="stat-card__value">\${platforms}</div></div>
			<div class="stat-card"><div class="stat-card__label">Categories</div><div class="stat-card__value">\${cats}</div></div>
			<div class="stat-card"><div class="stat-card__label">Tested</div><div class="stat-card__value stat-card__value--amber">\${tested}</div></div>
			<div class="stat-card"><div class="stat-card__label">Passed</div><div class="stat-card__value stat-card__value--green">\${passed}</div></div>
			<div class="stat-card"><div class="stat-card__label">Failed</div><div class="stat-card__value stat-card__value--red">\${failed}</div></div>
		\`;
	}

	// ─── Filter Chips ────────────────────────────────────────────────
	function renderChips() {
		const ps = Object.entries(urlsState?.platforms || {})
			.map(([k, v]) => [k, v, countPlatform(k)])
			.sort((a, b) => b[2] - a[2]);

		let html = \`<button class="chip \${activeFilter === 'all' ? 'active' : ''}" onclick="selectFilter('all')">
			All <span class="chip__count">\${totalUrls()}</span></button>\`;
		
		ps.forEach(([k, v, c]) => {
			html += \`<button class="chip \${activeFilter === k ? 'active' : ''}" onclick="selectFilter('\${k}')">
				\${v.icon || '🔗'} \${v.label} <span class="chip__count">\${c}</span></button>\`;
		});
		$('filterChips').innerHTML = html;
	}

	function selectFilter(f) {
		activeFilter = f;
		renderChips();
		renderTree();
		updateTestAllBtn();
	}

	function updateTestAllBtn() {
		const btn = $('testAllBtn');
		if (!btn) return;
		if (activeFilter === 'all') {
			btn.innerHTML = '⚡ Test All';
		} else {
			const label = urlsState.platforms[activeFilter]?.label || activeFilter;
			btn.innerHTML = \`⚡ Test All \${label}\`;
		}
	}

	// ─── Render Platform Tree list ───────────────────────────────────
	function renderTree() {
		const container = $('mainContent');
		container.innerHTML = '';

		if (!urlsState.platforms || Object.keys(urlsState.platforms).length === 0) {
			container.innerHTML = '<p style="padding: 20px; color: var(--text-secondary); text-align: center;">No platforms configured.</p>';
			return;
		}

		const platforms = Object.entries(urlsState.platforms)
			.filter(([k]) => activeFilter === 'all' || k === activeFilter);

		if (platforms.length === 0) {
			container.innerHTML = '<p style="padding: 20px; color: var(--text-secondary); text-align: center;">No platforms match filter.</p>';
			return;
		}

		const sq = searchQuery.toLowerCase();

		platforms.forEach(([pKey, pVal]) => {
			const cats = Object.entries(pVal.categories || {});
			
			// Filter categories and URLs by search query
			const filteredCats = cats.map(([cKey, cVal]) => {
				const urls = (cVal.urls || []).filter(u =>
					!sq || u.toLowerCase().includes(sq) || pKey.includes(sq) || pVal.label.toLowerCase().includes(sq) || cVal.label.toLowerCase().includes(sq)
				);
				return [cKey, { ...cVal, urls }];
			}).filter(([, c]) => c.urls.length > 0);

			if (filteredCats.length === 0) return;

			const count = filteredCats.reduce((s, [, c]) => s + c.urls.length, 0);

			const secDiv = document.createElement('div');
			secDiv.className = 'platform-section';
			secDiv.id = 'sec-' + pKey;

			const header = document.createElement('div');
			header.className = 'platform-section__header';
			header.innerHTML = \`
				<div class="platform-section__icon" style="background:\${pVal.color || '#fff'}20;color:\${pVal.color || '#fff'};">\${pVal.icon || '🔗'}</div>
				<div class="platform-section__info">
					<div class="platform-section__name">\${pVal.label}</div>
					<div class="platform-section__meta">\${count} URLs • \${filteredCats.length} categories</div>
				</div>
				<span class="platform-section__toggle open">▾</span>
			\`;

			header.addEventListener('click', () => {
				body.classList.toggle('hidden');
				header.querySelector('.platform-section__toggle').classList.toggle('open');
			});

			const body = document.createElement('div');
			body.className = 'platform-section__body';

			filteredCats.forEach(([cKey, cVal]) => {
				const catGroup = document.createElement('div');
				catGroup.className = 'category-group';
				
				const label = document.createElement('div');
				label.className = 'category-group__label';
				label.innerHTML = \`\${cVal.label || cKey} <span class="cat-count">\${cVal.urls.length}</span>\`;
				catGroup.appendChild(label);

				cVal.urls.forEach((url, index) => {
					const row = document.createElement('div');
					row.className = 'url-row';

					const r = testResults[url];
					const isChecked = selected.has(url) ? 'checked' : '';
					
					let statusHtml = '<span class="status status--pending">Pending</span>';
					if (r) {
						if (r.status === 'running') {
							statusHtml = '<span class="status status--running"><span class="spinner"></span> Running</span>';
						} else if (r.status === 'success') {
							statusHtml = \`<span class="status status--success" title="Success">✓ \${r.timing}ms</span>\`;
						} else {
							statusHtml = '<span class="status status--error" title="Failed">✕ Failed</span>';
						}
					}

					row.innerHTML = \`
						<input type="checkbox" \${isChecked} data-url="\${encodeURIComponent(url)}" />
						<div class="url-cell">
							<a href="\${url}" target="_blank" rel="noopener" title="\${url}">\${url}</a>
						</div>
						<div style="display:flex; align-items:center;">\${statusHtml}</div>
						<div class="action-btns">
							<button class="action-btn" onclick="event.stopPropagation(); testOne('\${encodeURIComponent(url)}', '\${pKey}')">Test</button>
							<button class="action-btn" onclick="event.stopPropagation(); viewResult('\${encodeURIComponent(url)}')" \${r?.data ? '' : 'disabled'}>View</button>
							<button class="action-btn" onclick="event.stopPropagation(); openMoveModal('\${encodeURIComponent(url)}', '\${pKey}', '\${cKey}')">Move</button>
							<button class="action-btn action-btn--delete" onclick="event.stopPropagation(); deleteUrl('\${encodeURIComponent(url)}', '\${pKey}', '\${cKey}')">✕</button>
						</div>
					\`;

					// Checkbox change listener
					row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
						const targetUrl = decodeURIComponent(e.target.dataset.url);
						if (e.target.checked) {
							selected.add(targetUrl);
						} else {
							selected.delete(targetUrl);
						}
						updateSelectedBtn();
					});

					catGroup.appendChild(row);
				});
				body.appendChild(catGroup);
			});

			secDiv.appendChild(header);
			secDiv.appendChild(body);
			container.appendChild(secDiv);
		});

		if (container.children.length === 0) {
			container.innerHTML = '<p style="padding: 20px; color: var(--text-secondary); text-align: center;">No URLs match your search.</p>';
		}
	}

	function updateSelectedBtn() {
		const btn = $('testSelectedBtn');
		btn.disabled = selected.size === 0;
		btn.textContent = selected.size ? \`▶ Test Selected (\${selected.size})\` : '▶ Test Selected';
	}

	// ─── Test Execution Engine ───────────────────────────────────────
	async function testOne(enc, platformKey) {
		const url = decodeURIComponent(enc);
		testResults[url] = { status: 'running' };
		renderTree();
		renderStats();

		const t0 = performance.now();
		try {
			// Call the local server API endpoint that runs the actual downloadMedia pipeline
			const res = await fetch('/api/test-download', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url, mode: 'auto', platform: platformKey })
			});
			const duration = Math.round(performance.now() - t0);
			const data = await res.json();

			if (res.ok && data.status === 'success') {
				testResults[url] = { status: 'success', data, timing: duration };
				showToast(\`✓ Tested \${urlsState.platforms[platformKey]?.label || platformKey} successfully!\`, 'success');
				
				// Auto-view the successful result in the preview panel
				viewResult(enc);
			} else {
				const errMsg = data.error || 'Media download failed';
				testResults[url] = { status: 'error', error: errMsg, timing: duration, data };
				showToast(\`✕ \${urlsState.platforms[platformKey]?.label || platformKey}: \${errMsg}\`, 'error');
				
				// View failure
				viewResult(enc);
			}
		} catch (e) {
			const duration = Math.round(performance.now() - t0);
			testResults[url] = { status: 'error', error: e.message, timing: duration, data: { status: 'error', error: e.message } };
			showToast(\`✕ Network Error: \${e.message}\`, 'error');
			viewResult(enc);
		}
		renderTree();
		renderStats();
	}

	async function testBatch(items) {
		for (const { url, platform } of items) {
			await testOne(encodeURIComponent(url), platform);
			// Small delay between tests to be kind to the APIs and avoid race conditions
			await new Promise(r => setTimeout(r, 400));
		}
	}

	function testSelected() {
		const items = flattenUrls().filter(i => selected.has(i.url));
		if (items.length) {
			testBatch(items);
		}
	}

	function testAll() {
		const items = flattenUrls().filter(i => {
			if (activeFilter !== 'all' && i.platform !== activeFilter) return false;
			if (searchQuery) {
				const sq = searchQuery.toLowerCase();
				return i.url.toLowerCase().includes(sq) || i.platform.toLowerCase().includes(sq);
			}
			return true;
		});

		if (items.length === 0) {
			showToast('No URLs match active filter', 'error');
			return;
		}

		if (confirm(\`Are you sure you want to run batch tests on all \${items.length} URLs? This will take a while.\`)) {
			testBatch(items);
		}
	}

	function clearResults() {
		testResults = {};
		selected.clear();
		$('previewEmpty').style.display = 'flex';
		$('previewOutput').style.display = 'none';
		$('previewLoader').style.display = 'none';
		$('previewStatusIndicator').innerHTML = '';
		renderTree();
		renderStats();
		showToast('Results cleared');
	}

	function viewResult(enc) {
		const url = decodeURIComponent(enc);
		const r = testResults[url];
		if (!r) return;

		// Select in UI
		$('previewEmpty').style.display = 'none';
		$('previewLoader').style.display = 'none';
		
		$('previewTitle').innerHTML = \`<svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg> Preview: \${url.length > 40 ? url.slice(0, 40) + '...' : url}\`;
		
		if (r.status === 'success') {
			$('previewStatusIndicator').innerHTML = '<span style="background-color: var(--success-glow); color: var(--success); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">SUCCESS</span>';
			$('metaStatus').textContent = 'Success';
			$('metaStatus').style.color = 'var(--success)';
			$('metaDuration').textContent = r.timing + 'ms';
			$('metaCaption').innerHTML = r.data.caption || '<i>None</i>';
			$('metaCount').textContent = (r.data.media || []).length;
			
			$('jsonCode').textContent = JSON.stringify(r.data, null, 2);
			renderPreviewMedia(r.data.media || [], r.data.thumbnail);

			$('previewOutput').style.display = 'flex';
		} else {
			$('previewStatusIndicator').innerHTML = '<span style="background-color: var(--error-glow); color: var(--error); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">FAILED</span>';
			$('metaStatus').textContent = 'Failed';
			$('metaStatus').style.color = 'var(--error)';
			$('metaDuration').textContent = r.timing + 'ms';
			$('metaCaption').innerHTML = \`<span style="color: var(--error);">\${r.error || 'No media found'}</span>\`;
			$('metaCount').textContent = '0';
			
			$('jsonCode').textContent = JSON.stringify(r.data || { error: r.error }, null, 2);
			$('mediaContainer').innerHTML = \`
				<div style="text-align: center; color: var(--text-muted); padding: 20px;">
					<div style="font-size: 2.5rem; margin-bottom: 8px;">❌</div>
					<p style="font-weight: 500; color: var(--text-primary); font-size: 0.9rem;">API Error Response</p>
					<p style="font-size: 0.75rem; max-width: 280px; margin: 4px auto; word-break: break-all; color: var(--error);">\${r.error || 'Download failed'}</p>
				</div>
			\`;
			$('previewOutput').style.display = 'flex';
		}
	}

	function renderPreviewMedia(mediaList, thumbnail) {
		const container = $('mediaContainer');
		container.innerHTML = '';

		if (mediaList.length === 0) {
			container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">No media files returned in result.</div>';
			return;
		}

		const primary = mediaList[0];
		
		if (primary.type === 'video') {
			container.innerHTML = \`<video src="\${primary.url}" controls poster="\${thumbnail || ''}"></video>\`;
		} else if (primary.type === 'audio') {
			container.innerHTML = \`
				<div style="width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: var(--bg-card); padding: 20px; border-radius: var(--radius-sm);">
					<audio src="\${primary.url}" controls></audio>
					<span style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 10px;">Audio stream (Quality: \${primary.quality || 'N/A'})</span>
				</div>
			\`;
		} else if (primary.type === 'photo') {
			container.innerHTML = \`<img src="\${primary.url}" class="preview-image" alt="Photo Preview">\`;
		} else {
			container.innerHTML = \`
				<div class="doc-preview">
					<div class="doc-icon">📁</div>
					<div style="font-weight: 600; text-align: center; font-size: 0.85rem;">\${primary.type.toUpperCase()} File</div>
					<a href="\${primary.url}" target="_blank" class="btn-primary" style="text-decoration: none; padding: 6px 12px; font-size: 0.75rem; border-radius: var(--radius-sm);">
						Open direct file link
					</a>
				</div>
			\`;
		}
	}

	// ─── CRUD Actions ────────────────────────────────────────────────
	function deleteUrl(enc, platformKey, catKey) {
		try {
			const url = decodeURIComponent(enc);
			const platform = urlsState.platforms[platformKey];
			if (platform && platform.categories?.[catKey]?.urls) {
				const urls = platform.categories[catKey].urls;
				const index = urls.indexOf(url);
				if (index > -1) {
					urls.splice(index, 1);
					selected.delete(url);
					showToast('Removed URL locally');
					saveLocalState();
				}
			}
		} catch (e) {
			showToast('Could not remove URL', 'error');
		}
	}

	function discardChanges() {
		if (confirm('Discard all unsaved edits and reload from disk?')) {
			urlsState = JSON.parse(originalJSON);
			localStorage.setItem('test_urls_config', originalJSON);
			checkDirty();
			renderAll();
			showToast('Edits discarded');
		}
	}

	function saveLocalState() {
		localStorage.setItem('test_urls_config', JSON.stringify(urlsState));
		checkDirty();
		renderAll();
	}

	async function exportUrlsJson() {
		try {
			const res = await fetch('/api/test-urls', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(urlsState)
			});
			const result = await res.json();
			if (result.success) {
				originalJSON = JSON.stringify(urlsState);
				checkDirty();
				showToast('Saved changes to test/urls.json successfully!', 'success');
			} else {
				showToast(result.message || 'Write permission denied', 'error');
				triggerDownloadJson();
			}
		} catch (e) {
			showToast('Could not save to server. Downloading file...', 'error');
			triggerDownloadJson();
		}
	}

	function triggerDownloadJson() {
		const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(urlsState, null, 2));
		const downloadAnchor = document.createElement('a');
		downloadAnchor.setAttribute("href", dataStr);
		downloadAnchor.setAttribute("download", "urls.json");
		document.body.appendChild(downloadAnchor);
		downloadAnchor.click();
		downloadAnchor.remove();
	}

	// ─── Dynamic Platform Population ─────────────────────────────────
	function populatePlatformSelect(selectEl, selectedKey) {
		selectEl.innerHTML = Object.entries(urlsState.platforms).map(([k, v]) =>
			\`<option value="\${k}" \${k === selectedKey ? 'selected' : ''}>\${v.icon || '🔗'} \${v.label}</option>\`
		).join('');
	}

	const categoryTemplates = {
		twitter: { posts: 'Posts & Tweets', media: 'Media & Videos', proxies: 'Proxy / Mirror URLs' },
		youtube: { short: 'Short Links (youtu.be)', full: 'Full URLs (youtube.com)' },
		instagram: { reels: 'Reels', stories: 'Stories', proxies: 'Proxy / Mirror URLs' },
		facebook: { reels: 'Reels', videos: 'Shared Videos', posts: 'Posts & Shares' },
		tiktok: { short: 'Short Links (vt.tiktok)' },
		spotify: { tracks: 'Tracks' },
		threads: { posts: 'Posts & Threads', media: 'Media' },
		pinterest: { pins: 'Pins & Images' },
		soundcloud: { tracks: 'Tracks & Songs' },
		github: { repos: 'Repositories', paths: 'Specific Paths' },
		linkedin: { media: 'Media & Images' },
		telegram: { files: 'Files & Images' },
		other: { audio: 'Audio Files', downloads: 'Direct Downloads', misc: 'Miscellaneous' }
	};

	function openAddModal() {
		$('addUrlsText').value = '';
		$('newCategoryKey').value = '';
		$('newCategoryLabel').value = '';
		populatePlatformSelect($('addPlatform'));
		$('addModal').classList.add('visible');
		updateCategoriesDropdown();
	}

	function closeAddModal() {
		$('addModal').classList.remove('visible');
	}

	function updateCategoriesDropdown() {
		const platform = $('addPlatform').value;
		const categorySelect = $('addCategory');
		categorySelect.innerHTML = '';

		const categories = urlsState.platforms[platform]?.categories || categoryTemplates[platform] || {};
		for (const [key, cat] of Object.entries(categories)) {
			const label = typeof cat === 'string' ? cat : (cat.label || key);
			const opt = document.createElement('option');
			opt.value = key;
			opt.textContent = label;
			categorySelect.appendChild(opt);
		}

		// Add custom category option
		const customOpt = document.createElement('option');
		customOpt.value = '__new__';
		customOpt.textContent = '+ New Category';
		categorySelect.appendChild(customOpt);

		checkNewCategoryOption();
	}

	function checkNewCategoryOption() {
		const isNew = $('addCategory').value === '__new__';
		$('newCategoryFields').style.display = isNew ? 'block' : 'none';
	}

	function saveNewUrl(e) {
		e.preventDefault();
		const platform = $('addPlatform').value;
		let categoryKey = $('addCategory').value;
		const rawUrls = $('addUrlsText').value.trim();

		if (!rawUrls) return;
		const urls = rawUrls.split('\\n').map(u => u.trim()).filter(Boolean);

		if (urls.length === 0) return;

		// Ensure platform exists
		if (!urlsState.platforms[platform]) {
			urlsState.platforms[platform] = {
				label: platform.charAt(0).toUpperCase() + platform.slice(1),
				icon: '🔗',
				categories: {}
			};
		}

		// Handle custom category
		if (categoryKey === '__new__') {
			const customKey = $('newCategoryKey').value.trim().toLowerCase();
			const customLabel = $('newCategoryLabel').value.trim();
			if (!customKey || !customLabel) {
				showToast('Please specify category key and label', 'error');
				return;
			}
			if (urlsState.platforms[platform].categories[customKey]) {
				showToast('Category key already exists', 'error');
				return;
			}
			urlsState.platforms[platform].categories[customKey] = { label: customLabel, urls: [] };
			categoryKey = customKey;
		}

		const cat = urlsState.platforms[platform].categories[categoryKey];
		let addedCount = 0;
		urls.forEach(url => {
			if (!cat.urls.includes(url)) {
				cat.urls.push(url);
				addedCount++;
			}
		});

		showToast(\`Added \${addedCount} URL(s) locally\`);
		saveLocalState();
		closeAddModal();
	}

	// ─── Modals: Move URL ────────────────────────────────────────────
	let moveTargetContext = null; // { url, fromPlatform, fromCategory }

	function openMoveModal(enc, pKey, cKey) {
		const url = decodeURIComponent(enc);
		moveTargetContext = { url, fromPlatform: pKey, fromCategory: cKey };
		
		$('moveTargetUrl').value = url;
		populatePlatformSelect($('movePlatform'), pKey);
		updateMoveCategories();
		$('moveModal').classList.add('visible');
	}

	function closeMoveModal() {
		$('moveModal').classList.remove('visible');
		moveTargetContext = null;
	}

	// Update categories for move destination
	function updateMoveCategories() {
		const pKey = $('movePlatform').value;
		const catSelect = $('moveCategory');
		catSelect.innerHTML = '';

		const categories = urlsState.platforms[pKey]?.categories || {};
		for (const [key, cat] of Object.entries(categories)) {
			const opt = document.createElement('option');
			opt.value = key;
			opt.textContent = cat.label || key;
			catSelect.appendChild(opt);
		}
	}

	function saveMovedUrl(e) {
		e.preventDefault();
		if (!moveTargetContext) return;

		const { url, fromPlatform, fromCategory } = moveTargetContext;
		const toPlatform = $('movePlatform').value;
		const toCategory = $('moveCategory').value;

		if (fromPlatform === toPlatform && fromCategory === toCategory) {
			showToast('URL is already in that category', 'error');
			return;
		}

		// Remove from source
		const srcUrls = urlsState.platforms[fromPlatform].categories[fromCategory].urls;
		const idx = srcUrls.indexOf(url);
		if (idx > -1) srcUrls.splice(idx, 1);

		// Add to dest
		if (!urlsState.platforms[toPlatform]) {
			urlsState.platforms[toPlatform] = {
				label: toPlatform.charAt(0).toUpperCase() + toPlatform.slice(1),
				icon: '🔗',
				categories: {}
			};
		}
		if (!urlsState.platforms[toPlatform].categories[toCategory]) {
			urlsState.platforms[toPlatform].categories[toCategory] = { label: toCategory, urls: [] };
		}
		const dstUrls = urlsState.platforms[toPlatform].categories[toCategory].urls;
		if (!dstUrls.includes(url)) {
			dstUrls.push(url);
		}

		showToast('URL moved successfully');
		saveLocalState();
		closeMoveModal();
	}

	// ─── Search ──────────────────────────────────────────────────────
	$('searchInput').addEventListener('input', e => {
		searchQuery = e.target.value;
		renderTree();
	});

	// ─── Toast Messaging ─────────────────────────────────────────────
	function showToast(message, type = 'info') {
		const container = $('toastContainer');
		const el = document.createElement('div');
		el.className = \`toast toast--\${type}\`;
		el.textContent = message;
		container.appendChild(el);
		setTimeout(() => el.remove(), 4000);
	}
</script>
</body>
</html>`;

	return c.html(html);
}
