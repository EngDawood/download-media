import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

describe('Download Media Bot', () => {
	describe('request for /health', () => {
		it('responds with ok: true (unit style)', async () => {
			const request = new Request<unknown, IncomingRequestCfProperties>('http://example.com/health');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(await response.json()).toEqual({ ok: true });
		});

		it('responds with ok: true (integration style)', async () => {
			const request = new Request('http://example.com/health');
			const response = await SELF.fetch(request);
			expect(await response.json()).toEqual({ ok: true });
		});
	});

	describe('request for /telegram (unauthorized)', () => {
		it('returns 401 if secret is missing', async () => {
			const request = new Request('http://example.com/telegram', {
				method: 'POST',
				body: JSON.stringify({}),
			});
			const response = await worker.fetch(request, env, createExecutionContext());
			// If TELEGRAM_WEBHOOK_SECRET is set in env, it should return 401
			if (env.TELEGRAM_WEBHOOK_SECRET) {
				expect(response.status).toBe(401);
			} else {
				// Otherwise it might proceed or fail elsewhere
				expect(response.status).toBe(200);
			}
		});
	});
});
