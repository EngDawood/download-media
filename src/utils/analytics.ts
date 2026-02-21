export type AnalyticsAction = 'download_success' | 'download_error' | 'download_empty' | 'gate_blocked';

export interface AnalyticsEvent {
	userId: number;
	platform: string;
	userType: 'admin' | 'guest';
	action: AnalyticsAction;
}

/**
 * Write a single event to the Analytics Engine dataset (fire-and-forget).
 * Blobs: [platform, userType, action, userId]
 * Index: action (for efficient filtering)
 */
export function trackEvent(analytics: AnalyticsEngineDataset | undefined, event: AnalyticsEvent): void {
	if (!analytics) return;
	try {
		analytics.writeDataPoint({
			blobs: [event.platform, event.userType, event.action, String(event.userId)],
			indexes: [event.action],
		});
	} catch (e) {
		console.warn('[ANALYTICS] writeDataPoint failed:', e);
	}
}
