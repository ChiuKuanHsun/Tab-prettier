import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  airedEpisodes,
  birthdays,
  displayTitle,
  getToken,
  login,
  logout,
  myWatching,
  saveProgress,
  seasonAnime,
  todayAiring,
  type Airing,
  type BirthdayCharacter,
  type ListEntry,
  type MediaLite,
} from '../lib/anilist';

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
  if (d <= 0) return '已播出';
  const h = Math.floor(d / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)} 天後`;
  return h ? `${h} 小時後` : `${Math.ceil(d / 60_000)} 分鐘後`;
}

function Today() {
  const { data, error, loading } = useAsync<Airing[]>(todayAiring, []);
  if (loading) return <p class="panel-muted">載入中…</p>;
  if (error) return <p class="panel-muted">讀取失敗:{error}</p>;
  if (!data?.length) return <p class="panel-muted">今天沒有播出的新番。</p>;
  const now = Date.now() / 1000;
  return (
    <ol class="airing">
      {data.map((a) => (
        <li key={`${a.media.id}-${a.episode}`} class={a.airingAt < now ? 'is-past' : ''}>
          <time>{hhmm(a.airingAt)}</time>
          <a href={a.media.siteUrl}>{displayTitle(a.media.title)}</a>
          <span class="airing-ep">第 {a.episode} 集</span>
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
      aria-label={caughtUp ? `${title} 已追上最新一集` : `${title} 看完第 ${entry.progress + 1} 集`}
      title={failed ? '更新失敗,再試一次' : caughtUp ? '已追上最新一集' : `標記看完第 ${entry.progress + 1} 集`}
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
  if (loading) return <p class="panel-muted">載入中…</p>;
  if (error) return <p class="panel-muted">讀取失敗:{error}</p>;
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
  if (loading) return <p class="panel-muted">載入中…</p>;
  if (error) return <p class="panel-muted">讀取失敗:{error}</p>;
  if (!data?.length) return <p class="panel-muted">今天沒有登記生日的角色。</p>;
  const today = new Date();
  return (
    <>
      <p class="panel-muted">
        {today.getMonth() + 1} 月 {today.getDate()} 日生日的角色 🎂
      </p>
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

function Mine({ clientId }: { clientId: string }) {
  const [token, setToken] = useState<string | null>();
  const [err, setErr] = useState<string>();
  useEffect(() => {
    void getToken().then((t) => setToken(t ?? null));
  }, []);
  const [reload, setReload] = useState(0);
  const list = useAsync<{ name: string; entries: ListEntry[] } | null>(
    async () => (token ? myWatching(token, reload > 0) : null),
    [token, reload],
  );
  const [entries, setEntries] = useState<ListEntry[]>([]);
  useEffect(() => setEntries(list.data?.entries ?? []), [list.data]);

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
            連結 AniList 帳號
          </button>
        ) : (
          <p>
            要顯示追番清單,請先到 <a href={chrome.runtime.getURL('options.html#anilist')}>設定</a> 填入 AniList Client ID。
          </p>
        )}
        {err && <p>{err}</p>}
      </div>
    );
  }
  if (list.loading) return <p class="panel-muted">載入中…</p>;
  if (list.error) return <p class="panel-muted">讀取失敗:{list.error}</p>;
  const name = list.data?.name;
  return (
    <>
      <div class="panel-actions">
        <span class="panel-muted">{name}</span>
        <button type="button" class="text-btn" onClick={() => setReload((n) => n + 1)}>
          重新整理
        </button>
        <button
          type="button"
          class="text-btn"
          onClick={async () => {
            await logout();
            setToken(null);
          }}
        >
          登出
        </button>
      </div>
      {!entries.length && (
        <p class="panel-muted">
          AniList 上還沒有「Watching(觀看中)」的作品。到{' '}
          <a href={name ? `https://anilist.co/user/${encodeURIComponent(name)}/animelist` : 'https://anilist.co/search/anime'}>AniList</a>{' '}
          把正在看的番加入清單、狀態選 Watching,再回來按「重新整理」。
        </p>
      )}
      <div class="cover-grid">
        {entries.map((e) => {
          const next = e.media.nextAiringEpisode;
          const behind = (airedEpisodes(e.media) ?? e.progress) - e.progress;
          const sub = [`看到 ${e.progress}`, behind > 0 ? `落後 ${behind} 集` : null, next ? `EP${next.episode} ${untilText(next.airingAt)}` : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <Cover
              key={e.id}
              m={e.media}
              sub={sub}
              action={
                <PlusOne
                  token={token}
                  entry={e}
                  onSaved={(saved) =>
                    setEntries((cur) => {
                      const finished = !saved.media.nextAiringEpisode && saved.media.episodes != null && saved.progress >= saved.media.episodes;
                      return finished ? cur.filter((x) => x.id !== saved.id) : cur.map((x) => (x.id === saved.id ? saved : x));
                    })
                  }
                />
              }
            />
          );
        })}
      </div>
    </>
  );
}

export function AnimePanel({ clientId }: { clientId: string }) {
  const [tab, setTab] = useState<Tab>('today');
  const tabs: [Tab, string][] = [
    ['today', '今日播出'],
    ['season', '本季新番'],
    ['mine', '追番清單'],
    ['birthday', '今日壽星'],
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
        {tab === 'mine' && <Mine clientId={clientId} />}
        {tab === 'birthday' && <Birthdays />}
      </div>
    </div>
  );
}
