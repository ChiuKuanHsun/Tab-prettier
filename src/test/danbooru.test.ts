import { describe, expect, it } from 'vitest';
import { figureCount, postCredit, postsUrl, tagLabel, usablePost, type DanbooruPost } from '../lib/danbooru';

const post = (over: Partial<DanbooruPost> = {}): DanbooruPost => ({
  id: 1,
  rating: 'g',
  file_ext: 'png',
  file_size: 1_000_000,
  image_width: 1200,
  image_height: 1800,
  file_url: 'https://cdn.donmai.us/original/aa/bb/x.png',
  is_deleted: false,
  is_banned: false,
  source: '',
  tag_string: '1girl solo long_hair frieren sousou_no_frieren',
  tag_string_artist: 'some_artist',
  tag_string_character: 'frieren',
  ...over,
});

describe('usablePost', () => {
  it('accepts a single-girl, general-rated still', () => {
    expect(usablePost(post(), true)).toBe(true);
  });

  it('rejects other ratings, missing files, animations and oversized files', () => {
    expect(usablePost(post({ rating: 's' }), true)).toBe(false);
    expect(usablePost(post({ file_url: undefined }), true)).toBe(false);
    expect(usablePost(post({ file_ext: 'gif' }), true)).toBe(false);
    expect(usablePost(post({ file_size: 20_000_000 }), true)).toBe(false);
    expect(usablePost(post({ is_banned: true }), true)).toBe(false);
  });

  it('rejects lettering but not a signature', () => {
    expect(usablePost(post({ tag_string: '1girl solo speech_bubble' }), true)).toBe(false);
    expect(usablePost(post({ tag_string: '1girl solo english_text' }), true)).toBe(false);
    expect(usablePost(post({ tag_string: '1girl solo watermark' }), true)).toBe(false);
    expect(usablePost(post({ tag_string: '1girl solo signature dated' }), true)).toBe(true);
  });

  it('rejects small and very wide images but allows moderately wide ones', () => {
    expect(usablePost(post({ image_height: 600 }), true)).toBe(false);
    expect(usablePost(post({ image_width: 4000, image_height: 1200 }), true)).toBe(false);
    expect(usablePost(post({ image_width: 2400, image_height: 1600 }), true)).toBe(true);
  });

  it('takes duos only when allowed, and general duos only of two girls', () => {
    const pair = post({ tag_string: '2girls multiple_girls frieren fern' });
    expect(usablePost(pair, false)).toBe(false);
    expect(usablePost(pair, false, true)).toBe(true);
    expect(usablePost(pair, true, true)).toBe(true);
    const couple = post({ tag_string: '1boy 1girl himmel frieren' });
    expect(usablePost(couple, false, true)).toBe(true);
    expect(usablePost(couple, true, true)).toBe(false);
    expect(usablePost(post({ tag_string: '3girls multiple_girls' }), false, true)).toBe(false);
  });

  it('general queries need 1girl, favourites do not', () => {
    const boy = post({ tag_string: '1boy solo himmel' });
    expect(usablePost(boy, true)).toBe(false);
    expect(usablePost(boy, false)).toBe(true);
  });
});

describe('figureCount', () => {
  it('trusts solo', () => {
    expect(figureCount(['1girl', 'solo'])).toBe(1);
  });

  it('adds up count tags when solo is missing', () => {
    expect(figureCount(['1girl', 'long_hair'])).toBe(1);
    expect(figureCount(['1boy', '1girl'])).toBe(2);
    expect(figureCount(['2girls', 'multiple_girls'])).toBe(2);
    expect(figureCount(['2girls', '1boy', 'multiple_girls'])).toBe(3);
  });

  it('treats open-ended counts as a crowd and missing counts as unknown', () => {
    expect(figureCount(['6+girls', 'multiple_girls'])).toBeGreaterThan(2);
    expect(figureCount(['long_hair'])).toBe(0);
  });

  it('rejects comics, sheets and background crowds even when solo', () => {
    expect(figureCount(['1girl', 'solo', 'comic'])).toBe(0);
    expect(figureCount(['1girl', 'multiple_views'])).toBe(0);
    expect(figureCount(['1girl', 'solo_focus', 'solo'])).toBe(0);
  });
});

describe('danbooru helpers', () => {
  it('builds queries within the two-tag limit (rating is free)', () => {
    const one = new URL(postsUrl({ tags: 'frieren' })).searchParams;
    expect(one.get('tags')).toBe('frieren order:random rating:g');
    expect(one.has('page')).toBe(false);
    const paged = new URL(postsUrl({ tags: '1girl solo score:>=20', pages: 100 }, 0.9999)).searchParams;
    expect(paged.get('tags')).toBe('1girl solo score:>=20 rating:g');
    expect(paged.get('page')).toBe('100');
    const windowed = new URL(postsUrl({ tags: '1girl solo score:>=10', idWindow: 60_000 }, 0)).searchParams;
    expect(windowed.get('tags')).toBe('1girl solo score:>=10 id:5000000..5060000 rating:g');
    expect(windowed.has('page')).toBe(false);
  });

  it('credits the artist and links the post', () => {
    expect(postCredit(post())).toMatchObject({
      id: 'danbooru:1',
      source: 'danbooru',
      artist: 'some artist',
      pageUrl: 'https://danbooru.donmai.us/posts/1',
    });
  });

  it('labels tags readably', () => {
    expect(tagLabel('fern_(sousou_no_frieren)')).toBe('fern (sousou no frieren)');
  });
});
