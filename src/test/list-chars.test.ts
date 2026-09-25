import { describe, expect, it } from 'vitest';
import { chosenAnime, matchCharacterTag, usableCharacters, type ListAnime } from '../lib/list-chars';

const anime = (id: number, status: ListAnime['status'], genders: (string | null)[] = []): ListAnime => ({
  id,
  status,
  title: { romaji: `show ${id}`, native: null },
  cover: null,
  characters: genders.map((gender, i) => ({ id: id * 10 + i, name: { full: `c${i}`, native: null }, gender })),
});

describe('chosenAnime', () => {
  const all = [anime(1, 'CURRENT'), anime(2, 'COMPLETED'), anime(3, 'COMPLETED')];

  it('follows the chosen lists and leaves out unticked shows', () => {
    const ids = (p: Parameters<typeof chosenAnime>[1]) => chosenAnime(all, p).map((a) => a.id);
    expect(ids({ listWatching: true, listCompleted: true, listExcluded: [] })).toEqual([1, 2, 3]);
    expect(ids({ listWatching: true, listCompleted: false, listExcluded: [] })).toEqual([1]);
    expect(ids({ listWatching: true, listCompleted: true, listExcluded: [2] })).toEqual([1, 3]);
  });
});

describe('usableCharacters', () => {
  it('skips male characters only when asked', () => {
    const a = anime(1, 'CURRENT', ['Female', 'Male', null]);
    expect(usableCharacters(a, true).map((c) => c.gender)).toEqual(['Female', null]);
    expect(usableCharacters(a, false)).toHaveLength(3);
  });
});

describe('matchCharacterTag', () => {
  const tag = (name: string, alias?: string) => ({ name, postCount: 1, alias });

  it('takes the tag whose recorded name is the Japanese name', () => {
    const byNative = [tag('frieren', 'フリーレン')];
    expect(matchCharacterTag(byNative, [], { full: 'Frieren', native: 'フリーレン' })).toBe('frieren');
  });

  it('falls back to the English name, in any word order, ignoring the series qualifier', () => {
    expect(matchCharacterTag([], [tag('kamado_nezuko')], { full: 'Nezuko Kamado', native: null })).toBe('kamado_nezuko');
    expect(matchCharacterTag([], [tag('fern_(sousou_no_frieren)')], { full: 'Fern', native: null })).toBe(
      'fern_(sousou_no_frieren)',
    );
  });

  it('gives nothing rather than a different character', () => {
    expect(matchCharacterTag([tag('frieren', 'フリーレンさま')], [], { full: 'X', native: 'フリーレン' })).toBeUndefined();
    expect(matchCharacterTag([], [tag('jellal_fernandes')], { full: 'Fern', native: null })).toBeUndefined();
  });
});
