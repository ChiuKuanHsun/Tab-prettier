import { describe, expect, it } from 'vitest';
import {
  chosenAnime,
  drawCharacter,
  isPicked,
  matchCharacterTag,
  withPickedCharacters,
  type ListAnime,
  type ListCharacter,
} from '../lib/list-chars';

const char = (id: number, gender: string | null, role: ListCharacter['role'] = 'MAIN'): ListCharacter => ({
  id,
  name: { full: `c${id}`, native: null },
  gender,
  role,
  image: null,
  favourites: 0,
});

const anime = (id: number, status: ListAnime['status'], characters: ListCharacter[] = []): ListAnime => ({
  id,
  status,
  title: { romaji: `show ${id}`, native: null },
  cover: null,
  characters,
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

describe('character picks', () => {
  it('ticks female characters by default', () => {
    expect(isPicked(char(1, 'Female'), {})).toBe(true);
    expect(isPicked(char(2, 'Female (formerly)'), {})).toBe(true);
    expect(isPicked(char(3, 'Male'), {})).toBe(false);
    expect(isPicked(char(4, null), {})).toBe(false);
  });

  it("lets the user's ticks override the default either way", () => {
    expect(isPicked(char(1, 'Female'), { 1: false })).toBe(false);
    expect(isPicked(char(3, 'Male'), { 3: true })).toBe(true);
  });

  it('keeps only ticked characters and drops shows left with none', () => {
    const list = [anime(1, 'CURRENT', [char(1, 'Female'), char(2, 'Male')]), anime(2, 'CURRENT', [char(3, 'Male')])];
    const out = withPickedCharacters(list, {});
    expect(out.map((a) => a.id)).toEqual([1]);
    expect(out[0].characters.map((c) => c.id)).toEqual([1]);
  });

  it('draws main characters twice as often as supporting ones', () => {
    const chars = [char(1, 'Female', 'MAIN'), char(2, 'Female', 'SUPPORTING')];
    // total weight 3: [0, 2) main, [2, 3) supporting
    expect(drawCharacter(chars, 0.6)?.id).toBe(1);
    expect(drawCharacter(chars, 0.7)?.id).toBe(2);
    expect(drawCharacter([], 0.5)).toBeUndefined();
  });
});

describe('matchCharacterTag', () => {
  const tag = (name: string, alias?: string) => ({ name, postCount: 1, alias });

  it('takes the tag whose recorded name is the Japanese name', () => {
    const byNative = [tag('frieren', 'フリーレン')];
    expect(matchCharacterTag(byNative, [], { full: 'Frieren', native: 'フリーレン' })?.name).toBe('frieren');
  });

  it('falls back to the English name, in any word order, ignoring the series qualifier', () => {
    expect(matchCharacterTag([], [tag('kamado_nezuko')], { full: 'Nezuko Kamado', native: null })?.name).toBe('kamado_nezuko');
    expect(matchCharacterTag([], [tag('fern_(sousou_no_frieren)')], { full: 'Fern', native: null })?.name).toBe(
      'fern_(sousou_no_frieren)',
    );
  });

  it('gives nothing rather than a different character', () => {
    expect(matchCharacterTag([tag('frieren', 'フリーレンさま')], [], { full: 'X', native: 'フリーレン' })).toBeUndefined();
    expect(matchCharacterTag([], [tag('jellal_fernandes')], { full: 'Fern', native: null })).toBeUndefined();
  });
});
