/**
 * Sites blocked while a focus (work) round runs. The extension may only look at a site once the
 * user allows it, so each blocked site is an optional host permission, asked for when it's added;
 * a tiny content script on the allowed sites asks the service worker whether to send the tab to
 * the blocked page. (declarativeNetRequest can't be optional and would warn at install.)
 */
import type { FocusState } from './focus';

export const DEFAULT_BLOCK_SITES = ['youtube.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'reddit.com'];

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

/** The sites in what the user typed (commas, spaces or new lines between them), each once. */
export function parseSites(text: string): string[] {
  const sites = text.split(/[\s,，、]+/).map(normalizeSite).filter((s): s is string => !!s);
  return [...new Set(sites)];
}

/** Match pattern for a site and its subdomains ("*.example.com" includes example.com itself). */
export const sitePattern = (site: string) => `*://*.${site}/*`;

/** Whether the URL is on one of the sites or a subdomain of one. */
export function isBlockedUrl(url: string, sites: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return sites.some((s) => host === s || host.endsWith(`.${s}`));
}

/** Only a running focus round blocks: not a break, and not while paused. */
export const blockingNow = (f: FocusState, now = Date.now()) => f.status === 'running' && f.phase === 'work' && f.endAt > now;

/** The sites Chrome hasn't allowed yet (those can't be blocked). */
export async function unallowedSites(sites: string[]): Promise<string[]> {
  const ok = await Promise.all(sites.map((s) => chrome.permissions.contains({ origins: [sitePattern(s)] })));
  return sites.filter((_, i) => !ok[i]);
}
