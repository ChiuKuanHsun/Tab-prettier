import type { ListAnime } from './list-chars';
import type { Settings } from './types';

/** newtab/options → service worker */
export type ToBackground =
  | { to: 'bg'; type: 'refill'; lowPower?: boolean; force?: boolean }
  | { to: 'bg'; type: 'offscreen-idle' }
  /** From the content script on a listed site: the service worker redirects the tab if needed. */
  | { to: 'bg'; type: 'focus-check' };

/** To the content script: whether to show the corner timer during focus rounds, its label and the new tab's accent. */
export type FocusCheckReply = { remind: boolean; label: string; accent?: string };

/** service worker → offscreen document */
export type ToOffscreen = {
  to: 'offscreen';
  type: 'refill';
  settings: Settings;
  blacklist: string[];
  target: number;
  /** Shows from the user's AniList lists to take characters from (the offscreen page can't log in). */
  listAnime?: ListAnime[];
};

export type Broadcast = { to: 'all'; type: 'queue-updated'; count: number };

/** Upper bound for a custom queue size (each scene is roughly 1 MB). */
export const QUEUE_MAX = 30;

export const send =(m: ToBackground) => chrome.runtime.sendMessage(m).catch(() => undefined);

/**
 * How many ready scenes to keep: the user's number if set, otherwise more when scenes change on
 * every tab or very often.
 */
export function queueTarget(s: Pick<Settings, 'rotation' | 'rotationMinutes' | 'rotationTabs'> & { queueSize?: number }) {
  if (s.queueSize && s.queueSize > 0) return Math.min(QUEUE_MAX, Math.round(s.queueSize));
  if (s.rotation === 'tab') return 5;
  if ((s.rotation === 'minutes' && s.rotationMinutes < 10) || (s.rotation === 'tabs' && s.rotationTabs <= 2)) return 3;
  return 2;
}
