import { db, kvGet, kvSet } from './db';

const ENDPOINT = 'https://graphql.anilist.co';
const HOUR = 3_600_000;

export interface Title { romaji: string; native: string | null; english: string | null }
export interface MediaLite {
  id: number;
  siteUrl: string;
  title: Title;
  coverImage: { medium?: string; large?: string; color: string | null };
  episodes?: number | null;
  averageScore?: number | null;
  nextAiringEpisode?: { episode: number; airingAt: number; timeUntilAiring?: number } | null;
}
export interface Airing { airingAt: number; episode: number; media: MediaLite & { isAdult: boolean } }
export interface ListEntry { id: number; progress: number; media: MediaLite }

export const displayTitle = (t: Title) => t.native || t.romaji;

async function gql<T>(query: string, variables: Record<string, unknown> = {}, token?: string): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(json.errors?.[0]?.message ?? `AniList HTTP ${res.status}`);
  return json.data as T;
}

async function cached<T>(key: string, maxAge: number, load: () => Promise<T>, force = false): Promise<T> {
  const hit = force ? undefined : await kvGet<T>(key, maxAge);
  if (hit) return hit;
  const v = await load();
  await kvSet(key, v);
  return v;
}

const MEDIA = 'id siteUrl title { romaji native english } coverImage { medium large color }';

export function todayAiring(): Promise<Airing[]> {
  const d = new Date();
  const start = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000);
  return cached(`anilist:today:${start}`, HOUR, async () => {
    const data = await gql<{ Page: { airingSchedules: Airing[] } }>(
      `query($start:Int,$end:Int){ Page(perPage:50){ airingSchedules(airingAt_greater:$start, airingAt_lesser:$end, sort:TIME){ airingAt episode media{ ${MEDIA} isAdult } } } }`,
      { start, end: start + 86400 },
    );
    return data.Page.airingSchedules.filter((a) => !a.media.isAdult);
  });
}

export function currentSeason(date = new Date()) {
  const m = date.getMonth();
  const season = m < 3 ? 'WINTER' : m < 6 ? 'SPRING' : m < 9 ? 'SUMMER' : 'FALL';
  return { season, year: date.getFullYear() };
}

export function seasonAnime(): Promise<MediaLite[]> {
  const { season, year } = currentSeason();
  return cached(`anilist:season:${season}${year}`, 6 * HOUR, async () => {
    const data = await gql<{ Page: { media: MediaLite[] } }>(
      `query($season:MediaSeason,$year:Int){ Page(perPage:30){ media(season:$season, seasonYear:$year, type:ANIME, sort:POPULARITY_DESC, isAdult:false){ ${MEDIA} averageScore nextAiringEpisode{ episode airingAt } } } }`,
      { season, year },
    );
    return data.Page.media;
  });
}

// --- Account (implicit OAuth grant) -------------------------------------------

export async function getToken(): Promise<string | undefined> {
  const { anilistToken } = await chrome.storage.local.get('anilistToken');
  return anilistToken as string | undefined;
}

export async function login(clientId: string) {
  const url = `https://anilist.co/api/v2/oauth/authorize?client_id=${encodeURIComponent(clientId)}&response_type=token`;
  const redirect = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  const token = new URLSearchParams(new URL(redirect ?? '').hash.slice(1)).get('access_token');
  if (!token) throw new Error('AniList 沒有回傳 token');
  await chrome.storage.local.set({ anilistToken: token });
  return token;
}

export async function logout() {
  await chrome.storage.local.remove('anilistToken');
}

const myListKey = (token: string) => `anilist:mylist:${token.slice(-8)}`;

/** The user's "Watching" list, soonest next episode first. `force` skips the 30-minute cache. */
export async function myWatching(token: string, force = false): Promise<{ name: string; entries: ListEntry[] }> {
  return cached(myListKey(token), HOUR / 2, async () => {
    const { Viewer } = await gql<{ Viewer: { id: number; name: string } }>('query{ Viewer{ id name } }', {}, token);
    const data = await gql<{ MediaListCollection: { lists: { entries: ListEntry[] }[] } }>(
      `query($userId:Int){ MediaListCollection(userId:$userId, type:ANIME, status:CURRENT){ lists{ entries{ id progress media{ ${MEDIA} episodes nextAiringEpisode{ episode airingAt timeUntilAiring } } } } } }`,
      { userId: Viewer.id },
      token,
    );
    const entries = data.MediaListCollection.lists.flatMap((l) => l.entries);
    entries.sort((a, b) => (a.media.nextAiringEpisode?.airingAt ?? Infinity) - (b.media.nextAiringEpisode?.airingAt ?? Infinity));
    return { name: Viewer.name, entries };
  }, force);
}

/** Highest episode that has aired, when AniList knows it. */
export function airedEpisodes(m: MediaLite): number | undefined {
  if (m.nextAiringEpisode) return m.nextAiringEpisode.episode - 1;
  return m.episodes ?? undefined;
}

/**
 * Sets the watched episode count on AniList. Reaching the final episode of a finished show also
 * marks it completed, the way the AniList site does. Updates the cached list in place.
 */
export async function saveProgress(token: string, entry: ListEntry, progress: number): Promise<ListEntry> {
  const done = !entry.media.nextAiringEpisode && entry.media.episodes != null && progress >= entry.media.episodes;
  const data = await gql<{ SaveMediaListEntry: { id: number; progress: number; status: string } }>(
    `mutation($id:Int,$progress:Int,$status:MediaListStatus){ SaveMediaListEntry(id:$id, progress:$progress, status:$status){ id progress status } }`,
    { id: entry.id, progress, status: done ? 'COMPLETED' : 'CURRENT' },
    token,
  );
  const saved = { ...entry, progress: data.SaveMediaListEntry.progress };
  const key = myListKey(token);
  const list = await kvGet<{ name: string; entries: ListEntry[] }>(key);
  if (list) {
    const entries = done ? list.entries.filter((e) => e.id !== entry.id) : list.entries.map((e) => (e.id === entry.id ? saved : e));
    await kvSet(key, { ...list, entries });
  }
  return saved;
}

export async function forgetMyList(token: string) {
  await (await db()).delete('kv', myListKey(token));
}
