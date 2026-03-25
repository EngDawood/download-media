// Extends the auto-generated Cloudflare.Env with secrets not captured by `wrangler types`.
// Add any Cloudflare secret (set via `wrangler secret put`) here.
declare namespace Cloudflare {
	interface Env {
		TELEGRAPH_ACCESS_TOKEN: string;
		TELEGRAM_WEBHOOK_SECRET?: string;
	}
}
