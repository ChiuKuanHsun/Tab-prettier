/**
 * Danbooru: character images (general rating only) and character-tag autocomplete. Shared by the
 * offscreen pipeline and the options page.
 *
 * Anonymous searches may use 2 tags; `rating:`, `score:` and `filetype:` don't count, `order:random`
 * does. Random order times out on very large tags (solo, 1girl, 2girls), and so do deep pages of
 * a scored search (how deep varies with server load). So a query is either one tag +
 * order:random, or up to two tags on a random early page; anything else is checked locally on the
 * returned tags.
 */
import type { Credit } from './types';

export const DANBOORU = 'https://danbooru.donmai.us';

export interface DanbooruPost {
  id: number;
  rating: string;
  file_ext: string;
  file_size: number;
  image_width: number;
  image_height: number;
  file_url?: string;
  is_deleted: boolean;
  is_banned: boolean;
  source: string;
  tag_string: string;
  tag_string_artist: string;
  tag_string_character: string;
}

export interface PostQuery {
  tags: string;
  /** For tags too large for order:random: a random page among the first `pages` instead. */
  pages?: number;
  /**
   * Or a random window of this many post ids (`id:` is free too). Id ranges are the fastest
   * query Danbooru answers and reach back years, where early pages only cover recent weeks.
   */
  idWindow?: number;
}

/** Post ids worth sampling: from early 2022 up to about now (~6000 new posts a day). */
const ID_FROM = 5_000_000;
const latestId = (now = Date.now()) => 12_250_000 + Math.max(0, Math.floor((now - Date.UTC(2026, 8, 25)) / 86_400_000)) * 6000;

/**
 * General (non-favourite) queries; one is picked per batch. Mostly well-liked single girls on any
 * background (the cut-out is checked after segmentation anyway), sometimes transparent-background
 * art, which needs no segmentation.
 */
export const GENERAL_QUERIES: PostQuery[] = [
  { tags: '1girl solo score:>=10', idWindow: 60_000 },
  { tags: '1girl solo score:>=10', idWindow: 60_000 },
  { tags: '1girl solo score:>=10', idWindow: 60_000 },
  { tags: 'transparent_background solo', pages: 50 },
];

/** Two girls, for a share of general batches when duos are allowed. */
export const DUO_QUERY: PostQuery = { tags: '2girls score:>=20', pages: 30 };
export const DUO_SHARE = 0.25;

export function postsUrl(q: PostQuery, rand = Math.random()): string {
  let tags = q.tags;
  if (q.idWindow) {
    const from = ID_FROM + Math.floor(rand * (latestId() - ID_FROM - q.idWindow));
    tags += ` id:${from}..${from + q.idWindow}`;
  } else if (!q.pages) tags += ' order:random';
  const params = new URLSearchParams({ limit: '20', tags: `${tags} rating:g` });
  if (q.pages) params.set('page', String(1 + Math.floor(rand * q.pages)));
  return `${DANBOORU}/posts.json?${params}`;
}

/**
 * Lettering that would sit on the cut-out: speech bubbles, captions, titles, logos, watermarks.
 * Signatures and dates are left in — they're small, usually in a background corner, and go with
 * the background when the character is cut out.
 */
const TEXT_TAGS = [
  'speech_bubble', 'text_focus', 'english_text', 'japanese_text', 'chinese_text', 'korean_text', 'romaji_text',
  'translated', 'translation_request', 'sound_effects', 'title', 'logo', 'copyright_name', 'character_name',
  'watermark', 'web_address', 'copyright_notice', 'content_rating',
];

export const hasText = (tags: string[]) => tags.some((t) => TEXT_TAGS.includes(t));

const tagsOf = (p: DanbooruPost) => p.tag_string.split(' ').filter(Boolean);

/** Figure counts: 1girl, 2boys, 6+girls… */
const COUNT_TAG = /^(\d+)(\+?)(girls?|boys?|others?)$/;
/** Not figures to cut out, whatever the counts say. */
const NOT_A_FIGURE = ['comic', '4koma', 'multiple_views', 'reference_sheet', 'no_humans', 'solo_focus'];

/**
 * How many figures the picture shows, or 0 when it isn't a picture of figures (or the tags don't
 * say). `solo` is often simply missing, so the count tags are added up: `1boy 1girl` is two.
 * `multiple_girls` and the like only accompany an explicit count (2girls → multiple_girls), so
 * they add nothing; "6+girls" counts as a crowd.
 */
export function figureCount(tags: string[]): number {
  if (tags.some((t) => NOT_A_FIGURE.includes(t))) return 0;
  if (tags.includes('solo')) return 1;
  let n = 0;
  for (const t of tags) {
    const m = COUNT_TAG.exec(t);
    if (m) n += m[2] ? 99 : Number(m[1]);
  }
  return n;
}

/**
 * Whether a post can be a character cut-out: a still, not huge image of one figure (or two, when
 * duos are allowed). Wide shots are allowed; segmentation rejects a figure that ends up too small
 * or too wide. General queries also require girls only (the default exclusions keep male
 * characters out, and Danbooru's `1boy` isn't caught by the "boy" term).
 */
export function usablePost(p: DanbooruPost, general: boolean, allowDuo = false): boolean {
  if (!p.file_url || p.is_deleted || p.is_banned || p.rating !== 'g') return false;
  if (!['png', 'jpg', 'webp'].includes(p.file_ext) || p.file_size > 16_000_000) return false;
  if (p.image_height < 700 || p.image_width / p.image_height > 1.8) return false;
  const tags = tagsOf(p);
  if (hasText(tags)) return false;
  const n = figureCount(tags);
  if (n !== 1 && !(allowDuo && n === 2)) return false;
  return !general || tags.includes(n === 1 ? '1girl' : '2girls');
}

export function postCredit(p: DanbooruPost): Credit {
  const artist = p.tag_string_artist.split(' ')[0];
  return {
    id: `danbooru:${p.id}`,
    source: 'danbooru',
    artist: artist ? artist.replace(/_/g, ' ') : undefined,
    artistUrl: artist ? `${DANBOORU}/posts?tags=${encodeURIComponent(artist)}` : undefined,
    pageUrl: `${DANBOORU}/posts/${p.id}`,
    tags: tagsOf(p),
  };
}

export interface CharacterTag {
  /** Danbooru tag, e.g. "fern_(sousou_no_frieren)". */
  name: string;
  postCount: number;
  /** The alias the query matched, e.g. "初音ミク" for hatsune_miku. */
  alias?: string;
}

/** "fern_(sousou_no_frieren)" → "fern (sousou no frieren)" */
export const tagLabel = (name: string) => name.replace(/_/g, ' ');

/** Character tags matching what the user typed (English, romaji or Japanese names). */
export async function searchCharacters(q: string, signal?: AbortSignal): Promise<CharacterTag[]> {
  const params = new URLSearchParams({ 'search[query]': q.trim(), 'search[type]': 'tag_query', limit: '20' });
  const res = await fetch(`${DANBOORU}/autocomplete.json?${params}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = (await res.json()) as { value: string; category: number; post_count: number; antecedent?: string }[];
  return items
    .filter((t) => t.category === 4) // 4 = character
    .map((t) => ({ name: t.value, postCount: t.post_count, alias: t.antecedent }));
}
