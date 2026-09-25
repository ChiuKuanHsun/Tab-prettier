/**
 * The user's per-character ticks for list characters. Kept in storage.local, not with the
 * synced settings: a long Completed list would outgrow storage.sync's per-item quota.
 */
import type { CharPicks } from './list-chars';

const KEY = 'listCharPicks';

export async function getCharPicks(): Promise<CharPicks> {
  const r = await chrome.storage.local.get(KEY);
  return (r[KEY] as CharPicks | undefined) ?? {};
}

export async function setCharPick(id: number, on: boolean) {
  await chrome.storage.local.set({ [KEY]: { ...(await getCharPicks()), [id]: on } });
}

export function onCharPicks(cb: (p: CharPicks) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) cb((changes[KEY].newValue as CharPicks | undefined) ?? {});
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
