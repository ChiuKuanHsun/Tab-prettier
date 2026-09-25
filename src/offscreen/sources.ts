import { kvGet, kvSet } from '../lib/db';
import type { Credit, Settings } from '../lib/types';
import { fetchJson } from './image';

export interface Candidate {
  url: string;
  credit: Credit;
  palette?: string[];
}

/**
 * Each source keeps a small pool of candidates in IndexedDB, so one API call feeds several
 * scenes (Wallhaven allows 45 req/min; Nekosia and waifu.im are also rate limited).
 */
async function fromPool(key: string, blacklist: Set<string>, refill: () => Promise<Candidate[]>) {
  let pool = (await kvGet<Candidate[]>(key)) ?? [];
  pool = pool.filter((c) => !blacklist.has(c.credit.id));
  if (!pool.length) pool = (await refill()).filter((c) => !blacklist.has(c.credit.id));
  const next = pool.shift();
  await kvSet(key, pool);
  if (!next) throw new Error(`${key}: no candidates`);
  return next;
}

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

interface WallhavenItem {
  id: string;
  url: string;
  path: string;
  colors: string[];
  file_size: number;
  dimension_x: number;
  dimension_y: number;
}

export function wallhaven(s: Settings, blacklist: Set<string>) {
  return fromPool('pool:wallhaven', blacklist, async () => {
    const queries = s.sources.wallhavenQuery.split(',').map((q) => q.trim()).filter(Boolean);
    const params = new URLSearchParams({
      categories: '010', // anime only
      purity: '100', // SFW only
      sorting: 'random',
      ratios: '16x9,16x10,21x9',
      atleast: '1920x1080',
      q: pick(queries.length ? queries : ['landscape']),
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
  return fromPool('pool:nekosia', blacklist, async () => {
    const cat = encodeURIComponent(s.sources.nekosiaCategory || 'random');
    const params = new URLSearchParams({ count: '6', session: 'id', id: await nekosiaSession(), rating: 'safe' });
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
        tags: d.tags,
      },
    }));
  });
}

interface WaifuImItem {
  id: number;
  url: string;
  source: string | null;
  isAnimated: boolean;
  artists: { name: string; pixiv: string | null; twitter: string | null }[];
  tags: { slug: string }[];
}

export function waifuim(_s: Settings, blacklist: Set<string>) {
  return fromPool('pool:waifuim', blacklist, async () => {
    const params = new URLSearchParams({ IncludedTags: 'waifu', IsNsfw: 'False', OrderBy: 'Random', PageSize: '6' });
    const res = await fetchJson<{ items: WaifuImItem[] }>(`https://api.waifu.im/images?${params}`);
    return res.items
      .filter((d) => !d.isAnimated)
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
