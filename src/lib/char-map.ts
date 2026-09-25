/**
 * AniList character → Danbooru tag, looked up once and kept (IndexedDB, so the offscreen
 * pipeline, the settings and the new tab share the answers). No chrome.* APIs: the offscreen
 * page can use this.
 */
import { searchCharacters } from './danbooru';
import { kvGet, kvSet } from './db';
import { matchCharacterTag, type ListCharacter } from './list-chars';

export interface CharMatch {
  tag: string;
  /** Danbooru posts with the tag (all ratings), a rough idea of how many images there are. */
  posts: number;
}

const key = (id: number) => `charmap:${id}`;
/** Re-checked monthly: new characters get tagged and counts grow. */
const MAX_AGE = 30 * 86_400_000;

/** A lookup already made: the match, null for "no sure match", undefined if never looked up. */
export const knownMatch = (id: number) => kvGet<CharMatch | null>(key(id), MAX_AGE);

/** The character's Danbooru tag — Japanese name first, the English name only if that fails. */
export async function lookupCharacter(c: ListCharacter): Promise<CharMatch | null> {
  const known = await knownMatch(c.id);
  if (known !== undefined) return known;
  const byNative = c.name.native ? await searchCharacters(c.name.native) : [];
  const hit = matchCharacterTag(byNative, [], c.name) ?? matchCharacterTag([], await searchCharacters(c.name.full), c.name);
  const match = hit ? { tag: hit.name, posts: hit.postCount } : null;
  await kvSet(key(c.id), match);
  return match;
}
