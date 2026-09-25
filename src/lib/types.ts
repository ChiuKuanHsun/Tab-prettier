import { DEFAULT_EXCLUDED_TAGS, type TimeBucket, type Variant } from './curation';

export interface Rect { x: number; y: number; w: number; h: number }

export interface WeatherLocation { name: string; latitude: number; longitude: number }

export interface Credit {
  /** Source-scoped id, e.g. "wallhaven:nelqxr", used for blacklisting. */
  id: string;
  source: 'wallhaven' | 'nekosia' | 'waifuim' | 'danbooru' | 'upload';
  artist?: string;
  artistUrl?: string;
  pageUrl?: string;
  tags?: string[];
}

export type MediaKind = 'image' | 'video' | 'gif';

export interface SceneTheme {
  accent: string;
  ink: string;
  inkSoft: string;
  surface: string;
  glow: string;
  haze: string;
  /** True when no ink colour reached 4.5:1 over the clock region; the renderer adds a scrim. */
  scrim: boolean;
  /** Ink/surface judged against the bottom strip where the dock sits (may differ from the clock area). */
  low?: { ink: string; inkSoft: string; surface: string; accent?: string };
}

export interface SceneLayout {
  charSide: 'left' | 'right';
  /** Composition variant (older scenes have none → standard). */
  variant?: Variant;
  /** Emptiness (0..1, higher = calmer) of the left/right thirds of the background. */
  emptiness: { left: number; right: number };
  /** Normalised light direction estimated from the background (x right, y down). */
  light: { x: number; y: number };
}

export interface SceneChar {
  blob: Blob;
  width: number;
  height: number;
  /** Which image edges the character is cut off at; the renderer anchors to those. */
  cut: { left: boolean; right: boolean; bottom: boolean };
  credit: Credit;
}

export interface Scene {
  id: string;
  createdAt: number;
  bg: {
    blob: Blob;
    kind: MediaKind;
    width: number;
    height: number;
    palette: string[];
    credit: Credit;
    /** Greyscale depth map (white = near) for 2.5D motion; images only. */
    depth?: Blob;
  };
  char?: SceneChar;
  layout: SceneLayout;
  theme: SceneTheme;
  /** Time of day the background looks like; new tabs prefer scenes matching the clock. */
  bucket?: TimeBucket;
}

export interface LinkItem { id: string; title: string; url: string }
export interface LinkGroup { id: string; name: string; links: LinkItem[] }
export interface Todo { id: string; text: string; done: boolean }

export interface Upload {
  id: string;
  name: string;
  blob: Blob;
  kind: MediaKind;
  role: 'bg' | 'char';
  addedAt: number;
}

/** When a new tab shows a new scene: every tab, after N minutes, every N tabs, or once a day. */
export type Rotation = 'tab' | 'minutes' | 'tabs' | 'day';
export type RotationRule = Pick<Settings, 'rotation' | 'rotationMinutes' | 'rotationTabs'>;
export type ParticleKind = 'auto' | 'sakura' | 'bokeh' | 'rain' | 'snow' | 'off';
export type ThemeId = 'editorial' | 'dreamy' | 'neon';

export interface Settings {
  theme: ThemeId;
  rotation: Rotation;
  rotationMinutes: number;
  rotationTabs: number;
  /** 0..1 chance that a rotation shows a random favourite instead of a new scene. */
  favoritesWeight: number;
  /** Most favourites to keep; adding beyond it drops the oldest. 0 = no limit. */
  favoritesLimit: number;
  sources: {
    wallhaven: boolean;
    /** Follow the time of day (day / evening / night backgrounds); otherwise use wallhavenQuery. */
    timeAware: boolean;
    /** Comma-separated Wallhaven queries; one is picked at random per batch. */
    wallhavenQuery: string;
    nekosia: boolean;
    nekosiaCategory: string;
    waifuim: boolean;
    danbooru: boolean;
    /** Also use Danbooru pictures of two characters (never three or more). */
    allowDuo: boolean;
    /** Danbooru character tags the user likes, e.g. "fern_(sousou_no_frieren)". */
    favoriteChars: string[];
    /** 0..1 share of scenes whose character is one of favoriteChars (needs Danbooru). */
    favoriteCharsWeight: number;
    uploadsWeight: number; // 0..1 chance to use an upload when one fits
    /** Character images carrying any of these tags are skipped. */
    excludeTags: string;
    /** Characters carrying these tags win ties when choosing among candidates. */
    preferTags: string;
  };
  /** Vary the composition (close-ups, distant figures, scenery-only) instead of one layout. */
  layoutVariety: boolean;
  bgBlur: number; // px
  bgDim: number; // 0..0.6
  harmonize: number; // 0..1 colour-transfer strength
  rimLight: number; // 0..1
  parallax: number; // 0..2 multiplier
  /** 2.5D camera motion on the background from its depth map; 0 = off (flat image). */
  depthMotion: number;
  breathing: boolean;
  particles: ParticleKind;
  enterAnimation: boolean;
  /** 'cache' also stops making new scenes: stored ones take turns (see pickScene). */
  powerSave: 'auto' | 'on' | 'cache' | 'off';
  processOnlyWhenIdle: boolean;
  /** Ready scenes to keep queued; 0 = automatic (2–5, by how often scenes change). */
  queueSize: number;
  pinLinks: boolean;
  searchEngine: string;
  searchSuggest: boolean;
  /** auto = locate by IP; manual = weatherLocation; off = no weather. */
  weatherMode: 'auto' | 'manual' | 'off';
  /** The city picked by hand (used in manual mode). */
  weatherLocation: WeatherLocation | null;
  clock24h: boolean;
  clockSeconds: boolean;
  anilistClientId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'editorial',
  rotation: 'tab',
  rotationMinutes: 30,
  rotationTabs: 3,
  favoritesWeight: 0.2,
  favoritesLimit: 200,
  sources: {
    wallhaven: true,
    timeAware: true,
    wallhavenQuery: 'landscape -girl -boy, nature -girl -boy, clouds -girl -boy, city -girl -boy, sky -girl -boy, scenery',
    nekosia: true,
    nekosiaCategory: 'random',
    waifuim: true,
    danbooru: true,
    allowDuo: true,
    favoriteChars: [],
    favoriteCharsWeight: 0.3,
    uploadsWeight: 0.5,
    excludeTags: DEFAULT_EXCLUDED_TAGS,
    preferTags: '',
  },
  layoutVariety: true,
  bgBlur: 1.5,
  bgDim: 0.12,
  harmonize: 0.35,
  rimLight: 0.6,
  parallax: 1,
  depthMotion: 1,
  breathing: true,
  particles: 'auto',
  enterAnimation: true,
  powerSave: 'auto',
  processOnlyWhenIdle: false,
  queueSize: 0,
  pinLinks: false,
  searchEngine: 'default',
  searchSuggest: true,
  weatherMode: 'auto',
  weatherLocation: null,
  clock24h: true,
  clockSeconds: false,
  anilistClientId: '',
};
