/**
 * Characters from the user's AniList lists, for scenes that feature them: which shows and
 * characters count, and how an AniList character maps to a Danbooru character tag. Pure, so
 * the options page, the service worker and the offscreen pipeline can share it.
 */
import type { CharacterTag } from './danbooru';
import type { Settings } from './types';

export interface ListCharacter {
  id: number;
  name: { full: string; native: string | null };
  gender: string | null;
}

export interface ListAnime {
  id: number;
  status: 'CURRENT' | 'COMPLETED';
  title: { romaji: string; native: string | null };
  cover: string | null;
  /** Main characters, most-loved first. */
  characters: ListCharacter[];
}

type ListPrefs = Pick<Settings['sources'], 'listWatching' | 'listCompleted' | 'listExcluded'>;

/** The shows the user wants characters from: the chosen lists, minus the ones switched off. */
export function chosenAnime(all: ListAnime[], p: ListPrefs): ListAnime[] {
  const excluded = new Set(p.listExcluded);
  return all.filter(
    (a) => !excluded.has(a.id) && ((a.status === 'CURRENT' && p.listWatching) || (a.status === 'COMPLETED' && p.listCompleted)),
  );
}

/** Characters worth a scene; male ones are skipped when the exclusions keep male characters out. */
export const usableCharacters = (a: ListAnime, noMale: boolean) =>
  a.characters.filter((c) => !(noMale && c.gender === 'Male'));

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
): string | undefined {
  const native = name.native?.replace(/\s+/g, '');
  const exact = native && byNative.find((t) => t.alias?.replace(/\s+/g, '') === native);
  if (exact) return exact.name;
  const full = words(name.full);
  return byFull.find((t) => words(t.name.replace(/_\([^)]*\)$/, '')) === full)?.name;
}
