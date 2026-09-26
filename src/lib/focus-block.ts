/**
 * Distracting sites during a focus (work) round, gently: sites on the "stop first" list show the
 * time left with a one-click way on (allowed for the rest of the round); sites on the "remind"
 * list keep working with a small timer in a corner; tabs playing sound are left alone (music to
 * work to). An entry starting with "-" exempts a site, e.g. "-music.youtube.com".
 *
 * The extension may only look at a site once the user allows it, so each site is an optional
 * host permission, asked for when it's added; a tiny content script on the allowed sites asks
 * the service worker what to do. (declarativeNetRequest can't be optional and would warn at
 * install.)
 */
import type { FocusState } from './focus';

export const DEFAULT_BLOCK_SITES = ['youtube.com', '-music.youtube.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'reddit.com'];

/** "https://www.YouTube.com/watch?v=…" → "youtube.com"; undefined when it isn't a site name. */
export function normalizeSite(input: string): string | undefined {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^(\*\.|www\.)/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : undefined;
}

/** The entries in what the user typed (commas, spaces or new lines between them), each once. */
export function parseSites(text: string): string[] {
  const entries = text.split(/[\s,，、]+/).map((raw) => {
    const except = raw.trim().startsWith('-');
    const site = normalizeSite(raw.trim().replace(/^-/, ''));
    return site && (except ? `-${site}` : site);
  });
  return [...new Set(entries.filter((s): s is string => !!s))];
}

/** The sites an entry list watches (exceptions left out). */
export const watchedSites = (entries: string[]) => entries.filter((e) => !e.startsWith('-'));

/** Match pattern for a site and its subdomains ("*.example.com" includes example.com itself). */
export const sitePattern = (site: string) => `*://*.${site}/*`;

const covers = (host: string, site: string) => host === site || host.endsWith(`.${site}`);

export type SiteMode = 'block' | 'remind';

/**
 * How a URL is treated: the entry that covers it and its list, or undefined when it isn't
 * listed or an exception ("-site", in either list) covers it. The stop list wins over reminding.
 */
export function siteRule(url: string, block: string[], remind: string[]): { site: string; mode: SiteMode } | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if ([...block, ...remind].some((e) => e.startsWith('-') && covers(host, e.slice(1)))) return undefined;
  const hit = (list: string[]) => watchedSites(list).find((s) => covers(host, s));
  const b = hit(block);
  if (b) return { site: b, mode: 'block' };
  const r = hit(remind);
  return r ? { site: r, mode: 'remind' } : undefined;
}

/** Only a running focus round counts: not a break, and not while paused. */
export const blockingNow = (f: FocusState, now = Date.now()) => f.status === 'running' && f.phase === 'work' && f.endAt > now;

/** The sites Chrome hasn't allowed yet (those are left alone). */
export async function unallowedSites(sites: string[]): Promise<string[]> {
  const ok = await Promise.all(sites.map((s) => chrome.permissions.contains({ origins: [sitePattern(s)] })));
  return sites.filter((_, i) => !ok[i]);
}

// "Continue anyway" lasts for the rest of the round: kept in session storage (gone when Chrome
// closes) and cleared by the service worker when the round ends or is stopped.
const ALLOWED_KEY = 'focusAllowed';

export async function allowedThisRound(): Promise<string[]> {
  const got = await chrome.storage.session.get(ALLOWED_KEY);
  return (got[ALLOWED_KEY] as string[] | undefined) ?? [];
}

export async function allowForRound(site: string) {
  const sites = await allowedThisRound();
  if (!sites.includes(site)) await chrome.storage.session.set({ [ALLOWED_KEY]: [...sites, site] });
}

export const clearAllowed = () => chrome.storage.session.remove(ALLOWED_KEY);
