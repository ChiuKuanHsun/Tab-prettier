import { BUCKET_QUERIES, isExcluded, parseTagList, WAIFUIM_ALWAYS_EXCLUDED, type TimeBucket } from '../lib/curation';
import { kvGet, kvSet } from '../lib/db';
import type { Credit, Settings } from '../lib/types';
import { fetchJson } from './image';

export interface Candidate {
  url: string;
  credit: Credit;
  palette?: string[];
  /** IndexedDB key of the pool it came from, so an unused candidate can be put back. */
  pool?: string;
  /** Set once it has been put back after losing a colour match; it isn't put back again. */
  returned?: boolean;
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
  if (!pool.some((p) => p.credit.id === c.credit.id)) await kvSet(c.pool, [...pool, { ...c, returned: true }].slice(-30));
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

export function wallhaven(s: Settings, blacklist: Set<string>, bucket: TimeBucket) {
  const timed = s.sources.timeAware;
  return fromPool(timed ? `pool:wallhaven:${bucket}` : 'pool:wallhaven', notBlacklisted(blacklist), async () => {
    const custom = s.sources.wallhavenQuery.split(',').map((q) => q.trim()).filter(Boolean);
    const queries = timed ? BUCKET_QUERIES[bucket] : custom.length ? custom : ['landscape'];
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
