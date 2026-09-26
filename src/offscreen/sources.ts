import { BUCKET_QUERIES, isExcluded, parseTagList, WAIFUIM_ALWAYS_EXCLUDED, type TimeBucket } from '../lib/curation';
import { WEATHER_QUERIES, type WeatherMood } from '../lib/weather';
import {
  DUO_QUERY,
  DUO_SHARE,
  figureCount,
  GENERAL_QUERIES,
  postCredit,
  postsUrl,
  usablePost,
  type DanbooruPost,
  type PostQuery,
} from '../lib/danbooru';
import { kvGet, kvSet } from '../lib/db';
import { lookupCharacter } from '../lib/char-map';
import { drawCharacter, MIN_POSTS, type ListAnime, type ListCharacter } from '../lib/list-chars';
import type { BirthdayOf, Credit, Settings } from '../lib/types';
import { fetchJson } from './image';

export interface Candidate {
  url: string;
  credit: Credit;
  palette?: string[];
  /** IndexedDB key of the pool it came from, so an unused candidate can be put back. */
  pool?: string;
  /** Set once it has been put back after losing a colour match; it isn't put back again. */
  returned?: boolean;
  /** The birthday this candidate was fetched for; not kept when it goes back to its pool. */
  birthday?: BirthdayOf;
}

type Keep = (c: Candidate) => boolean;

/**
 * Each source keeps a small pool of candidates in IndexedDB, so one API call feeds several
 * scenes (Wallhaven allows 45 req/min; Nekosia and waifu.im are also rate limited).
 */
async function fromPool(key: string, keep: Keep, refill: () => Promise<Candidate[]>) {
  let pool = ((await kvGet<Candidate[]>(key)) ?? []).filter(keep);
  // A strict tag filter can empty a fresh batch; try a couple of batches before giving up.
  for (let i = 0; i < 3 && !pool.length; i++) pool = (await refill()).filter(keep);
  const next = pool.shift();
  await kvSet(key, pool);
  if (!next) throw new Error(`${key}: no candidates`);
  return { ...next, pool: key };
}

/**
 * Puts a good-but-unused candidate back into its pool for a later scene (it may suit another
 * background better). Only once — otherwise a consistent loser would be re-downloaded and
 * re-segmented for every scene.
 */
export async function returnToPool(c: Candidate) {
  if (!c.pool || c.returned) return;
  const pool = (await kvGet<Candidate[]>(c.pool)) ?? [];
  const { birthday: _, ...rest } = c;
  if (!pool.some((p) => p.credit.id === c.credit.id)) await kvSet(c.pool, [...pool, { ...rest, returned: true }].slice(-30));
}

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const notBlacklisted = (blacklist: Set<string>): Keep => (c) => !blacklist.has(c.credit.id);

function characterFilter(s: Settings, blacklist: Set<string>): Keep {
  const exclude = parseTagList(s.sources.excludeTags);
  return (c) => !blacklist.has(c.credit.id) && !isExcluded(c.credit.tags, exclude);
}

interface WallhavenItem {
  id: string;
  url: string;
  path: string;
  colors: string[];
  file_size: number;
}

/**
 * Background candidates. With time-awareness on, queries follow the time of day — or, 60% of the
 * time when it is raining/snowing/foggy outside, the weather.
 */
export function wallhaven(s: Settings, blacklist: Set<string>, bucket: TimeBucket, weather?: WeatherMood) {
  const timed = s.sources.timeAware;
  const weatherQueries = timed && weather ? WEATHER_QUERIES[weather] : undefined;
  const useWeather = !!weatherQueries && Math.random() < 0.6;
  const key = useWeather ? `pool:wallhaven:weather:${weather}` : timed ? `pool:wallhaven:${bucket}` : 'pool:wallhaven';
  return fromPool(key, notBlacklisted(blacklist), async () => {
    const custom = s.sources.wallhavenQuery.split(',').map((q) => q.trim()).filter(Boolean);
    const queries = useWeather ? weatherQueries! : timed ? BUCKET_QUERIES[bucket] : custom.length ? custom : ['landscape'];
    const params = new URLSearchParams({
      categories: '010', // anime only
      purity: '100', // SFW only
      sorting: 'random',
      ratios: '16x9,16x10,21x9',
      atleast: '1920x1080',
      q: pick(queries),
    });
    const res = await fetchJson<{ data: WallhavenItem[] }>(`https://wallhaven.cc/api/v1/search?${params}`);
    return res.data
      .filter((d) => d.file_size < 9_000_000)
      .map((d) => ({
        url: d.path,
        palette: d.colors,
        credit: { id: `wallhaven:${d.id}`, source: 'wallhaven' as const, pageUrl: d.url },
      }));
  });
}

interface NekosiaImage {
  id: string;
  category: string;
  image: { compressed: { url: string }; original: { url: string } };
  colors: { main: string; palette: string[] };
  tags: string[];
  source: { url: string | null };
  attribution: { artist: { username: string | null; profile: string | null } };
}

async function nekosiaSession() {
  let id = await kvGet<string>('nekosia:session');
  if (!id) {
    id = crypto.randomUUID();
    await kvSet('nekosia:session', id);
  }
  return id;
}

export function nekosia(s: Settings, blacklist: Set<string>) {
  return fromPool('pool:nekosia', characterFilter(s, blacklist), async () => {
    const cat = encodeURIComponent(s.sources.nekosiaCategory || 'random');
    // rating=safe: Nekosia's strictest rating (no revealing outfits)
    const params = new URLSearchParams({ count: '8', session: 'id', id: await nekosiaSession(), rating: 'safe' });
    const res = await fetchJson<{ images?: NekosiaImage[] } & Partial<NekosiaImage>>(
      `https://api.nekosia.cat/api/v1/images/${cat}?${params}`,
    );
    const images = res.images ?? (res.id ? [res as NekosiaImage] : []);
    return images.map((d) => ({
      url: d.image.compressed.url || d.image.original.url,
      palette: d.colors.palette,
      credit: {
        id: `nekosia:${d.id}`,
        source: 'nekosia' as const,
        artist: d.attribution.artist.username ?? undefined,
        artistUrl: d.attribution.artist.profile ?? undefined,
        pageUrl: d.source.url ?? undefined,
        tags: [...new Set([d.category, ...d.tags].filter(Boolean))],
      },
    }));
  });
}

interface WaifuImItem {
  id: number;
  url: string;
  source: string | null;
  isAnimated: boolean;
  isNsfw: boolean;
  artists: { name: string; pixiv: string | null; twitter: string | null }[];
  tags: { slug: string }[];
}

export function waifuim(s: Settings, blacklist: Set<string>) {
  return fromPool('pool:waifuim', characterFilter(s, blacklist), async () => {
    const params = new URLSearchParams({ IncludedTags: 'waifu', IsNsfw: 'False', OrderBy: 'Random', PageSize: '8' });
    for (const t of WAIFUIM_ALWAYS_EXCLUDED) params.append('ExcludedTags', t);
    const res = await fetchJson<{ items: WaifuImItem[] }>(`https://api.waifu.im/images?${params}`);
    return res.items
      .filter((d) => !d.isAnimated && !d.isNsfw)
      .map((d) => ({
        url: d.url,
        credit: {
          id: `waifuim:${d.id}`,
          source: 'waifuim' as const,
          artist: d.artists[0]?.name,
          artistUrl: d.artists[0]?.pixiv ?? d.artists[0]?.twitter ?? undefined,
          pageUrl: d.source ?? undefined,
          tags: d.tags.map((t) => t.slug),
        },
      }));
  });
}

/**
 * A Danbooru tag for a random ticked character from the user's AniList shows (main characters
 * twice as likely). The lookup is cached, so this rarely touches the network; characters without
 * a sure match or with too few images are passed over.
 */
export async function listCharacterTag(anime: ListAnime[]): Promise<string | undefined> {
  for (let i = 0; i < 4; i++) {
    const c = drawCharacter(pick(anime).characters);
    const tag = c && (await usableTag(c));
    if (tag) return tag;
  }
  return undefined;
}

async function usableTag(c: ListCharacter) {
  const match = await lookupCharacter(c);
  return match && match.posts >= MIN_POSTS ? match.tag : undefined;
}

/** The Danbooru tag of one of today's birthday characters (tried in random order), with who it is. */
export async function birthdayCharacterTag(chars: ListCharacter[]): Promise<{ tag: string; birthday: BirthdayOf } | undefined> {
  for (const c of [...chars].sort(() => Math.random() - 0.5)) {
    const tag = c.birthday && (await usableTag(c));
    if (tag) return { tag, birthday: { name: c.name.native || c.name.full, ...c.birthday! } };
  }
  return undefined;
}

/**
 * After a query fails twice in a row (database timeouts, or Cloudflare's bot check when requests
 * come too fast), Danbooru is skipped for a while so the other sources take over.
 */
const DANBOORU_REST_KEY = 'danbooru:restUntil';
const DANBOORU_REST_MS = 10 * 60_000;
export const danbooruResting = async () => ((await kvGet<number>(DANBOORU_REST_KEY)) ?? 0) > Date.now();

/**
 * Danbooru characters (general rating). With `character` set, only that character's images
 * (each favourite has its own pool); otherwise well-liked single girls, sometimes
 * transparent-background art that needs no segmentation, and some pairs when duos are allowed.
 * Tag names never contain spaces, so a favourite is always a single tag.
 */
export async function danbooru(s: Settings, blacklist: Set<string>, character?: string) {
  if (await danbooruResting()) throw new Error('danbooru: resting after repeated failures');
  const general = !character;
  const duo = s.sources.allowDuo;
  const q = character ? { tags: character } : duo && Math.random() < DUO_SHARE ? DUO_QUERY : pick(GENERAL_QUERIES);
  const key = general ? `pool:danbooru:${q.tags}` : `pool:danbooru:char:${q.tags}`;
  const allowed = characterFilter(s, blacklist);
  // a pool filled while duos were allowed may still hold some
  const keep: Keep = (c) => allowed(c) && (duo || figureCount(c.credit.tags ?? []) === 1);
  return fromPool(key, keep, async () => {
    // Queries sometimes time out when the server is busy: retry once (early pages always
    // answer; an id window is re-drawn), then leave Danbooru alone for a while.
    const get = (q: PostQuery) => fetchJson<DanbooruPost[]>(postsUrl(q));
    const posts = await get(q)
      .catch(() => get(q.pages ? { ...q, pages: 5 } : q))
      .catch(async (e) => {
        await kvSet(DANBOORU_REST_KEY, Date.now() + DANBOORU_REST_MS);
        throw e;
      });
    return posts.filter((p) => usablePost(p, general, duo)).map((p) => ({ url: p.file_url!, credit: postCredit(p) }));
  });
}
