import { t } from '../i18n';
import { db, kvGet, kvSet } from './db';
import type { ListAnime, ListCharacter } from './list-chars';

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

export interface BirthdayCharacter {
  id: number;
  siteUrl: string;
  favourites: number;
  name: { full: string; native: string | null };
  image: { large: string };
  media: { nodes: { title: Title; siteUrl: string }[] };
}

/** Characters whose birthday is today, most-loved first. */
export function birthdays(): Promise<BirthdayCharacter[]> {
  const d = new Date();
  return cached(`anilist:birthdays:${d.getMonth() + 1}-${d.getDate()}`, 12 * HOUR, async () => {
    const data = await gql<{ Page: { characters: BirthdayCharacter[] } }>(
      `query{ Page(perPage:12){ characters(isBirthday:true, sort:FAVOURITES_DESC){ id siteUrl favourites name{ full native } image{ large } media(perPage:1, sort:POPULARITY_DESC, type:ANIME){ nodes{ title{ romaji native english } siteUrl } } } } }`,
    );
    return data.Page.characters;
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
  if (!token) throw new Error(t('lib.anilistNoToken'));
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

/** The user's "Completed" list, most recently finished first. `force` skips the 30-minute cache. */
export async function myCompleted(token: string, force = false): Promise<ListEntry[]> {
  return cached(`anilist:completed:${token.slice(-8)}`, HOUR / 2, async () => {
    const { Viewer } = await gql<{ Viewer: { id: number } }>('query{ Viewer{ id } }', {}, token);
    const data = await gql<{ MediaListCollection: { lists: { entries: ListEntry[] }[] } }>(
      `query($userId:Int){ MediaListCollection(userId:$userId, type:ANIME, status:COMPLETED, sort:UPDATED_TIME_DESC){ lists{ entries{ id progress media{ ${MEDIA} episodes } } } } }`,
      { userId: Viewer.id },
      token,
    );
    return data.MediaListCollection.lists.flatMap((l) => l.entries);
  }, force);
}

/**
 * The user's Watching and Completed shows with their main characters, for character scenes.
 * Cached for 12 hours; characters come in batches of 50 shows to stay within AniList's limits.
 */
export async function myListAnime(token: string, force = false): Promise<ListAnime[]> {
  return cached(`anilist:listanime:${token.slice(-8)}`, 12 * HOUR, async () => {
    const { Viewer } = await gql<{ Viewer: { id: number } }>('query{ Viewer{ id } }', {}, token);
    type Entry = { status: ListAnime['status']; media: { id: number; title: ListAnime['title']; coverImage: { medium?: string } } };
    const data = await gql<{ MediaListCollection: { lists: { entries: Entry[] }[] } }>(
      `query($userId:Int){ MediaListCollection(userId:$userId, type:ANIME, status_in:[CURRENT, COMPLETED]){ lists{ entries{ status media{ id title{ romaji native } coverImage{ medium } } } } } }`,
      { userId: Viewer.id },
      token,
    );
    const entries = data.MediaListCollection.lists.flatMap((l) => l.entries);
    const chars = new Map<number, ListCharacter[]>();
    for (let i = 0; i < entries.length; i += 50) {
      const ids = entries.slice(i, i + 50).map((e) => e.media.id);
      const page = await gql<{ Page: { media: { id: number; characters: { nodes: ListCharacter[] } }[] } }>(
        `query($ids:[Int]){ Page(perPage:50){ media(id_in:$ids, type:ANIME){ id characters(role:MAIN, sort:FAVOURITES_DESC, perPage:6){ nodes{ id name{ full native } gender } } } } }`,
        { ids },
      );
      for (const m of page.Page.media) chars.set(m.id, m.characters.nodes);
    }
    return entries.map((e) => ({
      id: e.media.id,
      status: e.status,
      title: e.media.title,
      cover: e.media.coverImage.medium ?? null,
      characters: chars.get(e.media.id) ?? [],
    }));
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
