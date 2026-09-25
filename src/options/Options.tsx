import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { db, queueCount, type FavoriteScene } from '../lib/db';
import { favoriteBytes } from '../lib/scene-store';
import { send } from '../lib/messages';
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
import { detectLocation, geocode, type Place } from '../lib/weather';
import { THEMES } from '../themes';

const NEKOSIA_CATEGORIES = ['random', 'catgirl', 'foxgirl', 'wolf-girl', 'animal-ears', 'maid', 'uniform', 'cute', 'young-girl', 'white-hair', 'blue-hair', 'kimono', 'vtuber'];

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ComponentChildren }) {
  return (
    <section id={id} class="opt-section">
      <header>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
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

function Range(props: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))} />
      <output>{props.fmt ? props.fmt(props.value) : props.value}</output>
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

  useEffect(() => {
    if (mode !== 'auto') return;
    setDetected(undefined);
    detectLocation().then(
      (l) => setDetected(l.name),
      () => setDetected('(偵測失敗)'),
    );
  }, [mode]);

  const search = async (e: Event) => {
    e.preventDefault();
    if (!q.trim()) return;
    setErr(undefined);
    try {
      const r = await geocode(q);
      setResults(r);
      if (!r.length) setErr('找不到這個地點,試試英文名稱(例如 Taipei)。');
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const modes: [Settings['weatherMode'], string][] = [
    ['auto', '自動(依網路位置)'],
    ['manual', '手動選城市'],
    ['off', '關閉'],
  ];

  return (
    <div class="opt-field opt-field-block">
      <span class="opt-label">
        天氣
        <small>日期旁顯示天氣;下雨下雪時背景會換成雨景、雪景,粒子也會跟著變。</small>
      </span>
      <div class="focus-chips" role="radiogroup" aria-label="天氣位置">
        {modes.map(([m, label]) => (
          <label key={m} class="radio">
            <input type="radio" name="weather-mode" checked={mode === m} onChange={() => onChange({ weatherMode: m, weatherLocation: value })} />
            {label}
          </label>
        ))}
      </div>
      {mode === 'auto' && (
        <small class="opt-muted">
          目前偵測:{detected ?? '偵測中…'}。依 IP 判斷,只到城市等級;用 VPN 或公司網路時可能不準,不準就改用手動。
        </small>
      )}
      {mode === 'manual' && (
        <>
          <small class="opt-muted">{value ? `目前:${value.name}` : '尚未選擇城市,暫時使用自動偵測。'}</small>
          <form class="weather-search" onSubmit={search}>
            <input value={q} placeholder="城市名稱,英文較準確(例如 Taipei)" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
            <button type="submit" class="opt-button">搜尋</button>
          </form>
          {err && <small class="opt-warn">{err}</small>}
          {results && results.length > 0 && (
            <ul class="weather-results">
              {results.map((r) => {
                const name = [r.name, r.admin1, r.country].filter(Boolean).join(',');
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
    await send({ to: 'bg', type: 'refill' });
    setQueue(0);
    flash('已清空,正在用新設定重新產生畫面…');
  };

  const addUploads = async (files: FileList | null, role: Upload['role']) => {
    if (!files) return;
    const d = await db();
    for (const f of Array.from(files)) {
      await d.put('uploads', { id: uid(), name: f.name, blob: f, kind: kindOf(f), role, addedAt: Date.now() });
    }
    await reload();
    flash(`已加入 ${files.length} 個檔案`);
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
      flash('已匯入');
    } catch {
      flash('檔案格式不正確');
    }
  };

  const redirectUrl = `https://${chrome.runtime.id}.chromiumapp.org/`;

  return (
    <div class="opt">
      <header class="opt-hero">
        <p class="opt-kicker">TAB PRETTIER</p>
        <h1>設定</h1>
        <p class="opt-status">
          佇列中已準備 <strong>{queue}</strong> 幅畫面
          <button type="button" class="opt-link" onClick={regenerate}>
            清空並用新設定重新產生
          </button>
        </p>
      </header>

      <nav class="opt-nav">
        {[
          ['look', '外觀'],
          ['sources', '圖源'],
          ['blend', '融合'],
          ['motion', '動態'],
          ['power', '效能'],
          ['uploads', '上傳'],
          ['favorites', '收藏'],
          ['anilist', 'AniList'],
          ['backup', '備份'],
        ].map(([id, l]) => (
          <a key={id} href={`#${id}`}>
            {l}
          </a>
        ))}
      </nav>

      <Section id="look" title="外觀" note="想讓 Chrome 分頁列也同風格,可另外安裝專案裡 chrome-themes/ 資料夾的主題包(固定配色,詳見 README)。">
        <div class="theme-cards" role="radiogroup" aria-label="主題">
          {THEMES.map((t) => (
            <label key={t.id} class={`theme-card theme-card-${t.id}`}>
              <input type="radio" name="theme" checked={s.theme === t.id} onChange={() => set({ theme: t.id })} />
              <span class="theme-sample">14:32</span>
              <strong>{t.label}</strong>
              <small>{t.note}</small>
            </label>
          ))}
        </div>
        <Field label="換圖頻率" hint="在開新分頁時判斷;頻率越低,背景處理越少、越省電">
          <select value={s.rotation} onChange={(e) => set({ rotation: (e.target as HTMLSelectElement).value as Settings['rotation'] })}>
            <option value="tab">每次開新分頁</option>
            <option value="minutes">每隔幾分鐘</option>
            <option value="tabs">每開幾個分頁</option>
            <option value="day">每天(過午夜後)</option>
          </select>
        </Field>
        {s.rotation === 'minutes' && (
          <Field label="間隔分鐘" hint="距離這幅第一次出現超過這個時間,下一個新分頁就換">
            <input
              type="number"
              class="num"
              min={1}
              max={1440}
              value={s.rotationMinutes}
              onChange={(e) => set({ rotationMinutes: Math.min(1440, Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1))) })}
            />
            <span class="unit">分鐘</span>
          </Field>
        )}
        {s.rotation === 'tabs' && (
          <Field label="分頁數" hint="同一幅顯示這麼多次後換下一幅">
            <input
              type="number"
              class="num"
              min={1}
              max={100}
              value={s.rotationTabs}
              onChange={(e) => set({ rotationTabs: Math.min(100, Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1))) })}
            />
            <span class="unit">個分頁</span>
          </Field>
        )}
        <Field label="24 小時制">
          <input type="checkbox" checked={s.clock24h} onChange={() => set({ clock24h: !s.clock24h })} />
        </Field>
        <Field label="顯示秒數" hint="以小字顯示在分鐘旁">
          <input type="checkbox" checked={s.clockSeconds} onChange={() => set({ clockSeconds: !s.clockSeconds })} />
        </Field>
        <Field label="在搜尋列下方常駐連結" hint="預設收在「連結」面板裡">
          <input type="checkbox" checked={s.pinLinks} onChange={() => set({ pinLinks: !s.pinLinks })} />
        </Field>
        <Field label="搜尋建議" hint="輸入時向 Google 取得建議字詞(和網址列的建議相同)">
          <input type="checkbox" checked={s.searchSuggest} onChange={() => set({ searchSuggest: !s.searchSuggest })} />
        </Field>
        <WeatherPicker mode={s.weatherMode} value={s.weatherLocation} onChange={(patch) => set(patch)} />
      </Section>

      <Section id="sources" title="圖源" note="背景取自 Wallhaven 的無人場景;角色取自 Nekosia / waifu.im 並自動去背。僅使用 SFW 內容。">
        <Field label="Wallhaven 場景">
          <input type="checkbox" checked={s.sources.wallhaven} onChange={() => setSrc({ wallhaven: !s.sources.wallhaven })} />
        </Field>
        <Field label="依時段挑背景" hint="白天出藍天雲朵、傍晚出夕陽、夜晚出夜景">
          <input type="checkbox" checked={s.sources.timeAware} onChange={() => setSrc({ timeAware: !s.sources.timeAware })} />
        </Field>
        {!s.sources.timeAware && (
          <Field label="場景關鍵字" hint="以逗號分隔,每批隨機挑一組;-girl 代表排除">
            <input class="wide" value={s.sources.wallhavenQuery} onChange={(e) => setSrc({ wallhavenQuery: (e.target as HTMLInputElement).value })} />
          </Field>
        )}
        <Field label="Nekosia 角色">
          <input type="checkbox" checked={s.sources.nekosia} onChange={() => setSrc({ nekosia: !s.sources.nekosia })} />
        </Field>
        <Field label="Nekosia 分類">
          <input list="nekosia-cats" value={s.sources.nekosiaCategory} onChange={(e) => setSrc({ nekosiaCategory: (e.target as HTMLInputElement).value })} />
          <datalist id="nekosia-cats">
            {NEKOSIA_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="waifu.im 角色">
          <input type="checkbox" checked={s.sources.waifuim} onChange={() => setSrc({ waifuim: !s.sources.waifuim })} />
        </Field>
        <Field label="使用自己上傳的比例" hint="有上傳檔案時才有作用">
          <Range value={s.sources.uploadsWeight} min={0} max={1} step={0.05} onChange={(v) => setSrc({ uploadsWeight: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Field>
        <div class="opt-field opt-field-block">
          <span class="opt-label">
            排除標籤
            <small>
              角色圖帶有任一標籤就跳過(以逗號分隔)。預設排除男性角色與暴露內容;waifu.im 另外固定排除成人標籤。
              <button type="button" class="opt-link" onClick={() => setSrc({ excludeTags: DEFAULT_EXCLUDED_TAGS })}>
                恢復預設
              </button>
            </small>
          </span>
          <textarea rows={3} value={s.sources.excludeTags} onChange={(e) => setSrc({ excludeTags: (e.target as HTMLTextAreaElement).value })} />
        </div>
        <div class="opt-field opt-field-block">
          <span class="opt-label">
            偏好標籤
            <small>例如 white-hair, catgirl, maid。每幅會從 3 個候選角色中挑,帶這些標籤的較容易被選中。</small>
          </span>
          <input class="wide" value={s.sources.preferTags} placeholder="(可留空)" onChange={(e) => setSrc({ preferTags: (e.target as HTMLInputElement).value })} />
        </div>
      </Section>

      <Section id="blend" title="融合" note="色調融合與輪廓光在產生畫面時烘焙,調整後按上方「重新產生」即可套用。模糊與暗化即時生效。">
        <Field label="背景模糊">
          <Range value={s.bgBlur} min={0} max={8} step={0.5} onChange={(v) => set({ bgBlur: v })} fmt={(v) => `${v}px`} />
        </Field>
        <Field label="背景暗化">
          <Range value={s.bgDim} min={0} max={0.6} step={0.02} onChange={(v) => set({ bgDim: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Field>
        <Field label="色調融合強度" hint="把角色的色溫拉近背景">
          <Range value={s.harmonize} min={0} max={1} step={0.05} onChange={(v) => set({ harmonize: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Field>
        <Field label="構圖變化" hint="偶爾出現特寫、遠景小人物,或只有風景、時鐘置中">
          <input type="checkbox" checked={s.layoutVariety} onChange={() => set({ layoutVariety: !s.layoutVariety })} />
        </Field>
        <Field label="輪廓光" hint="依背景光源方向打在角色邊緣">
          <Range value={s.rimLight} min={0} max={1} step={0.05} onChange={(v) => set({ rimLight: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Field>
      </Section>

      <Section id="motion" title="動態" note="系統開啟「減少動態效果」時,所有動畫會自動停用。">
        <Field label="滑鼠視差">
          <Range value={s.parallax} min={0} max={2} step={0.1} onChange={(v) => set({ parallax: v })} fmt={(v) => (v ? `×${v.toFixed(1)}` : '關')} />
        </Field>
        <Field label="背景景深運鏡" hint="依背景的深度圖做出立體視差與緩慢推鏡;新產生的畫面才有深度資料">
          <Range value={s.depthMotion} min={0} max={2} step={0.1} onChange={(v) => set({ depthMotion: v })} fmt={(v) => (v ? `×${v.toFixed(1)}` : '關')} />
        </Field>
        <Field label="角色呼吸感">
          <input type="checkbox" checked={s.breathing} onChange={() => set({ breathing: !s.breathing })} />
        </Field>
        <Field label="粒子氛圍">
          <select value={s.particles} onChange={(e) => set({ particles: (e.target as HTMLSelectElement).value as Settings['particles'] })}>
            <option value="auto">依季節自動</option>
            <option value="sakura">櫻花</option>
            <option value="bokeh">光斑</option>
            <option value="rain">雨</option>
            <option value="snow">雪</option>
            <option value="off">關閉</option>
          </select>
        </Field>
        <Field label="進場動畫">
          <input type="checkbox" checked={s.enterAnimation} onChange={() => set({ enterAnimation: !s.enterAnimation })} />
        </Field>
      </Section>

      <Section id="power" title="效能">
        <Field label="省電模式" hint="關閉粒子、影片與呼吸效果,並只在閒置時處理新圖">
          <select value={s.powerSave} onChange={(e) => set({ powerSave: (e.target as HTMLSelectElement).value as Settings['powerSave'] })}>
            <option value="auto">使用電池時自動開啟</option>
            <option value="on">一律開啟</option>
            <option value="off">關閉</option>
          </select>
        </Field>
        <Field label="只在電腦閒置時處理新圖">
          <input type="checkbox" checked={s.processOnlyWhenIdle} onChange={() => set({ processOnlyWhenIdle: !s.processOnlyWhenIdle })} />
        </Field>
      </Section>

      <Section id="uploads" title="上傳" note="背景可用圖片、GIF 或 MP4/WebM 影片;角色請用圖片,會自動去背。檔案只存在這台電腦。">
        <div class="upload-actions">
          <label class="opt-button">
            + 加入背景
            <input type="file" accept="image/*,video/mp4,video/webm" multiple hidden onChange={(e) => void addUploads((e.target as HTMLInputElement).files, 'bg')} />
          </label>
          <label class="opt-button">
            + 加入角色
            <input type="file" accept="image/*" multiple hidden onChange={(e) => void addUploads((e.target as HTMLInputElement).files, 'char')} />
          </label>
        </div>
        <ul class="thumb-grid">
          {uploads.map((u) => (
            <li key={u.id}>
              <Thumb blob={u.blob} kind={u.kind} />
              <span>
                {u.role === 'bg' ? '背景' : '角色'} · {u.name}
              </span>
              <button
                type="button"
                class="opt-link"
                onClick={async () => {
                  await (await db()).delete('uploads', u.id);
                  await reload();
                }}
              >
                刪除
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="favorites" title="收藏" note="在新分頁按下方的 ♡ 收藏。換圖時,收藏的畫面會依下面的機率隨機再出現。">
        <Field label="收藏再出現的機率" hint="每次換圖時抽中收藏的機率">
          <Range value={s.favoritesWeight} min={0} max={1} step={0.05} onChange={(v) => set({ favoritesWeight: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Field>
        <Field label="收藏上限" hint="超過時自動移除最舊的收藏;填 0 代表不限制">
          <input
            type="number"
            class="num"
            min={0}
            max={5000}
            value={s.favoritesLimit}
            onChange={(e) => set({ favoritesLimit: Math.min(5000, Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0))) })}
          />
          <span class="unit">幅</span>
        </Field>
        <p class="opt-usage">
          <span>
            收藏 <strong>{favs.length}</strong> 幅,約 <strong>{mb(favs.reduce((n, f) => n + favoriteBytes(f), 0))}</strong> MB
          </span>
          {storageUsed !== undefined && <span class="opt-muted">擴充功能資料總共約 {mb(storageUsed)} MB(含收藏、待顯示的畫面與上傳檔案)</span>}
          {s.favoritesLimit > 0 && favs.length > s.favoritesLimit && (
            <span class="opt-warn">
              目前超過上限 {favs.length - s.favoritesLimit} 幅,下次收藏時會移除最舊的。
            </span>
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
                flash('已清空所有收藏');
              }}
            >
              {confirmClear ? '再按一次確認清空' : '清空全部收藏'}
            </button>
          )}
        </p>
        {!favs.length && <p class="opt-muted">還沒有收藏。</p>}
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
                  移除
                </button>
              </span>
            </li>
          ))}
        </ul>
        <p class="opt-muted">
          黑名單:{blacklist.length} 項
          {blacklist.length > 0 && (
            <button
              type="button"
              class="opt-link"
              onClick={async () => {
                await saveBlacklist([]);
                setBlacklist([]);
              }}
            >
              清空
            </button>
          )}
        </p>
      </Section>

      <Section id="anilist" title="AniList" note="今日播出與本季新番不需登入。要顯示追番清單,需要建立自己的 AniList API Client。">
        <ol class="opt-steps">
          <li>
            到 <a href="https://anilist.co/settings/developer" target="_blank" rel="noreferrer">anilist.co/settings/developer</a> 建立新的 Client。
          </li>
          <li>
            Redirect URL 填入:<code>{redirectUrl}</code>
          </li>
          <li>把拿到的 Client ID 貼在下面,再到新分頁的「番劇 → 追番清單」連結帳號。</li>
        </ol>
        <Field label="Client ID">
          <input value={s.anilistClientId} onChange={(e) => set({ anilistClientId: (e.target as HTMLInputElement).value.trim() })} />
        </Field>
      </Section>

      <Section id="backup" title="備份" note="匯出設定、連結、待辦、便條與黑名單(不含圖片)。">
        <div class="upload-actions">
          <button type="button" class="opt-button" onClick={exportData}>
            匯出 JSON
          </button>
          <label class="opt-button">
            匯入 JSON
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
