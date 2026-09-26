/**
 * Content curation: tag filters, time-of-day buckets and scene variants. Pure functions, shared by
 * the offscreen pipeline (choosing images) and the new tab (choosing among queued scenes).
 */
import { t } from '../i18n';

// --- Tags ---------------------------------------------------------------------------

/** Hard safety net for waifu.im, sent as ExcludedTags on every request regardless of settings. */
export const WAIFUIM_ALWAYS_EXCLUDED = ['oppai', 'ecchi', 'ero', 'hentai', 'ass', 'paizuri', 'oral', 'milf'];

export const DEFAULT_EXCLUDED_TAGS = [
  // no male characters
  'boy', 'boys', 'male', 'man', 'men', 'husbando', 'shota', 'femboy', 'trap', 'otoko-no-ko',
  // nothing you'd be embarrassed by at work
  'nude', 'nudity', 'topless', 'naked', 'nipples', 'lingerie', 'underwear', 'panties', 'negligee',
  'bikini', 'swimsuit', 'bath', 'towel', 'cleavage', 'oppai', 'ecchi', 'ero', 'hentai', 'ass',
].join(', ');

const norm = (t: string) => t.trim().toLowerCase().replace(/[\s_]+/g, '-');

export function parseTagList(s: string): string[] {
  return [...new Set(s.split(/[,，\n]/).map(norm).filter(Boolean))];
}

/**
 * A term matches a tag when it equals the tag or appears as whole hyphen-separated words inside it:
 * "boy" matches "boy" and "cute-boy" but not "tomboy"; "cat-ears" matches "cat-ears-headphones".
 */
export function tagMatches(tag: string, term: string): boolean {
  const t = norm(tag), q = norm(term);
  if (t === q) return true;
  return `-${t}-`.includes(`-${q}-`);
}

export const isExcluded = (tags: string[] | undefined, exclude: string[]) =>
  !!tags?.some((t) => exclude.some((q) => tagMatches(t, q)));

export const preferScore = (tags: string[] | undefined, prefer: string[]) =>
  tags ? prefer.filter((q) => tags.some((t) => tagMatches(t, q))).length : 0;

// --- Time of day -----------------------------------------------------------------------

export type TimeBucket = 'day' | 'evening' | 'night';

export function timeBucket(d = new Date()): TimeBucket {
  const h = d.getHours();
  if (h >= 6 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'evening';
  return 'night';
}

export const BUCKET_LABEL: Record<TimeBucket, string> = {
  day: t('lib.bucket.day'),
  evening: t('lib.bucket.evening'),
  night: t('lib.bucket.night'),
};

/** Wallhaven queries per bucket (each has hundreds of anime results without characters). */
export const BUCKET_QUERIES: Record<TimeBucket, string[]> = {
  day: ['clouds -girl -boy', 'blue sky -girl -boy', 'landscape -girl -boy', 'nature -girl -boy'],
  evening: ['sunset -girl -boy', 'dusk -girl -boy'],
  night: ['night -girl -boy', 'night sky -girl -boy', 'city lights -girl -boy', 'starry sky -girl -boy'],
};

/**
 * What an image actually looks like, from its mean colour (0..255): dark → night, warm and not
 * bright → evening, otherwise day. Queries are only a hint; this decides which bucket a scene is
 * shown in.
 */
export function classifyBucket([r, g, b]: [number, number, number]): TimeBucket {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma < 72) return 'night';
  if (r - b > 18 && luma < 175) return 'evening';
  return 'day';
}

// --- Scene variants --------------------------------------------------------------------

/**
 * standard — character on the busy side, clock tucked behind it
 * closeup  — bust shot enlarged and cropped by the bottom edge
 * distant  — full-body figure smaller and further into the scene
 * scenery  — landscape only, clock centred
 */
export type Variant = 'standard' | 'closeup' | 'distant' | 'scenery';

export const SCENERY_CHANCE = 0.12;

/** Which compositions the user allows besides the standard one. */
export interface VariantPrefs { closeups: boolean; distantShots: boolean }

/** A scene's composition, recorded whatever the switches say (they apply when it's shown). */
export function pickCharVariant(cutBottom: boolean, rand = Math.random()): Variant {
  if (cutBottom) return rand < 0.35 ? 'closeup' : 'standard';
  return rand < 0.3 ? 'distant' : 'standard';
}

/**
 * The composition to show a scene in: one the user has switched off becomes the standard one.
 * Only the display changes, so switching it back on restores it.
 */
export function shownVariant(v: Variant | undefined, allow: VariantPrefs): Variant | undefined {
  if ((v === 'closeup' && !allow.closeups) || (v === 'distant' && !allow.distantShots)) return 'standard';
  return v;
}

// --- Colour matching -------------------------------------------------------------------

type Lab = { mean: [number, number, number] };

/**
 * How far apart two images' overall colour moods are (Lab means; lightness counts half, since
 * the colour transfer can shift it more freely than hue). Lower = better match.
 */
export function moodDistance(a: Lab, b: Lab): number {
  const dl = (a.mean[0] - b.mean[0]) * 0.5;
  const da = a.mean[1] - b.mean[1];
  const db = a.mean[2] - b.mean[2];
  return Math.hypot(dl, da, db);
}
