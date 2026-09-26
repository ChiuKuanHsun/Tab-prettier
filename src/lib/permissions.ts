/**
 * Optional host permissions. Most APIs and image CDNs the extension uses allow cross-origin
 * requests, so they need no permission at all; these don't (for an extension's origin), so Chrome
 * asks only when the feature is actually used (and installing shows no site-access warning).
 */
import { useEffect, useState } from 'preact/hooks';
import type { Settings } from './types';

/** Wallhaven's search API (its image server w.wallhaven.cc allows cross-origin requests). */
export const WALLHAVEN = ['https://wallhaven.cc/*'];
/** Danbooru's API and image server (cdn.donmai.us); the image server rejects extension origins. */
export const DANBOORU = ['https://*.donmai.us/*'];
/** Google's search suggestions. */
export const SUGGEST = ['https://suggestqueries.google.com/*'];

/** Image sources that only work once their sites are allowed. */
export const SOURCE_HOSTS = { wallhaven: WALLHAVEN, danbooru: DANBOORU } as const;
export type HostSource = keyof typeof SOURCE_HOSTS;
export const HOST_SOURCES = Object.keys(SOURCE_HOSTS) as HostSource[];

/** The switched-on sources whose sites Chrome hasn't allowed yet. */
export async function blockedSources(src: Settings['sources']): Promise<HostSource[]> {
  const on = HOST_SOURCES.filter((k) => src[k]);
  const ok = await Promise.all(on.map((k) => hasHosts([...SOURCE_HOSTS[k]])));
  return on.filter((_, i) => !ok[i]);
}

export const hasHosts = (origins: string[]) => chrome.permissions.contains({ origins });

/** Asks Chrome for the hosts; must run from a click or key press. False when declined. */
export const requestHosts = (origins: string[]) => chrome.permissions.request({ origins }).catch(() => false);

/** Whether the hosts are allowed (undefined while checking), kept up to date when that changes. */
export function useHosts(origins: string[]): boolean | undefined {
  const [ok, setOk] = useState<boolean>();
  const key = origins.join(' ');
  useEffect(() => {
    let alive = true;
    const check = () => void hasHosts(origins).then((v) => alive && setOk(v));
    check();
    chrome.permissions.onAdded.addListener(check);
    chrome.permissions.onRemoved.addListener(check);
    return () => {
      alive = false;
      chrome.permissions.onAdded.removeListener(check);
      chrome.permissions.onRemoved.removeListener(check);
    };
  }, [key]);
  return ok;
}
