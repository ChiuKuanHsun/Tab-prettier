import type { Settings } from './types';

/** newtab/options → service worker */
export type ToBackground =
  | { to: 'bg'; type: 'refill'; lowPower?: boolean }
  | { to: 'bg'; type: 'offscreen-idle' };

/** service worker → offscreen document */
export type ToOffscreen = {
  to: 'offscreen';
  type: 'refill';
  settings: Settings;
  blacklist: string[];
  target: number;
};

export type Broadcast = { to: 'all'; type: 'queue-updated'; count: number };

export const send = (m: ToBackground) => chrome.runtime.sendMessage(m).catch(() => undefined);

/** How many ready scenes to keep: more when scenes change on every tab or very often. */
export function queueTarget(s: Pick<Settings, 'rotation' | 'rotationMinutes' | 'rotationTabs'>) {
  if (s.rotation === 'tab') return 5;
  if ((s.rotation === 'minutes' && s.rotationMinutes < 10) || (s.rotation === 'tabs' && s.rotationTabs <= 2)) return 3;
  return 2;
}
