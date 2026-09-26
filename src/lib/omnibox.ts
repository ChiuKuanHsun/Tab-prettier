/**
 * Address-bar-like suggestions for the new tab's search box, from what an extension may read:
 * the browsing history (sites visited, and past searches taken from search result pages) and the
 * open tabs, next to Google's suggestions. Chrome's own ranking isn't available to extensions, so
 * this ranks by how well the text matches, how often and how recently a page was visited.
 */

export interface Visit { url: string; title?: string; visitCount?: number; typedCount?: number; lastVisitTime?: number }
export interface OpenTab { id: number; windowId: number; url: string; title: string }

export type Suggestion =
  | { kind: 'url'; url: string; title: string }
  | { kind: 'tab'; url: string; title: string; tabId: number; windowId: number }
  | { kind: 'past'; text: string }
  | { kind: 'suggest'; text: string };

/** How many of each kind, most first: sites, open tabs, past searches; Google fills up to TOTAL. */
const SITES = 3, TABS = 2, PAST = 3, TOTAL = 8;

const web = (url: string) => /^https?:\/\//i.test(url);
/** "https://www.youtube.com/watch?v=1" → "youtube.com/watch?v=1", as the address bar shows it. */
export const displayUrl = (url: string) => url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** The words searched for, when the URL is a results page of a search engine people use here. */
export function searchedFor(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const param =
    /^google\.[a-z.]+$/.test(host) && u.pathname === '/search' ? 'q'
    : host === 'bing.com' && u.pathname === '/search' ? 'q'
    : host === 'duckduckgo.com' ? 'q'
    : (host === 'youtube.com' || host === 'm.youtube.com') && u.pathname === '/results' ? 'search_query'
    : host === 'search.bilibili.com' ? 'keyword'
    : undefined;
  return (param && u.searchParams.get(param)?.trim()) || undefined;
}

/** How well a page matches what's typed: the start of its site best, then of its address, then words in it. */
function matchQuality(v: Visit, typed: string): number {
  const host = hostOf(v.url);
  const shown = displayUrl(v.url).toLowerCase();
  if (host.startsWith(typed)) return 3;
  if (shown.startsWith(typed)) return 2.5;
  const words = `${shown} ${v.title ?? ''}`.toLowerCase().split(/[\s/.?=&_-]+/);
  if (words.some((w) => w.startsWith(typed))) return 1.5;
  return shown.includes(typed) || (v.title ?? '').toLowerCase().includes(typed) ? 1 : 0;
}

/** Visited pages worth suggesting for the text: matching, then often and recently visited, shorter first. */
export function rankSites(visits: Visit[], text: string, now = Date.now()): Visit[] {
  const typed = text.trim().toLowerCase();
  if (!typed) return [];
  const score = (v: Visit) => {
    const m = matchQuality(v, typed);
    if (!m) return 0;
    const freq = Math.log2(1 + (v.visitCount ?? 0) + 2 * (v.typedCount ?? 0));
    const days = (now - (v.lastVisitTime ?? 0)) / 86_400_000;
    return m * (1 + freq) * (0.5 + 1 / (1 + days / 30)) - displayUrl(v.url).length * 0.001;
  };
  return visits
    .filter((v) => web(v.url) && !searchedFor(v.url))
    .map((v) => [v, score(v)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v);
}

/**
 * The site to complete the text to in the box, like the address bar does: one whose name starts
 * with what's typed and that the user has typed in before or visits often. None while the text
 * has spaces (that's a search).
 */
export function inlineCompletion(visits: Visit[], text: string): { display: string; url: string } | undefined {
  const typed = text.toLowerCase();
  if (!typed || /\s/.test(typed)) return undefined;
  const sites = new Map<string, { weight: number; url: string }>();
  for (const v of visits) {
    if (!web(v.url) || searchedFor(v.url)) continue;
    const host = hostOf(v.url);
    if (!host.startsWith(typed) || host === typed) continue;
    const weight = (v.visitCount ?? 0) + 5 * (v.typedCount ?? 0);
    const scheme = v.url.toLowerCase().startsWith('http://') ? 'http' : 'https';
    const known = sites.get(host);
    sites.set(host, { weight: (known?.weight ?? 0) + weight, url: known?.url ?? `${scheme}://${new URL(v.url).host}/` });
  }
  const best = [...sites].filter(([, s]) => s.weight >= 5).sort((a, b) => b[1].weight - a[1].weight)[0];
  return best && { display: best[0], url: best[1].url };
}

/** Earlier searches that start with (or contain a word starting with) the text, latest first. */
export function pastSearches(visits: Visit[], text: string): string[] {
  const typed = text.trim().toLowerCase();
  if (!typed) return [];
  const seen = new Map<string, { text: string; at: number }>();
  for (const v of visits) {
    const q = searchedFor(v.url);
    if (!q) continue;
    const low = q.toLowerCase();
    if (low === typed || !(low.startsWith(typed) || low.split(/\s+/).some((w) => w.startsWith(typed)))) continue;
    const at = v.lastVisitTime ?? 0;
    if ((seen.get(low)?.at ?? -1) < at) seen.set(low, { text: q, at });
  }
  return [...seen.values()].sort((a, b) => b.at - a.at).map((s) => s.text);
}

/** Open web tabs whose title or address has the text (not this one). */
export function matchTabs(tabs: OpenTab[], text: string, currentId?: number): OpenTab[] {
  const typed = text.trim().toLowerCase();
  if (!typed) return [];
  return tabs.filter((t) => t.id !== currentId && web(t.url) && `${displayUrl(t.url)} ${t.title}`.toLowerCase().includes(typed));
}

/** Everything for the list, in the address bar's spirit: sites, tabs, past searches, then Google's. */
export function composeSuggestions(
  text: string,
  data: { visits?: Visit[]; tabs?: OpenTab[]; currentTabId?: number; google?: string[] },
): Suggestion[] {
  const tabs = matchTabs(data.tabs ?? [], text, data.currentTabId).slice(0, TABS);
  const open = new Set(tabs.map((t) => t.url));
  const sites = rankSites(data.visits ?? [], text)
    .filter((v) => !open.has(v.url))
    .slice(0, SITES);
  const past = pastSearches(data.visits ?? [], text).slice(0, PAST);
  const typed = text.trim().toLowerCase();
  const taken = new Set([typed, ...past.map((p) => p.toLowerCase())]);
  const out: Suggestion[] = [
    ...sites.map((v) => ({ kind: 'url' as const, url: v.url, title: v.title || displayUrl(v.url) })),
    ...tabs.map((t) => ({ kind: 'tab' as const, url: t.url, title: t.title, tabId: t.id, windowId: t.windowId })),
    ...past.map((p) => ({ kind: 'past' as const, text: p })),
  ];
  for (const g of data.google ?? []) {
    if (out.length >= TOTAL) break;
    if (!taken.has(g.toLowerCase())) out.push({ kind: 'suggest', text: g });
  }
  return out;
}

/** "youtube.com" or "example.org/path" typed without a scheme: an address, not a search. */
export const looksLikeAddress = (text: string) => /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i.test(text) && !/\s/.test(text);
