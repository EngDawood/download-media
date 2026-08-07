type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, tag: string, msg: string, meta?: Record<string, unknown>): void {
	const entry = { level, tag, msg, ts: Date.now(), ...meta };
	if (level === 'error') console.error(JSON.stringify(entry));
	else console.warn(JSON.stringify(entry));
}
