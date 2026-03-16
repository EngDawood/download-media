import { en, type TranslationKey, type Translations } from './en';
import { ar } from './ar';
import type { Context } from 'grammy';
import { CACHE_PREFIX_USER_LANG } from '../constants';

export type Locale = 'en' | 'ar';
export const SUPPORTED_LOCALES: Locale[] = ['en', 'ar'];
export const DEFAULT_LOCALE: Locale = 'en';

const LOCALE_NAMES: Record<Locale, string> = { en: 'English', ar: 'العربية' };
const locales: Record<Locale, Translations> = { en, ar };

/**
 * Translate a key with optional interpolation.
 * {varName} in the template is replaced with params.varName.
 * Falls back: requested locale → English → raw key.
 */
export function t(
	locale: Locale,
	key: TranslationKey,
	params?: Record<string, string | number>,
): string {
	const template = locales[locale]?.[key] ?? locales[DEFAULT_LOCALE][key] ?? key;
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}

/**
 * Resolve locale for a user: KV preference > Telegram language_code > default.
 */
export async function resolveLocale(
	kv: KVNamespace,
	userId: number,
	telegramLangCode?: string,
): Promise<Locale> {
	const stored = await kv.get(`${CACHE_PREFIX_USER_LANG}${userId}`);
	if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
		return stored as Locale;
	}
	if (telegramLangCode) {
		const tgLocale = telegramLangCode.split('-')[0] as Locale;
		if (SUPPORTED_LOCALES.includes(tgLocale)) return tgLocale;
	}
	return DEFAULT_LOCALE;
}

/** Read locale from context (set by middleware). */
export function getLocale(ctx: Context): Locale {
	return (ctx as any).locale ?? DEFAULT_LOCALE;
}

/** Get the display name for a locale. */
export function localeName(locale: Locale): string {
	return LOCALE_NAMES[locale];
}

export type { TranslationKey };
