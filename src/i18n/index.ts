/**
 * UI strings. Plain objects rather than chrome.i18n, so the same lookup works in pages, the
 * service worker and tests, and the user can pick a language other than Chrome's. zh-TW is the
 * source of truth for keys; each other locale is a `Messages` object.
 */
import { en } from './en';
import { zhTW, type Messages } from './zh-TW';

export type { Messages };

export type Locale = 'zh-TW' | 'en';
/** The user's choice: follow Chrome's language, or a fixed one. */
export type LocalePref = 'auto' | Locale;

const MESSAGES: Record<Locale, Messages> = { 'zh-TW': zhTW, en };
const PREF_KEY = 'uiLanguage';

/** Chrome's UI language mapped to ours: any Chinese → Traditional Chinese, anything else → English. */
export function browserLocale(): Locale {
  const lang = globalThis.chrome?.i18n?.getUILanguage?.() ?? globalThis.navigator?.language ?? 'en';
  return lang.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en';
}

/** The language in use, e.g. for date formatting. */
export let locale: Locale;
let messages: Messages;

/** Switches the language in this context only (tests; saveLocalePref for the user's choice). */
export function applyPref(pref: LocalePref | undefined) {
  locale = pref === 'zh-TW' || pref === 'en' ? pref : browserLocale();
  messages = MESSAGES[locale];
}

// Pages and the offscreen document share the extension's localStorage, so they know the choice
// before any module builds its labels; the service worker has none and calls loadLocalePref.
function storedPref(): LocalePref | undefined {
  try {
    return (globalThis.localStorage?.getItem(PREF_KEY) as LocalePref | null) ?? undefined;
  } catch {
    return undefined;
  }
}
applyPref(storedPref());

export const localePref = (): LocalePref => storedPref() ?? 'auto';

/** For <html lang>: fonts and screen readers follow it. */
export const htmlLang = () => (locale === 'en' ? 'en' : 'zh-Hant');

/** Saves the choice for every context; pages reload afterwards so module-level labels follow. */
export async function saveLocalePref(pref: LocalePref) {
  localStorage.setItem(PREF_KEY, pref);
  await chrome.storage.local.set({ [PREF_KEY]: pref });
  applyPref(pref);
}

/** For the service worker (no localStorage): reads the choice before it writes any text. */
export async function loadLocalePref() {
  const got = await chrome.storage.local.get(PREF_KEY);
  applyPref(got[PREF_KEY] as LocalePref | undefined);
}

/** Dotted paths to every string leaf, e.g. 'options.look.rotation'. */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;

export type Params = Record<string, string | number>;

function lookup(key: MessageKey): string {
  let v: unknown = messages;
  for (const k of key.split('.')) v = (v as Record<string, unknown>)[k];
  return v as string;
}

/** The message for `key`, with `{name}` placeholders filled from `params` (unknown ones kept). */
export function t(key: MessageKey, params?: Params): string {
  const s = lookup(key);
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

/**
 * Like `t`, but placeholders may be filled with markup (links, <code>…): returns the message
 * split into text and the given parts, ready to render as children.
 */
export function tRich<T>(key: MessageKey, parts: Record<string, T | string | number>): (T | string | number)[] {
  return lookup(key)
    .split(/\{(\w+)\}/)
    .map((seg, i) => (i % 2 ? (seg in parts ? parts[seg] : `{${seg}}`) : seg))
    .filter((seg) => seg !== '');
}
