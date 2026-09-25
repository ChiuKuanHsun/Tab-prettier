/**
 * UI strings. Plain objects rather than chrome.i18n, so the same lookup works in pages, the
 * service worker and tests. Only zh-TW exists for now; another locale is a `Messages` object.
 */
import { zhTW, type Messages } from './zh-TW';

export type { Messages };

/** Dotted paths to every string leaf, e.g. 'options.look.rotation'. */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;

export type Params = Record<string, string | number>;

const messages: Messages = zhTW;

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
