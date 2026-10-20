/**
 * What changed in each version worth telling the user about: the new tab mentions an update once
 * (for a few tabs), and updates.html lists them all. A version without notes updates silently.
 */
import type { MessageKey } from '../i18n';

export interface Release {
  version: string;
  /** One line for the new tab's notice. */
  summary: MessageKey;
  items: MessageKey[];
}

/** Newest first. */
export const RELEASES: Release[] = [
  {
    version: '1.1.0',
    summary: 'updates.v110.summary',
    items: ['updates.v110.worker', 'updates.v110.workload', 'updates.v110.browsers'],
  },
];

const KEY = 'updateNote';
/** New tabs that show the notice before it goes away by itself. */
const SHOW_TABS = 3;

interface Pending { version: string; tabs: number }

/** From the service worker after an update: remember to mention it if the version has notes. */
export async function noteUpdate(version: string) {
  if (RELEASES.some((r) => r.version === version)) await chrome.storage.local.set({ [KEY]: { version, tabs: 0 } satisfies Pending });
}

/** For a new tab: the release to mention, counting this tab; undefined once it has been shown enough. */
export async function takeNotice(): Promise<Release | undefined> {
  const p = (await chrome.storage.local.get(KEY))[KEY] as Pending | undefined;
  const r = p && RELEASES.find((x) => x.version === p.version);
  if (!p || !r || p.tabs >= SHOW_TABS) {
    if (p) await dismissNotice();
    return undefined;
  }
  await chrome.storage.local.set({ [KEY]: { ...p, tabs: p.tabs + 1 } satisfies Pending });
  return r;
}

export const dismissNotice = () => chrome.storage.local.remove(KEY);
