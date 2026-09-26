import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { db, queueCount, type FavoriteScene } from '../lib/db';
import { favoriteBytes } from '../lib/scene-store';
import { QUEUE_MAX, queueTarget, send } from '../lib/messages';
import {
  getBlacklist,
  getLinks,
  getNotes,
  getSettings,
  getTodos,
  saveBlacklist,
  saveLinks,
  saveNotes,
  saveSettings,
  saveTodos,
  uid,
} from '../lib/settings';
import type { MediaKind, Settings, Upload } from '../lib/types';
import { DEFAULT_EXCLUDED_TAGS } from '../lib/curation';
import { getToken, myListAnime } from '../lib/anilist';
import { searchCharacters, tagLabel, type CharacterTag } from '../lib/danbooru';
import { isPicked, type ListAnime } from '../lib/list-chars';
import { ListCharacters, useCharPicks } from '../widgets/ListCharacters';
import { detectLocation, geocode, type Place } from '../lib/weather';
import { THEMES } from '../themes';
import { requestHosts, SUGGEST, useHosts, WALLHAVEN } from '../lib/permissions';
import { t, tRich } from '../i18n';
import { SECTION_IDS, type SectionId } from './sections';

const NEKOSIA_CATEGORIES = ['random', 'catgirl', 'foxgirl', 'wolf-girl', 'animal-ears', 'maid', 'uniform', 'cute', 'young-girl', 'white-hair', 'blue-hair', 'kimono', 'vtuber'];

function Section({ id, title, note, children }: { id: SectionId; title: string; note?: string; children: ComponentChildren }) {
  return (
    <section id={id} class="opt-section">
      <header>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
        <a class="opt-help" href={`help.html#${id}`} target="_blank">
          {t('common.help')}
        </a>
      </header>
      <div class="opt-fields">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ComponentChildren }) {
  return (
    <label class="opt-field">
      <span class="opt-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span class="opt-control">{children}</span>
    </label>
  );
}

/**
 * A switch for a feature that reaches a site the extension may not be allowed to yet: switching
 * it on asks Chrome first (and stays off if declined); on but not allowed shows a line to allow it.
 */
function HostSwitch(props: { label: string; hint?: string; on: boolean; origins: string[]; onChange: (on: boolean) => void }) {
  const allowed = useHosts(props.origins);
  return (
    <>
      <Field label={props.label} hint={props.hint}>
        <input
          type="checkbox"
          checked={props.on}
          onChange={async (e) => {
            if (props.on) return props.onChange(false);
            (e.target as HTMLInputElement).checked = false; // until Chrome says yes
            if (await requestHosts(props.origins)) props.onChange(true);
          }}
        />
      </Field>
      {props.on && allowed === false && (
        <p class="opt-warn opt-host-warn">
          {t('options.permission.missing')}
          <button type="button" class="opt-link" onClick={() => void requestHosts(props.origins)}>
            {t('widgets.permission.allow')}
          </button>
        </p>
      )}
    </>
  );
}

function Range(props: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))} />
      <output>{props.fmt ? props.fmt(props.value) : props.value}</output>
    </>
  );
}

/**
 * Favourite characters as Danbooru character tags, picked from Danbooru's own autocomplete
 * (English, romaji or Japanese names all resolve to the tag).
 */
function CharacterPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CharacterTag[]>([]);
  const [active, setActive] = useState(0);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    const term = q.trim();
    // One kana/kanji is already specific; one latin letter isn't.
    if (term.length < (/^[\x00-\x7f]*$/.test(term) ? 2 : 1)) {
      setResults([]);
      setErr(undefined);
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      searchCharacters(term, ctl.signal).then(
        (r) => {
          setResults(r.filter((c) => !value.includes(c.name)));
          setActive(0);
          setErr(r.length ? undefined : t('options.chars.notFound'));
        },
        () => !ctl.signal.aborted && setErr(t('options.chars.offline')),
      );
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q]);

  const add = (name: string) => {
    if (!value.includes(name)) onChange([...value, name]);
    setQ('');
    setResults([]);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) add(results[active].name);
    } else if (e.key === 'Escape') {
      setResults([]);
    }
  };

  return (
    <div class="char-picker">
      {value.length > 0 && (
        <ul class="char-chips">
          {value.map((name) => (
            <li key={name}>
              <span>{tagLabel(name)}</span>
              <button type="button" aria-label={t('options.chars.remove', { name: tagLabel(name) })} onClick={() => onChange(value.filter((v) => v !== name))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        class="wide"
        value={q}
        placeholder={t('options.chars.placeholder')}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="char-results"
        aria-activedescendant={results.length ? `char-opt-${active}` : undefined}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        onKeyDown={onKeyDown}
      />
      {err && <small class="opt-warn">{err}</small>}
      {results.length > 0 && (
        <ul id="char-results" class="char-results" role="listbox">
          {results.map((c, i) => (
            <li
              key={c.name}
              id={`char-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                add(c.name);
              }}
            >
              <span>{tagLabel(c.name)}</span>
              {c.alias && <small>{c.alias}</small>}
              <small class="char-count">{t('options.chars.posts', { n: c.postCount.toLocaleString() })}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Characters from the user's AniList lists: which lists, how often, and which shows (all by
 * default; unticked ones are remembered, so shows added later are included).
 */
function ListChars({ src, setSrc }: { src: Settings['sources']; setSrc: (patch: Partial<Settings['sources']>) => void }) {
  // undefined while loading, null when not logged in to AniList
  const [anime, setAnime] = useState<ListAnime[] | null>();
  const [err, setErr] = useState<string>();
  // the show whose characters are open
  const [open, setOpen] = useState<number>();
  const picks = useCharPicks();

  const load = async (force = false) => {
    setErr(undefined);
    const token = await getToken();
    if (!token) return setAnime(null);
    setAnime(undefined);
    try {
      setAnime(await myListAnime(token, force));
    } catch (e) {
      setErr((e as Error).message);
      setAnime([]);
    }
  };
  useEffect(() => {
    if (src.listChars) void load();
  }, [src.listChars]);

  const shown = (anime ?? []).filter((a) => (a.status === 'CURRENT' ? src.listWatching : src.listCompleted));
  const excluded = new Set(src.listExcluded);
  const chosen = shown.filter((a) => !excluded.has(a.id)).length;
  const toggle = (id: number) =>
    setSrc({ listExcluded: excluded.has(id) ? src.listExcluded.filter((x) => x !== id) : [...src.listExcluded, id] });

  return (
    <>
      <Field label={t('options.listChars.label')} hint={t('options.listChars.hint')}>
        <input type="checkbox" checked={src.listChars} onChange={() => setSrc({ listChars: !src.listChars })} />
      </Field>
      {src.listChars && (
        <>
          <Field label={t('options.listChars.weight')} hint={t('options.listChars.weightHint')}>
            <Range
              value={src.listCharsWeight}
              min={0.05}
              max={1}
              step={0.05}
              onChange={(v) => setSrc({ listCharsWeight: v })}
              fmt={(v) => `${Math.round(v * 100)}%`}
            />
          </Field>
          <Field label={t('options.listChars.birthdays')} hint={t('options.listChars.birthdaysHint')}>
            <input type="checkbox" checked={src.listBirthdays} onChange={() => setSrc({ listBirthdays: !src.listBirthdays })} />
          </Field>
          <div class="opt-field opt-field-block">
            <div class="focus-chips">
              <label class="radio">
                <input type="checkbox" checked={src.listWatching} onChange={() => setSrc({ listWatching: !src.listWatching })} />
                {t('options.listChars.watching')}
              </label>
              <label class="radio">
                <input type="checkbox" checked={src.listCompleted} onChange={() => setSrc({ listCompleted: !src.listCompleted })} />
                {t('options.listChars.completed')}
              </label>
            </div>
            {anime === null && <small class="opt-warn">{t('options.listChars.noLogin')}</small>}
            {anime === undefined && <small class="opt-muted">{t('common.loading')}</small>}
            {err && <small class="opt-warn">{t('common.loadFailed', { error: err })}</small>}
            {anime && (
              <small class="opt-muted">
                {t('options.listChars.chosen', { n: chosen, total: shown.length })}
                <button type="button" class="opt-link" onClick={() => setSrc({ listExcluded: [] })}>
                  {t('options.listChars.all')}
                </button>
                <button type="button" class="opt-link" onClick={() => setSrc({ listExcluded: (anime ?? []).map((a) => a.id) })}>
                  {t('options.listChars.none')}
                </button>
                <button type="button" class="opt-link" onClick={() => void load(true)}>
                  {t('widgets.anime.refresh')}
                </button>
              </small>
            )}
            {shown.length > 0 && (
              <ul class="list-anime">
                {shown.map((a) => (
                  <li key={a.id}>
                    <div class="list-anime-row">
                      <label>
                        <input type="checkbox" checked={!excluded.has(a.id)} onChange={() => toggle(a.id)} />
                        {a.cover && <img src={a.cover} alt="" loading="lazy" />}
                        <span>{a.title.native || a.title.romaji}</span>
                      </label>
                      <button
                        type="button"
                        class="opt-link"
                        aria-expanded={open === a.id}
                        onClick={() => setOpen(open === a.id ? undefined : a.id)}
                      >
                        {t('options.listChars.chars', {
                          n: a.characters.filter((c) => isPicked(c, picks)).length,
                          total: a.characters.length,
                        })}
                      </button>
                    </div>
                    {open === a.id && (
                      <div class="list-anime-cast">
                        <ListCharacters anime={a} picks={picks} disabled={excluded.has(a.id) ? t('widgets.listChars.showOff') : undefined} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** City search for the weather: Open-Meteo geocoding, results picked from a short list. */
function WeatherPicker({
  mode,
  value,
  onChange,
}: {
  mode: Settings['weatherMode'];
  value: Settings['weatherLocation'];
  onChange: (patch: Pick<Settings, 'weatherMode' | 'weatherLocation'>) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>();
  const [err, setErr] = useState<string>();
  const [detected, setDetected] = useState<string>();

  const detect = (force = false) => {
    setDetected(undefined);
    detectLocation(force).then(
      (l) => setDetected(l.name),
      () => setDetected(t('options.weather.detectFailed')),
    );
  };

  useEffect(() => {
    if (mode === 'auto') detect();
  }, [mode]);

  const search = async (e: Event) => {
    e.preventDefault();
    if (!q.trim()) return;
    setErr(undefined);
    try {
      const r = await geocode(q);
      setResults(r);
      if (!r.length) setErr(t('options.weather.notFound'));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const modes: [Settings['weatherMode'], string][] = [
    ['auto', t('options.weather.auto')],
    ['manual', t('options.weather.manual')],
    ['off', t('common.off')],
  ];

  return (
    <div class="opt-field opt-field-block">
      <span class="opt-label">
        {t('options.weather.label')}
        <small>{t('options.weather.hint')}</small>
      </span>
      <div class="focus-chips" role="radiogroup" aria-label={t('options.weather.location')}>
        {modes.map(([m, label]) => (
          <label key={m} class="radio">
            <input type="radio" name="weather-mode" checked={mode === m} onChange={() => onChange({ weatherMode: m, weatherLocation: value })} />
            {label}
          </label>
        ))}
      </div>
      {mode === 'auto' && (
        <small class="opt-muted">
          {t('options.weather.detected', { place: detected ?? t('options.weather.detecting') })}
          <button type="button" class="opt-link" disabled={detected === undefined} onClick={() => detect(true)}>
            {t('options.weather.redetect')}
          </button>
        </small>
      )}
      {mode === 'manual' && (
        <>
          <small class="opt-muted">{value ? t('options.weather.current', { place: value.name }) : t('options.weather.none')}</small>
          <form class="weather-search" onSubmit={search}>
            <input value={q} placeholder={t('options.weather.placeholder')} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
            <button type="submit" class="opt-button">{t('common.search')}</button>
          </form>
          {err && <small class="opt-warn">{err}</small>}
          {results && results.length > 0 && (
            <ul class="weather-results">
              {results.map((r) => {
                const name = [r.name, r.admin1, r.country].filter(Boolean).join(t('common.listSep'));
                return (
                  <li key={`${r.latitude},${r.longitude}`}>
                    <button
                      type="button"
                      class="opt-link"
                      onClick={() => {
                        onChange({ weatherMode: 'manual', weatherLocation: { name: r.name, latitude: r.latitude, longitude: r.longitude } });
                        setResults(undefined);
                        setQ('');
                      }}
                    >
                      {name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

const mb = (bytes: number) => (bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0);

const kindOf = (f: File): MediaKind => (f.type.startsWith('video/') ? 'video' : f.type === 'image/gif' ? 'gif' : 'image');

function Thumb({ blob, kind }: { blob: Blob; kind: MediaKind }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return kind === 'video' ? <video src={url} muted /> : <img src={url} alt="" />;
}

function FavoriteThumb({ fav }: { fav: FavoriteScene }) {
  const bg = useMemo(() => URL.createObjectURL(fav.bg.blob), [fav]);
  const ch = useMemo(() => (fav.char ? URL.createObjectURL(fav.char.blob) : undefined), [fav]);
  useEffect(() => () => [bg, ch].forEach((u) => u && URL.revokeObjectURL(u)), [bg, ch]);
  return (
    <div class="fav-thumb">
      {fav.bg.kind === 'video' ? <video src={bg} muted /> : <img src={bg} alt="" />}
      {ch && <img class={`fav-char fav-char-${fav.layout.charSide}`} src={ch} alt="" />}
    </div>
  );
}

export function Options() {
  const [s, setS] = useState<Settings>();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [favs, setFavs] = useState<FavoriteScene[]>([]);
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [queue, setQueue] = useState(0);
  const [toast, setToast] = useState<string>();
  const [storageUsed, setStorageUsed] = useState<number>();
  const [confirmClear, setConfirmClear] = useState(false);

  const reload = async () => {
    const d = await db();
    setUploads(await d.getAll('uploads'));
    setFavs((await d.getAll('favorites')).sort((a, b) => b.favAt - a.favAt));
    setBlacklist(await getBlacklist());
    setQueue(await queueCount());
    setStorageUsed((await navigator.storage.estimate().catch(() => undefined))?.usage);
  };

  useEffect(() => {
    void getSettings().then(setS);
    void reload();
  }, []);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(undefined), 2400);
  };

  if (!s) return null;

  const set = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    void saveSettings(next);
  };
  const setSrc = (patch: Partial<Settings['sources']>) => set({ sources: { ...s.sources, ...patch } });

  const regenerate = async () => {
    await (await db()).clear('queue');
    // an explicit request: runs even in the cache-only power mode
    await send({ to: 'bg', type: 'refill', force: true });
    setQueue(0);
    flash(t('options.regenerating'));
  };

  const addUploads = async (files: FileList | null, role: Upload['role']) => {
    if (!files) return;
    const d = await db();
    for (const f of Array.from(files)) {
      await d.put('uploads', { id: uid(), name: f.name, blob: f, kind: kindOf(f), role, addedAt: Date.now() });
    }
    await reload();
    flash(t('options.added', { n: files.length }));
  };

  const exportData = async () => {
    const data = { settings: s, links: await getLinks(), todos: await getTodos(), notes: await getNotes(), blacklist };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `tab-prettier-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.settings) await saveSettings(data.settings);
      if (data.links) await saveLinks(data.links);
      if (data.todos) await saveTodos(data.todos);
      if (typeof data.notes === 'string') await saveNotes(data.notes);
      if (Array.isArray(data.blacklist)) await saveBlacklist(data.blacklist);
      setS(await getSettings());
      await reload();
      flash(t('options.imported'));
    } catch {
      flash(t('options.badFile'));
    }
  };

  return (
    <div class="opt">
      <header class="opt-hero">
        <p class="opt-kicker">TAB PRETTIER</p>
        <h1>{t('options.heading')}</h1>
        <p class="opt-status">
          {tRich('options.queue', { n: <strong>{queue}</strong> })}
          <button type="button" class="opt-link" onClick={regenerate}>
            {t('options.regenerate')}
          </button>
        </p>
      </header>

      <nav class="opt-nav">
        {SECTION_IDS.map((id) => (
          <a key={id} href={`#${id}`}>
            {t(`options.nav.${id}`)}
          </a>
        ))}
        <a class="opt-nav-help" href="help.html" target="_blank">
          {t('options.helpLink')}
        </a>
      </nav>

      <Section id="look" title={t('options.nav.look')}>
        <div class="theme-cards" role="radiogroup" aria-label={t('options.look.theme')}>
          {THEMES.map((th) => (
            <label key={th.id} class={`theme-card theme-card-${th.id}`}>
              <input type="radio" name="theme" checked={s.theme === th.id} onChange={() => set({ theme: th.id })} />
              <span class="theme-sample">14:32</span>
              <strong>{th.label}</strong>
              <small>{th.note}</small>
            </label>
          ))}
        </div>
        <Field label={t('options.look.rotation')} hint={t('options.look.rotationHint')}>
          <select value={s.rotation} onChange={(e) => set({ rotation: (e.target as HTMLSelectElement).value as Settings['rotation'] })}>
            <option value="tab">{t('options.look.rotationTab')}</option>
            <option value="minutes">{t('options.look.rotationMinutes')}</option>
            <option value="tabs">{t('options.look.rotationTabs')}</option>
            <option value="day">{t('options.look.rotationDay')}</option>
          </select>
        </Field>
        {s.rotation === 'minutes' && (
          <Field label={t('options.look.minutes')} hint={t('options.look.minutesHint')}>
            <input
              type="number"
              class="num"
              min={1}
              max={1440}
              value={s.rotationMinutes}
              onChange={(e) => set({ rotationMinutes: Math.min(1440, Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1))) })}
            />
            <span class="unit">{t('options.look.minutesUnit')}</span>
          </Field>
        )}
        {s.rotation === 'tabs' && (
          <Field label={t('options.look.tabs')} hint={t('options.look.tabsHint')}>
            <input
              type="number"
              class="num"
              min={1}
              max={100}
              value={s.rotationTabs}
              onChange={(e) => set({ rotationTabs: Math.min(100, Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1))) })}
            />
            <span class="unit">{t('options.look.tabsUnit')}</span>
          </Field>
        )}
        <Field label={t('options.look.clock24h')}>
          <input type="checkbox" checked={s.clock24h} onChange={() => set({ clock24h: !s.clock24h })} />
        </Field>
        <Field label={t('options.look.seconds')} hint={t('options.look.secondsHint')}>
          <input type="checkbox" checked={s.clockSeconds} onChange={() => set({ clockSeconds: !s.clockSeconds })} />
        </Field>
        <Field label={t('options.look.pinLinks')} hint={t('options.look.pinLinksHint')}>
          <input type="checkbox" checked={s.pinLinks} onChange={() => set({ pinLinks: !s.pinLinks })} />
        </Field>
        <HostSwitch
          label={t('options.look.suggest')}
          hint={t('options.look.suggestHint')}
          on={s.searchSuggest}
          origins={SUGGEST}
          onChange={(on) => set({ searchSuggest: on })}
        />
        <WeatherPicker mode={s.weatherMode} value={s.weatherLocation} onChange={(patch) => set(patch)} />
      </Section>

      <Section id="sources" title={t('options.nav.sources')} note={t('options.sources.note')}>
        <HostSwitch
          label={t('options.sources.wallhaven')}
          on={s.sources.wallhaven}
          origins={WALLHAVEN}
          onChange={(on) => setSrc({ wallhaven: on })}
        />
        <Field label={t('options.sources.timeAware')} hint={t('options.sources.timeAwareHint')}>
          <input type="checkbox" checked={s.sources.timeAware} onChange={() => setSrc({ timeAware: !s.sources.timeAware })} />
        </Field>
        {!s.sources.timeAware && (
          <Field label={t('options.sources.query')} hint={t('options.sources.queryHint')}>
            <input class="wide" value={s.sources.wallhavenQuery} onChange={(e) => setSrc({ wallhavenQuery: (e.target as HTMLInputElement).value })} />
          </Field>
        )}
        <Field label={t('options.sources.nekosia')}>
          <input type="checkbox" checked={s.sources.nekosia} onChange={() => setSrc({ nekosia: !s.sources.nekosia })} />
        </Field>
        <Field label={t('options.sources.nekosiaCategory')}>
          <input list="nekosia-cats" value={s.sources.nekosiaCategory} onChange={(e) => setSrc({ nekosiaCategory: (e.target as HTMLInputElement).value })} />
          <datalist id="nekosia-cats">
            {NEKOSIA_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={t('options.sources.waifuim')}>
          <input type="checkbox" checked={s.sources.waifuim} onChange={() => setSrc({ waifuim: !s.sources.waifuim })} />
        </Field>
        <Field label={t('options.sources.danbooru')} hint={t('options.sources.danbooruHint')}>
          <input type="checkbox" checked={s.sources.danbooru} onChange={() => setSrc({ danbooru: !s.sources.danbooru })} />
        </Field>
        {s.sources.danbooru && (
          <Field label={t('options.sources.duo')} hint={t('options.sources.duoHint')}>
            <input type="checkbox" checked={s.sources.allowDuo} onChange={() => setSrc({ allowDuo: !s.sources.allowDuo })} />
          </Field>
        )}
        <div class="opt-field opt-field-block">
          <span class="opt-label">
            {t('options.sources.favoriteChars')}
            <small>{s.sources.danbooru ? t('options.sources.favoriteCharsHint') : t('options.sources.favoriteCharsOff')}</small>
          </span>
          <CharacterPicker value={s.sources.favoriteChars} onChange={(favoriteChars) => setSrc({ favoriteChars })} />
        </div>
        {s.sources.danbooru && s.sources.favoriteChars.length > 0 && (
          <Field label={t('options.sources.favoriteCharsWeight')} hint={t('options.sources.favoriteCharsWeightHint')}>
            <Range
              value={s.sources.favoriteCharsWeight}
              min={0.05}
              max={1}
              step={0.05}
              onChange={(v) => setSrc({ favoriteCharsWeight: v })}
              fmt={(v) => `${Math.round(v * 100)}%`}
            />
          </Field>
        )}
        {s.sources.danbooru && <ListChars src={s.sources} setSrc={setSrc} />}
        <Field label={t('options.sources.uploadsWeight')} hint={t('options.sources.uploadsWeightHint')}>
          <Range value={s.sources.uploadsWeight} min={0} max={1} step={0.05} onChange={(v) => setSrc({ uploadsWeight: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Field>
        <div class="opt-field opt-field-block">
          <span class="opt-label">
            {t('options.sources.exclude')}
            <small>
              {t('options.sources.excludeHint')}
              <button type="button" class="opt-link" onClick={() => setSrc({ excludeTags: DEFAULT_EXCLUDED_TAGS })}>
                {t('options.sources.excludeReset')}
              </button>
            </small>
          </span>
          <textarea rows={3} value={s.sources.excludeTags} onChange={(e) => setSrc({ excludeTags: (e.target as HTMLTextAreaElement).value })} />
        </div>
        <div class="opt-field opt-field-block">
          <span class="opt-label">
            {t('options.sources.prefer')}
            <small>{t('options.sources.preferHint')}</small>
          </span>
          <input
            class="wide"
            value={s.sources.preferTags}
            placeholder={t('options.sources.preferPlaceholder')}
            onChange={(e) => setSrc({ preferTags: (e.target as HTMLInputElement).value })}
          />
        </div>
      </Section>

      <Section id="blend" title={t('options.nav.blend')} note={t('options.blend.note')}>
        <Field label={t('options.blend.blur')}>
          <Range value={s.bgBlur} min={0} max={8} step={0.5} onChange={(v) => set({ bgBlur: v })} fmt={(v) => `${v}px`} />
        </Field>
        <Field label={t('options.blend.dim')}>
          <Range value={s.bgDim} min={0} max={0.6} step={0.02} onChange={(v) => set({ bgDim: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Field>
        <Field label={t('options.blend.harmonize')} hint={t('options.blend.harmonizeHint')}>
          <Range value={s.harmonize} min={0} max={1} step={0.05} onChange={(v) => set({ harmonize: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Field>
        <Field label={t('options.blend.variety')} hint={t('options.blend.varietyHint')}>
          <input type="checkbox" checked={s.layoutVariety} onChange={() => set({ layoutVariety: !s.layoutVariety })} />
        </Field>
        <Field label={t('options.blend.rim')} hint={t('options.blend.rimHint')}>
          <Range value={s.rimLight} min={0} max={1} step={0.05} onChange={(v) => set({ rimLight: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Field>
      </Section>

      <Section id="motion" title={t('options.nav.motion')} note={t('options.motion.note')}>
        <Field label={t('options.motion.parallax')}>
          <Range
            value={s.parallax}
            min={0}
            max={2}
            step={0.1}
            onChange={(v) => set({ parallax: v })}
            fmt={(v) => (v ? `×${v.toFixed(1)}` : t('options.motion.rangeOff'))}
          />
        </Field>
        <Field label={t('options.motion.depth')} hint={t('options.motion.depthHint')}>
          <Range
            value={s.depthMotion}
            min={0}
            max={2}
            step={0.1}
            onChange={(v) => set({ depthMotion: v })}
            fmt={(v) => (v ? `×${v.toFixed(1)}` : t('options.motion.rangeOff'))}
          />
        </Field>
        <Field label={t('options.motion.breathing')}>
          <input type="checkbox" checked={s.breathing} onChange={() => set({ breathing: !s.breathing })} />
        </Field>
        <Field label={t('options.motion.particles')}>
          <select value={s.particles} onChange={(e) => set({ particles: (e.target as HTMLSelectElement).value as Settings['particles'] })}>
            <option value="auto">{t('options.motion.particlesAuto')}</option>
            <option value="sakura">{t('options.motion.sakura')}</option>
            <option value="bokeh">{t('options.motion.bokeh')}</option>
            <option value="rain">{t('options.motion.rain')}</option>
            <option value="snow">{t('options.motion.snow')}</option>
            <option value="off">{t('common.off')}</option>
          </select>
        </Field>
        <Field label={t('options.motion.enter')}>
          <input type="checkbox" checked={s.enterAnimation} onChange={() => set({ enterAnimation: !s.enterAnimation })} />
        </Field>
      </Section>

      <Section id="power" title={t('options.nav.power')}>
        <Field label={t('options.power.powerSave')} hint={t('options.power.powerSaveHint')}>
          <select value={s.powerSave} onChange={(e) => set({ powerSave: (e.target as HTMLSelectElement).value as Settings['powerSave'] })}>
            <option value="auto">{t('options.power.auto')}</option>
            <option value="on">{t('options.power.on')}</option>
            <option value="cache">{t('options.power.cache')}</option>
            <option value="off">{t('common.off')}</option>
          </select>
        </Field>
        {s.powerSave === 'cache' && <small class="opt-muted">{t('options.power.cacheNote')}</small>}
        <Field label={t('options.power.idleOnly')}>
          <input type="checkbox" checked={s.processOnlyWhenIdle} onChange={() => set({ processOnlyWhenIdle: !s.processOnlyWhenIdle })} />
        </Field>
        <Field label={t('options.power.queueSize')} hint={t('options.power.queueSizeHint', { n: queueTarget({ ...s, queueSize: 0 }) })}>
          <input
            type="number"
            class="num"
            min={0}
            max={QUEUE_MAX}
            value={s.queueSize}
            onChange={(e) => set({ queueSize: Math.min(QUEUE_MAX, Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0))) })}
          />
          <span class="unit">{t('options.favorites.limitUnit')}</span>
        </Field>
      </Section>

      <Section id="uploads" title={t('options.nav.uploads')} note={t('options.uploads.note')}>
        <div class="upload-actions">
          <label class="opt-button">
            {t('options.uploads.addBg')}
            <input type="file" accept="image/*,video/mp4,video/webm" multiple hidden onChange={(e) => void addUploads((e.target as HTMLInputElement).files, 'bg')} />
          </label>
          <label class="opt-button">
            {t('options.uploads.addChar')}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => void addUploads((e.target as HTMLInputElement).files, 'char')} />
          </label>
        </div>
        <ul class="thumb-grid">
          {uploads.map((u) => (
            <li key={u.id}>
              <Thumb blob={u.blob} kind={u.kind} />
              <span>
                {u.role === 'bg' ? t('common.bg') : t('common.char')} · {u.name}
              </span>
              <button
                type="button"
                class="opt-link"
                onClick={async () => {
                  await (await db()).delete('uploads', u.id);
                  await reload();
                }}
              >
                {t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="favorites" title={t('options.nav.favorites')} note={t('options.favorites.note')}>
        <Field label={t('options.favorites.weight')} hint={t('options.favorites.weightHint')}>
          <Range value={s.favoritesWeight} min={0} max={1} step={0.05} onChange={(v) => set({ favoritesWeight: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Field>
        <Field label={t('options.favorites.limit')} hint={t('options.favorites.limitHint')}>
          <input
            type="number"
            class="num"
            min={0}
            max={5000}
            value={s.favoritesLimit}
            onChange={(e) => set({ favoritesLimit: Math.min(5000, Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0))) })}
          />
          <span class="unit">{t('options.favorites.limitUnit')}</span>
        </Field>
        <p class="opt-usage">
          <span>
            {tRich('options.favorites.usage', {
              count: <strong>{favs.length}</strong>,
              size: <strong>{mb(favs.reduce((n, f) => n + favoriteBytes(f), 0))}</strong>,
            })}
          </span>
          {storageUsed !== undefined && <span class="opt-muted">{t('options.favorites.storage', { size: mb(storageUsed) })}</span>}
          {s.favoritesLimit > 0 && favs.length > s.favoritesLimit && (
            <span class="opt-warn">{t('options.favorites.overLimit', { n: favs.length - s.favoritesLimit })}</span>
          )}
          {favs.length > 0 && (
            <button
              type="button"
              class="opt-link"
              onClick={async () => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  setTimeout(() => setConfirmClear(false), 4000);
                  return;
                }
                await (await db()).clear('favorites');
                setConfirmClear(false);
                await reload();
                flash(t('options.favorites.cleared'));
              }}
            >
              {confirmClear ? t('options.favorites.confirmClear') : t('options.favorites.clearAll')}
            </button>
          )}
        </p>
        {!favs.length && <p class="opt-muted">{t('options.favorites.empty')}</p>}
        <ul class="thumb-grid">
          {favs.map((f) => (
            <li key={f.id}>
              <FavoriteThumb fav={f} />
              <span>
                {f.char?.credit.artist ?? f.bg.credit.artist ?? f.bg.credit.id} · {mb(favoriteBytes(f))} MB
              </span>
              <span class="row">
                <button
                  type="button"
                  class="opt-link"
                  onClick={async () => {
                    await (await db()).delete('favorites', f.id);
                    await reload();
                  }}
                >
                  {t('common.remove')}
                </button>
              </span>
            </li>
          ))}
        </ul>
        <p class="opt-muted">
          {t('options.favorites.blacklist', { n: blacklist.length })}
          {blacklist.length > 0 && (
            <button
              type="button"
              class="opt-link"
              onClick={async () => {
                await saveBlacklist([]);
                setBlacklist([]);
              }}
            >
              {t('common.clear')}
            </button>
          )}
        </p>
      </Section>

      <Section id="anilist" title={t('options.nav.anilist')} note={t('options.anilist.note')}>
        <div class="opt-field opt-field-block">
          <span class="opt-label">
            {t('options.anilist.redirect')}
            <small>{t('options.anilist.redirectHint')}</small>
          </span>
          <code class="opt-copy">{`https://${chrome.runtime.id}.chromiumapp.org/`}</code>
        </div>
        <Field label={t('options.anilist.clientId')} hint={t('options.anilist.clientIdHint')}>
          <input value={s.anilistClientId} onChange={(e) => set({ anilistClientId: (e.target as HTMLInputElement).value.trim() })} />
        </Field>
      </Section>

      <Section id="backup" title={t('options.nav.backup')} note={t('options.backup.note')}>
        <div class="upload-actions">
          <button type="button" class="opt-button" onClick={exportData}>
            {t('options.backup.export')}
          </button>
          <label class="opt-button">
            {t('options.backup.import')}
            <input type="file" accept="application/json" hidden onChange={(e) => void importData((e.target as HTMLInputElement).files?.[0])} />
          </label>
        </div>
      </Section>

      {toast && (
        <div class="opt-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
