import { t } from '../i18n';
import { DEFAULT_SETTINGS, type LinkGroup, type Settings, type Todo } from './types';

/**
 * Small user data (settings, links, todos, notes) lives in storage.sync so it follows the
 * user across devices. sync has tight per-item quotas, so writes fall back to storage.local
 * and reads prefer whichever copy is newer.
 */
interface Stamped<T> { v: T; t: number }

async function readKey<T>(key: string): Promise<T | undefined> {
  const [s, l] = await Promise.all([
    chrome.storage.sync.get(key).catch(() => ({})) as Promise<Record<string, Stamped<T>>>,
    chrome.storage.local.get(key) as Promise<Record<string, Stamped<T>>>,
  ]);
  const a = s[key];
  const b = l[key];
  if (a && b) return a.t >= b.t ? a.v : b.v;
  return (a ?? b)?.v;
}

async function writeKey<T>(key: string, v: T): Promise<void> {
  const item: Stamped<T> = { v, t: Date.now() };
  try {
    await chrome.storage.sync.set({ [key]: item });
    await chrome.storage.local.remove(key);
  } catch {
    await chrome.storage.local.set({ [key]: item });
  }
}

export function onKeyChange<T>(key: string, cb: (v: T) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    const c = changes[key];
    if (c?.newValue) cb((c.newValue as Stamped<T>).v);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** Rotation presets from earlier versions ('15m', '30m', '60m') become the custom-minutes mode. */
const LEGACY_ROTATION: Record<string, number> = { '15m': 15, '30m': 30, '60m': 60 };

export async function getSettings(): Promise<Settings> {
  const s = await readKey<Partial<Settings>>('settings');
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...s,
    sources: { ...DEFAULT_SETTINGS.sources, ...s?.sources },
  };
  // Composition variety used to be one switch: off meant no close-ups or distant figures either.
  if (s?.layoutVariety === false && s.closeups === undefined) merged.closeups = merged.distantShots = false;
  // Before auto-location existed, a saved city meant "on" and none meant "off".
  if (!s?.weatherMode && s?.weatherLocation) merged.weatherMode = 'manual';
  const legacy = LEGACY_ROTATION[merged.rotation as string];
  if (legacy) {
    merged.rotation = 'minutes';
    merged.rotationMinutes = legacy;
  }
  return merged;
}

export const saveSettings = (s: Settings) => writeKey('settings', s);

export const DEFAULT_LINKS: LinkGroup[] = [
  {
    id: 'daily',
    name: t('lib.defaultLinks.daily'),
    links: [
      { id: 'yt', title: 'YouTube', url: 'https://www.youtube.com/' },
      { id: 'gh', title: 'GitHub', url: 'https://github.com/' },
      { id: 'gm', title: 'Gmail', url: 'https://mail.google.com/' },
    ],
  },
  {
    id: 'anime',
    name: t('lib.defaultLinks.anime'),
    links: [
      { id: 'al', title: 'AniList', url: 'https://anilist.co/' },
      { id: 'px', title: 'pixiv', url: 'https://www.pixiv.net/' },
      { id: 'gamer', title: '動畫瘋', url: 'https://ani.gamer.com.tw/' },
    ],
  },
];

export const getLinks = async () => (await readKey<LinkGroup[]>('links')) ?? DEFAULT_LINKS;
export const saveLinks = (v: LinkGroup[]) => writeKey('links', v);
export const getTodos = async () => (await readKey<Todo[]>('todos')) ?? [];
export const saveTodos = (v: Todo[]) => writeKey('todos', v);
export const getNotes = async () => (await readKey<string>('notes')) ?? '';
export const saveNotes = (v: string) => writeKey('notes', v);

export const getBlacklist = async () => (await readKey<string[]>('blacklist')) ?? [];
export async function addToBlacklist(id: string) {
  const list = await getBlacklist();
  if (!list.includes(id)) await writeKey('blacklist', [...list, id].slice(-2000));
}
export const saveBlacklist = (v: string[]) => writeKey('blacklist', v);

export const uid = () => crypto.randomUUID().slice(0, 12);
