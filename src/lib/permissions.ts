/**
 * Optional host permissions, for features that aren't central enough to ask about at install.
 * (The image sources' sites are required; most other APIs allow cross-origin requests and need
 * no permission at all.)
 */
import { useEffect, useState } from 'preact/hooks';

/** Google's search suggestions. */
export const SUGGEST = ['https://suggestqueries.google.com/*'];

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
