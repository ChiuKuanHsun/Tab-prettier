/**
 * Optional permissions, for features that aren't central enough to ask about at install: sites
 * (search suggestions, sites handled while focusing) and browser data (recently closed tabs, top
 * sites). The image sources' sites are required; most other APIs allow cross-origin requests and
 * need no permission at all.
 */
import { useEffect, useState } from 'preact/hooks';

export type Perms = chrome.permissions.Permissions;

/** Google's search suggestions. */
export const SUGGEST = ['https://suggestqueries.google.com/*'];
/** Recently closed tabs: sessions, plus tabs so their addresses and titles can be read. */
export const RECENT: Perms = { permissions: ['sessions', 'tabs'] };
/** The sites Chrome's own new tab offers as shortcuts. */
export const TOP_SITES: Perms = { permissions: ['topSites'] };
/** Address-bar-like search: visited sites and past searches (history), open tabs (tabs). */
export const SEARCH_HISTORY: Perms = { permissions: ['history', 'tabs'] };

export const hasPerms = (p: Perms) => chrome.permissions.contains(p);

/** Asks Chrome; must run from a click or key press. False when declined. */
export const requestPerms = (p: Perms) => chrome.permissions.request(p).catch(() => false);

export const hasHosts = (origins: string[]) => hasPerms({ origins });
export const requestHosts = (origins: string[]) => requestPerms({ origins });

/** Whether the permissions are granted (undefined while checking), kept up to date when that changes. */
export function usePerms(p: Perms): boolean | undefined {
  const [ok, setOk] = useState<boolean>();
  const key = JSON.stringify(p);
  useEffect(() => {
    let alive = true;
    const check = () => void hasPerms(p).then((v) => alive && setOk(v));
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

export const useHosts = (origins: string[]) => usePerms({ origins });
