/**
 * Failure classification shared by every download path — btch, RSSHub, FxTwitter, GitHub.
 *
 * Detection is deliberately positive-only: a failure is only `timeout` or `rate_limited`
 * when we can prove it from the error itself. Anything unrecognised falls through to
 * `gone`, which never auto-retries. Guessing "transient" on an unknown failure means
 * re-running a 20s extraction against a link that was never going to work.
 */

export type FailureKind = 'timeout' | 'rate_limited' | 'gone' | 'unsupported';

/**
 * Most-permanent-wins ranking, used when several backends fail with different reasons.
 * A definitive "this does not exist" from one server outranks three that merely timed
 * out — the 404 is real information, the timeouts are noise.
 */
const PERMANENCE: Record<FailureKind, number> = {
	gone: 3,
	unsupported: 2,
	rate_limited: 1,
	timeout: 0,
};

/** Error carrying a classification decided at the throw site, where the context still exists. */
export class DownloadError extends Error {
	readonly kind: FailureKind;

	constructor(message: string, kind: FailureKind) {
		super(message);
		this.name = 'DownloadError';
		this.kind = kind;
	}
}

/** True when an error came from an aborted/timed-out fetch (cold extraction taking too long). */
export function isTimeoutError(err: unknown): boolean {
	const name = (err as Error)?.name ?? '';
	const msg = ((err as Error)?.message ?? '').toLowerCase();
	return name === 'TimeoutError' || name === 'AbortError' || msg.includes('aborted') || msg.includes('timeout');
}

/**
 * Map an HTTP status onto a category.
 * 5xx counts as `rate_limited` rather than `gone`: an unhealthy backend is a statement
 * about the service, not about the link. It still does not auto-retry (the whole fleet
 * is raced in parallel already), but it earns the "service busy" message instead of
 * telling the user their link is dead.
 */
export function kindFromStatus(status: number): FailureKind {
	if (status === 404 || status === 410) return 'gone';
	if (status === 429) return 'rate_limited';
	if (status >= 500) return 'rate_limited';
	return 'gone';
}

/** Reduce several observed failures to the one worth reporting. Empty input means we learned nothing. */
export function mostPermanent(kinds: FailureKind[]): FailureKind {
	if (kinds.length === 0) return 'gone';
	return kinds.reduce((worst, kind) => (PERMANENCE[kind] > PERMANENCE[worst] ? kind : worst));
}

/**
 * Classify any thrown value. `DownloadError` answers for itself; an `AggregateError`
 * (every `Promise.any` race in the codebase throws one) is resolved by permanence.
 */
export function classifyError(err: unknown): FailureKind {
	if (err instanceof DownloadError) return err.kind;
	if (err instanceof AggregateError) return mostPermanent(err.errors.map(classifyError));
	if (isTimeoutError(err)) return 'timeout';
	return 'gone';
}

/**
 * Only `timeout` is worth a second attempt. `rate_limited` is not: `btchFetch` already
 * races all four backends, so a limit response means the fleet is throttling and an
 * immediate retry hits the same wall after burning another full timeout budget.
 */
export function isRetryable(kind: FailureKind): boolean {
	return kind === 'timeout';
}
