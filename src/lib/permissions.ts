/**
 * Optional permissions, for features that aren't central enough to ask about at install: sites
 * (search suggestions, sites handled while focusing) and browser data (recently closed tabs, top
 * sites). The image sources' sites are required; most other APIs allow cross-origin requests and
 * need no permission at all.
 */
import { useEffect, useState } from 'preact/hooks';
import { IS_FIREFOX } from './browser';

/** Firefox also asks before data leaves the browser (manifest `data_collection_permissions`). */
export type Perms = chrome.permissions.Permissions & { data_collection?: string[] };

/** Firefox's consent for a kind of data sent to a third party; nothing to ask in Chrome. */
const sends = (kind: string): Perms => (IS_FIREFOX ? { data_collection: [kind] } : {});

/** Google's search suggestions. */
export const SUGGEST = ['https://suggestqueries.google.com/*'];
/** Google's search suggestions, with Firefox's consent to send what's typed. */
export const SUGGEST_PERMS: Perms = { origins: SUGGEST, ...sends('searchTerms') };
/** Weather: the (approximate) location goes to Open-Meteo, and the IP to ipwho.is / ipinfo.io. */
export const LOCATION: Perms = sends('locationInfo');
/** Recently closed tabs: sessions, plus tabs so their addresses and titles can be read. */
export const RECENT: Perms = { permissions: ['sessions', 'tabs'] };
/** The sites Chrome's own new tab offers as shortcuts. */
export const TOP_SITES: Perms = { permissions: ['topSites'] };
/** Address-bar-like search: visited sites and past searches (history), open tabs (tabs). */
export const SEARCH_HISTORY: Perms = { permissions: ['history', 'tabs'] };

const none = (p: Perms) => !Object.values(p).some((v) => v?.length);

export const hasPerms = async (p: Perms) => none(p) || chrome.permissions.contains(p);

/** Asks the browser; must run from a click or key press. False when declined. */
export const requestPerms = async (p: Perms) => none(p) || chrome.permissions.request(p).catch(() => false);

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
