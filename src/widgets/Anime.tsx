import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  airedEpisodes,
  birthdays,
  displayTitle,
  getToken,
  login,
  logout,
  myCompleted,
  myListAnime,
  myWatching,
  saveProgress,
  seasonAnime,
  todayAiring,
  type Airing,
  type BirthdayCharacter,
  type ListEntry,
  type MediaLite,
} from '../lib/anilist';
import { t, tRich } from '../i18n';
import type { ListAnime } from '../lib/list-chars';
import type { Settings } from '../lib/types';
import { ListCharacters, useCharPicks } from './ListCharacters';

type Tab = 'today' | 'season' | 'mine' | 'birthday';

function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    load().then(
      (data) => alive && setState({ data, loading: false }),
      (e: Error) => alive && setState({ error: e.message, loading: false }),
    );
    return () => {
      alive = false;
    };
    // deps are passed through explicitly by callers
  }, deps);
  return state;
}

const hhmm = (sec: number) =>
  new Date(sec * 1000).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

function untilText(sec: number) {
  const d = sec * 1000 - Date.now();
  if (d <= 0) return t('widgets.anime.aired');
  const h = Math.floor(d / 3_600_000);
  if (h >= 24) return t('widgets.anime.inDays', { n: Math.floor(h / 24) });
  return h ? t('widgets.anime.inHours', { n: h }) : t('widgets.anime.inMinutes', { n: Math.ceil(d / 60_000) });
}

function Today() {
  const { data, error, loading } = useAsync<Airing[]>(todayAiring, []);
  if (loading) return <p class="panel-muted">{t('common.loading')}</p>;
  if (error) return <p class="panel-muted">{t('common.loadFailed', { error })}</p>;
  if (!data?.length) return <p class="panel-muted">{t('widgets.anime.noAiring')}</p>;
  const now = Date.now() / 1000;
  return (
    <ol class="airing">
      {data.map((a) => (
        <li key={`${a.media.id}-${a.episode}`} class={a.airingAt < now ? 'is-past' : ''}>
          <time>{hhmm(a.airingAt)}</time>
          <a href={a.media.siteUrl}>{displayTitle(a.media.title)}</a>
          <span class="airing-ep">{t('widgets.anime.episode', { n: a.episode })}</span>
        </li>
      ))}
    </ol>
  );
}

function Cover({ m, sub, action }: { m: MediaLite; sub?: string; action?: ComponentChildren }) {
  return (
    <div class="cover-item">
      <a class="cover" href={m.siteUrl} style={{ '--cover-color': m.coverImage.color ?? 'transparent' }}>
        <img src={m.coverImage.large ?? m.coverImage.medium} alt="" loading="lazy" />
        <span class="cover-title">{displayTitle(m.title)}</span>
        {sub && <span class="cover-sub">{sub}</span>}
      </a>
      {action}
    </div>
  );
}

/** "+1 集" on a watch-list cover; disabled once caught up with what has aired. */
function PlusOne({ token, entry, onSaved }: { token: string; entry: ListEntry; onSaved: (e: ListEntry) => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const aired = airedEpisodes(entry.media);
  const caughtUp = aired !== undefined && entry.progress >= aired;
  const title = displayTitle(entry.media.title);
  return (
    <button
      type="button"
      class={`cover-act ${failed ? 'is-failed' : ''}`}
      disabled={busy || caughtUp}
      aria-label={
        caughtUp ? t('widgets.anime.caughtUpLabel', { title }) : t('widgets.anime.watchedLabel', { title, n: entry.progress + 1 })
      }
      title={
        failed
          ? t('widgets.anime.saveFailed')
          : caughtUp
            ? t('widgets.anime.caughtUp')
            : t('widgets.anime.markWatched', { n: entry.progress + 1 })
      }
      onClick={async () => {
        setBusy(true);
        setFailed(false);
        try {
          onSaved(await saveProgress(token, entry, entry.progress + 1));
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      {caughtUp ? '✓' : busy ? '…' : '+1'}
    </button>
  );
}

function Season() {
  const { data, error, loading } = useAsync<MediaLite[]>(seasonAnime, []);
  if (loading) return <p class="panel-muted">{t('common.loading')}</p>;
  if (error) return <p class="panel-muted">{t('common.loadFailed', { error })}</p>;
  return (
    <div class="cover-grid">
      {data!.map((m) => (
        <Cover key={m.id} m={m} sub={m.nextAiringEpisode ? `EP${m.nextAiringEpisode.episode} · ${untilText(m.nextAiringEpisode.airingAt)}` : undefined} />
      ))}
    </div>
  );
}

function Birthdays() {
  const { data, error, loading } = useAsync<BirthdayCharacter[]>(birthdays, []);
  if (loading) return <p class="panel-muted">{t('common.loading')}</p>;
  if (error) return <p class="panel-muted">{t('common.loadFailed', { error })}</p>;
  if (!data?.length) return <p class="panel-muted">{t('widgets.anime.noBirthdays')}</p>;
  const today = new Date();
  return (
    <>
      <p class="panel-muted">{t('widgets.anime.birthdaysOn', { month: today.getMonth() + 1, day: today.getDate() })}</p>
      <div class="cover-grid">
        {data.map((c) => {
          const work = c.media.nodes[0];
          return (
            <div class="cover-item" key={c.id}>
              <a class="cover" href={c.siteUrl}>
                <img src={c.image.large} alt="" loading="lazy" />
                <span class="cover-title">{c.name.native || c.name.full}</span>
                <span class="cover-sub">
                  {work ? displayTitle(work.title) : c.name.full} · ♥ {c.favourites.toLocaleString()}
                </span>
              </a>
            </div>
          );
        })}
      </div>
    </>
  );
}

type Sources = Settings['sources'];
type SetSources = (patch: Partial<Sources>) => void;

/** Why a show's star can't be toggled under the current settings, if it can't. */
function pickBlocked(src: Sources, status: ListStatus): string | undefined {
  if (!src.danbooru) return t('widgets.anime.pickNeedsDanbooru');
  if (!src.listChars) return t('widgets.anime.pickNeedsListChars');
  if (status === 'CURRENT' ? !src.listWatching : !src.listCompleted) {
    return t('widgets.anime.pickListOff', {
      list: t(status === 'CURRENT' ? 'widgets.anime.showWatching' : 'widgets.anime.showCompleted'),
    });
  }
  return undefined;
}

/**
 * Whether a show is used for character scenes: a star on its cover, the same choice as the
 * settings' show list. The settings decide whether it can be toggled at all.
 */
function PickToggle({ m, status, src, onSources }: { m: MediaLite; status: ListStatus; src: Sources; onSources: SetSources }) {
  const on = !src.listExcluded.includes(m.id);
  const blocked = pickBlocked(src, status);
  const label = blocked ?? t(on ? 'widgets.anime.pickOn' : 'widgets.anime.pickOff', { title: displayTitle(m.title) });
  return (
    <button
      type="button"
      class={`cover-pick ${on && !blocked ? 'is-on' : ''}`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={!!blocked}
      onClick={() => onSources({ listExcluded: on ? [...src.listExcluded, m.id] : src.listExcluded.filter((x) => x !== m.id) })}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

type ListStatus = 'CURRENT' | 'COMPLETED';

const VIEW_KEY = 'tp:mine-view';
function savedView(): ListStatus {
  try {
    return localStorage.getItem(VIEW_KEY) === 'COMPLETED' ? 'COMPLETED' : 'CURRENT';
  } catch {
    return 'CURRENT';
  }
}

function Mine({ clientId, src, onSources }: { clientId: string; src: Sources; onSources: SetSources }) {
  const [token, setToken] = useState<string | null>();
  const [err, setErr] = useState<string>();
  const [view, setView] = useState<ListStatus>(savedView);
  useEffect(() => {
    void getToken().then((t) => setToken(t ?? null));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* remembering the view is only a convenience */
    }
  }, [view]);
  const [reload, setReload] = useState(0);
  const list = useAsync<{ name: string; entries: ListEntry[] } | null>(
    async () => (token ? myWatching(token, reload > 0) : null),
    [token, reload],
  );
  const done = useAsync<ListEntry[] | null>(
    async () => (token && view === 'COMPLETED' ? myCompleted(token, reload > 0) : null),
    [token, reload, view],
  );
  const [entries, setEntries] = useState<ListEntry[]>([]);
  useEffect(() => setEntries(list.data?.entries ?? []), [list.data]);
  // the show whose characters are open, over the list
  const [sheet, setSheet] = useState<{ m: MediaLite; status: ListStatus }>();
  const cast = useAsync<ListAnime[] | null>(async () => (token && sheet ? myListAnime(token) : null), [token, sheet?.m.id]);
  const picks = useCharPicks();

  if (token === undefined) return null;
  if (!token) {
    return (
      <div class="panel-muted">
        {clientId ? (
          <button
            type="button"
            class="text-btn"
            onClick={async () => {
              try {
                setToken(await login(clientId));
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            {t('widgets.anime.connect')}
          </button>
        ) : (
          <p>
            {tRich('widgets.anime.needClientId', {
              link: <a href={chrome.runtime.getURL('options.html#anilist')}>{t('common.settings')}</a>,
            })}
          </p>
        )}
        {err && <p>{err}</p>}
      </div>
    );
  }
  if (list.loading) return <p class="panel-muted">{t('common.loading')}</p>;
  if (list.error) return <p class="panel-muted">{t('common.loadFailed', { error: list.error })}</p>;
  const name = list.data?.name;
  const charsButton = (m: MediaLite, status: ListStatus) => (
    <button
      type="button"
      class="cover-chars"
      aria-label={t('widgets.listChars.openLabel', { title: displayTitle(m.title) })}
      onClick={(e) => {
        setSheet({ m, status });
        // the panel may be scrolled down the list; the characters start at the top
        (e.currentTarget as HTMLElement).closest('.panel')?.scrollTo({ top: 0 });
      }}
    >
      {t('widgets.listChars.open')}
    </button>
  );
  const sheetShow = sheet && cast.data?.find((a) => a.id === sheet.m.id);
  // a show's characters take the list's place until closed
  if (sheet) {
    return (
      <div class="chars-sheet" role="dialog" aria-label={displayTitle(sheet.m.title)}>
        <div class="panel-actions">
          <strong class="chars-sheet-title">{displayTitle(sheet.m.title)}</strong>
          <button type="button" class="text-btn" onClick={() => setSheet(undefined)}>
            {t('widgets.listChars.close')}
          </button>
        </div>
        {cast.loading ? (
          <p class="panel-muted">{t('common.loading')}</p>
        ) : cast.error ? (
          <p class="panel-muted">{t('common.loadFailed', { error: cast.error })}</p>
        ) : sheetShow ? (
          <ListCharacters
            anime={sheetShow}
            picks={picks}
            disabled={
              pickBlocked(src, sheet.status) ?? (src.listExcluded.includes(sheet.m.id) ? t('widgets.listChars.showOff') : undefined)
            }
          />
        ) : (
          <p class="panel-muted">{t('widgets.listChars.notInList')}</p>
        )}
      </div>
    );
  }

  const views: [ListStatus, string][] = [
    ['CURRENT', t('widgets.anime.showWatching')],
    ['COMPLETED', t('widgets.anime.showCompleted')],
  ];

  return (
    <>
      <div class="panel-actions">
        <div class="seg seg-sub" role="tablist">
          {views.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        <span class="panel-muted">{name}</span>
        <button
          type="button"
          class="text-btn"
          onClick={() => {
            setReload((n) => n + 1);
            // the shows behind character scenes follow the lists too
            if (src.danbooru && src.listChars) void myListAnime(token, true).catch(() => undefined);
          }}
        >
          {t('widgets.anime.refresh')}
        </button>
        <button
          type="button"
          class="text-btn"
          onClick={async () => {
            await logout();
            setToken(null);
          }}
        >
          {t('widgets.anime.logout')}
        </button>
      </div>
      {view === 'CURRENT' && (
        <>
          {!entries.length && (
            <p class="panel-muted">
              {tRich('widgets.anime.noWatching', {
                link: (
                  <a href={name ? `https://anilist.co/user/${encodeURIComponent(name)}/animelist` : 'https://anilist.co/search/anime'}>
                    AniList
                  </a>
                ),
              })}
            </p>
          )}
          <div class="cover-grid">
            {entries.map((e) => {
              const next = e.media.nextAiringEpisode;
              const behind = (airedEpisodes(e.media) ?? e.progress) - e.progress;
              const sub = [
                t('widgets.anime.progress', { n: e.progress }),
                behind > 0 ? t('widgets.anime.behind', { n: behind }) : null,
                next ? `EP${next.episode} ${untilText(next.airingAt)}` : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Cover
                  key={e.id}
                  m={e.media}
                  sub={sub}
                  action={
                    <>
                      <PickToggle m={e.media} status="CURRENT" src={src} onSources={onSources} />
                      {charsButton(e.media, 'CURRENT')}
                      <PlusOne
                        token={token}
                        entry={e}
                        onSaved={(saved) =>
                          setEntries((cur) => {
                            const finished =
                              !saved.media.nextAiringEpisode && saved.media.episodes != null && saved.progress >= saved.media.episodes;
                            return finished ? cur.filter((x) => x.id !== saved.id) : cur.map((x) => (x.id === saved.id ? saved : x));
                          })
                        }
                      />
                    </>
                  }
                />
              );
            })}
          </div>
        </>
      )}
      {view === 'COMPLETED' && (
        <>
          {done.loading && <p class="panel-muted">{t('common.loading')}</p>}
          {done.error && <p class="panel-muted">{t('common.loadFailed', { error: done.error })}</p>}
          {done.data && !done.data.length && <p class="panel-muted">{t('widgets.anime.noCompleted')}</p>}
          <div class="cover-grid">
            {done.data?.map((e) => (
              <Cover
                key={e.id}
                m={e.media}
                sub={e.media.episodes ? t('widgets.anime.episodesTotal', { n: e.media.episodes }) : undefined}
                action={
                  <>
                    <PickToggle m={e.media} status="COMPLETED" src={src} onSources={onSources} />
                    {charsButton(e.media, 'COMPLETED')}
                  </>
                }
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

export function AnimePanel({ clientId, src, onSources }: { clientId: string; src: Sources; onSources: SetSources }) {
  const [tab, setTab] = useState<Tab>('today');
  const tabs: [Tab, string][] = [
    ['today', t('widgets.anime.tabs.today')],
    ['season', t('widgets.anime.tabs.season')],
    ['mine', t('widgets.anime.tabs.mine')],
    ['birthday', t('widgets.anime.tabs.birthday')],
  ];
  return (
    <div class="anime">
      <div class="seg" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'today' && <Today />}
        {tab === 'season' && <Season />}
        {tab === 'mine' && <Mine clientId={clientId} src={src} onSources={onSources} />}
        {tab === 'birthday' && <Birthdays />}
      </div>
    </div>
  );
}
