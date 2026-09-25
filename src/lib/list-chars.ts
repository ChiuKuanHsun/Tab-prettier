/**
 * Characters from the user's AniList lists, for scenes that feature them: which shows and
 * characters count, and how an AniList character maps to a Danbooru character tag. Pure, so
 * the options page, the new tab, the service worker and the offscreen pipeline can share it.
 */
import type { CharacterTag } from './danbooru';
import type { Settings } from './types';

export interface ListCharacter {
  id: number;
  name: { full: string; native: string | null };
  gender: string | null;
  role: 'MAIN' | 'SUPPORTING';
  image: string | null;
  favourites: number;
}

export interface ListAnime {
  id: number;
  status: 'CURRENT' | 'COMPLETED';
  title: { romaji: string; native: string | null };
  cover: string | null;
  /** Main then supporting characters, most-loved first. */
  characters: ListCharacter[];
}

/** The user's own ticks and unticks, by AniList character id; anything else follows the default. */
export type CharPicks = Record<number, boolean>;

/** Fewer Danbooru images than this and a character isn't worth a scene. */
export const MIN_POSTS = 20;

type ListPrefs = Pick<Settings['sources'], 'listWatching' | 'listCompleted' | 'listExcluded'>;

/** The shows the user wants characters from: the chosen lists, minus the ones switched off. */
export function chosenAnime(all: ListAnime[], p: ListPrefs): ListAnime[] {
  const excluded = new Set(p.listExcluded);
  return all.filter(
    (a) => !excluded.has(a.id) && ((a.status === 'CURRENT' && p.listWatching) || (a.status === 'COMPLETED' && p.listCompleted)),
  );
}

/** Female characters are ticked unless the user says otherwise ("Female", "Female (…)"). */
export const pickedByDefault = (c: ListCharacter) => /^female\b/i.test(c.gender ?? '');

export const isPicked = (c: ListCharacter, picks: CharPicks) => picks[c.id] ?? pickedByDefault(c);

/** The shows with only the characters the user has ticked; shows left with none are dropped. */
export function withPickedCharacters(anime: ListAnime[], picks: CharPicks): ListAnime[] {
  return anime
    .map((a) => ({ ...a, characters: a.characters.filter((c) => isPicked(c, picks)) }))
    .filter((a) => a.characters.length);
}

/** A random character, main characters twice as likely as supporting ones. */
export function drawCharacter(chars: ListCharacter[], rand = Math.random()): ListCharacter | undefined {
  const weight = (c: ListCharacter) => (c.role === 'MAIN' ? 2 : 1);
  let r = rand * chars.reduce((n, c) => n + weight(c), 0);
  for (const c of chars) {
    r -= weight(c);
    if (r < 0) return c;
  }
  return chars.at(-1);
}

const words = (s: string) => s.toLowerCase().split(/[\s_]+/).filter(Boolean).sort().join(' ');

/**
 * The Danbooru tag for an AniList character, from Danbooru's autocomplete results — only when it
 * is certainly the same character: the Japanese name is one of the tag's recorded names, or the
 * tag (minus its series qualifier) has exactly the words of the English name, in any order
 * ("kamado_nezuko" for "Nezuko Kamado"). Otherwise none, rather than a wrong character.
 */
export function matchCharacterTag(
  byNative: CharacterTag[],
  byFull: CharacterTag[],
  name: ListCharacter['name'],
): CharacterTag | undefined {
  const native = name.native?.replace(/\s+/g, '');
  const exact = native && byNative.find((t) => t.alias?.replace(/\s+/g, '') === native);
  if (exact) return exact;
  const full = words(name.full);
  return byFull.find((t) => words(t.name.replace(/_\([^)]*\)$/, '')) === full);
}
