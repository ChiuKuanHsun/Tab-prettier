import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  composeSuggestions,
  displayUrl,
  inlineCompletion,
  looksLikeAddress,
  type OpenTab,
  type Suggestion,
  type Visit,
} from '../lib/omnibox';
import { SEARCH_HISTORY, SUGGEST_PERMS, usePerms } from '../lib/permissions';
import { HostPrompt } from './HostPrompt';
import { favicon } from './Links';

export const ENGINES: Record<string, { label: string; url?: string }> = {
  default: { label: t('widgets.search.defaultEngine') },
  google: { label: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  ddg: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  youtube: { label: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
  bilibili: { label: 'bilibili', url: 'https://search.bilibili.com/all?keyword=%s' },
  anilist: { label: 'AniList', url: 'https://anilist.co/search/anime?search=%s' },
  pixiv: { label: 'pixiv', url: 'https://www.pixiv.net/tags/%s' },
};

/** Google's suggestion endpoint (the one Chrome's omnibox uses); YouTube has its own dataset. */
async function fetchSuggestions(q: string, engine: string, signal: AbortSignal): Promise<string[]> {
  const params = new URLSearchParams({ client: 'chrome', hl: navigator.language, q });
  if (engine === 'youtube') params.set('ds', 'yt');
  const res = await fetch(`https://suggestqueries.google.com/complete/search?${params}`, { signal });
  const data = (await res.json()) as [string, string[]];
  return (data[1] ?? []).slice(0, 8);
}

interface BrowserData { visits: Visit[]; tabs: OpenTab[]; currentTabId?: number; at: number }

/**
 * The last half year of history and the open tabs, read once when the box gets focus: searching
 * the history per keystroke took seconds, filtering this copy takes no time at all.
 */
async function browserData(): Promise<BrowserData> {
  const [visits, tabs, current] = await Promise.all([
    chrome.history.search({ text: '', startTime: Date.now() - 180 * 86_400_000, maxResults: 10_000 }),
    chrome.tabs.query({}),
    chrome.tabs.getCurrent(),
  ]);
  return {
    visits: visits.flatMap((v) => (v.url ? [{ ...v, url: v.url }] : [])),
    tabs: tabs.flatMap((tab) => (tab.id !== undefined && tab.url ? [{ id: tab.id, windowId: tab.windowId, url: tab.url, title: tab.title ?? '' }] : [])),
    currentTabId: current?.id,
    at: Date.now(),
  };
}

/** The visits that can match the text at all (a cheap filter before ranking). */
const relevant = (visits: Visit[], text: string) => {
  const t = text.toLowerCase();
  return visits.filter((v) => v.url.toLowerCase().includes(t) || (v.title ?? '').toLowerCase().includes(t));
};

const isUrl = (t: string) => /^https?:\/\/\S+$/i.test(t);

/** What the box shows while a suggestion is picked with the arrow keys. */
const boxText = (s: Suggestion) => (s.kind === 'url' || s.kind === 'tab' ? displayUrl(s.url) : s.text);

const Clock = () => (
  <svg class="search-suggest-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
const Magnifier = () => (
  <svg class="search-suggest-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
  </svg>
);

export function Search({
  engine,
  onEngine,
  suggest,
  onSuggestOff,
  history,
}: {
  engine: string;
  onEngine: (e: string) => void;
  suggest: boolean;
  /** Turns suggestions off (the user declined to allow them). */
  onSuggestOff: () => void;
  /** Suggest visited sites, past searches and open tabs, like the address bar (optional permissions). */
  history: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [google, setGoogle] = useState<string[]>([]);
  const [browser, setBrowser] = useState<BrowserData>();
  const [active, setActive] = useState(-1);
  const [showList, setShowList] = useState(false);
  /** Set after a deletion or Esc: no inline completion until the next typed character. */
  const [noComplete, setNoComplete] = useState(false);
  /**
   * While an IME is composing (注音 before it's chosen), the box never touches the input: no inline
   * completion, no selection. Some IMEs drop the composition when a page changes the value, and
   * some never send compositionend, so any plain input or leaving the box also ends it.
   */
  const [composing, setComposing] = useState(false);
  const cur = ENGINES[engine] ?? ENGINES.default;
  const allowed = usePerms(SUGGEST_PERMS);
  const historyOk = usePerms(SEARCH_HISTORY);
  // Sites, tabs and past searches only for general web searches: with a site's own search
  // (YouTube, pixiv …) the text is meant for that site, not for going somewhere.
  const useHistory = history && !!historyOk && (engine === 'default' || engine === 'google');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable]');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    // A click on the artwork itself (not a control, panel or text being selected) puts the cursor
    // here: Chrome keeps a new tab's focus in the address bar, so this saves a second click.
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('a, button, input, textarea, select, label, [contenteditable], [tabindex], .panel, .dock')) return;
      if (getSelection()?.toString()) return;
      input.current?.focus();
    };
    addEventListener('keydown', onKey);
    addEventListener('click', onClick);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('click', onClick);
    };
  }, []);

  const text = q.trim();

  // Debounced Google suggestions; each keystroke aborts the previous request.
  useEffect(() => {
    if (!suggest || !allowed || !text || isUrl(text)) {
      setGoogle([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetchSuggestions(text, engine, ctrl.signal).then(setGoogle, () => {});
    }, 140);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text, engine, suggest, allowed]);

  // History and tabs are read when the box gets focus (again after a minute), then filtered locally.
  const loadBrowser = () => {
    if (!useHistory || (browser && Date.now() - browser.at < 60_000)) return;
    void browserData().then(setBrowser, () => undefined);
  };
  useEffect(() => {
    if (useHistory && document.activeElement === input.current) loadBrowser();
    if (!useHistory) setBrowser(undefined);
  }, [useHistory]);

  useEffect(() => setActive(-1), [text]);

  const visits = useMemo(() => (browser && text ? relevant(browser.visits, text) : []), [browser, text]);
  const items = text ? composeSuggestions(text, { visits, tabs: browser?.tabs, currentTabId: browser?.currentTabId, google: google.filter((g) => g !== text) }) : [];
  // the address-bar completion: typed text plus the rest of a site name, the rest selected
  const completion = useHistory && !noComplete && active < 0 && q === text && !composing ? inlineCompletion(visits, q) : undefined;
  const boxValue = active >= 0 && items[active] ? boxText(items[active]) : completion ? q + completion.display.slice(q.length) : q;

  // Every keystroke re-selects the completed part: typing a letter that matches it leaves the
  // shown text unchanged, and without this the selection would be gone.
  useLayoutEffect(() => {
    if (completion && document.activeElement === input.current) input.current!.setSelectionRange(q.length, boxValue.length);
  }, [q, boxValue, completion?.display]);

  const search = (raw: string) => {
    const s = raw.trim();
    if (!s) return;
    if (isUrl(s)) location.href = s;
    else if (looksLikeAddress(s)) location.href = `https://${s}`;
    else if (cur.url) location.href = cur.url.replace('%s', encodeURIComponent(s));
    else void chrome.search.query({ text: s, disposition: 'CURRENT_TAB' });
  };

  const go = async (s: Suggestion) => {
    if (s.kind === 'url') location.href = s.url;
    else if (s.kind === 'tab') {
      await chrome.tabs.update(s.tabId, { active: true });
      await chrome.windows.update(s.windowId, { focused: true });
      // a new tab that was only opened to get there isn't needed any more
      if (window.history.length <= 1) {
        const self = await chrome.tabs.getCurrent();
        if (self?.id !== undefined) await chrome.tabs.remove(self.id);
      }
    } else search(s.text);
  };

  const listOpen = showList && items.length > 0;
  // Suggestions are on but Google isn't allowed yet: ask where they would appear.
  const ask = showList && suggest && allowed === false && !!text && !isUrl(text);

  const accept = () => {
    if (!completion) return false;
    setQ(completion.display);
    return true;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // keys the IME is using (choosing a candidate, Esc to cancel it) aren't meant for the box
    if (e.isComposing) return;
    // → takes the completion (Tab keeps moving focus, as elsewhere on the page)
    if (e.key === 'ArrowRight' && completion && accept()) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (completion) setNoComplete(true);
      else if (active >= 0) setActive(-1);
      else setShowList(false);
      return;
    }
    if (!listOpen) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = items.length;
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    }
  };

  return (
    <form
      class="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0 && items[active]) void go(items[active]);
        else if (completion) location.href = completion.url;
        else search(q);
      }}
    >
      <div class="search-engine">
        <button
          type="button"
          class="search-engine-btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {cur.label}
        </button>
        {open && (
          <ul class="search-engine-menu" role="listbox">
            {Object.entries(ENGINES).map(([id, e]) => (
              <li key={id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={id === engine}
                  onClick={() => {
                    onEngine(id);
                    setOpen(false);
                    input.current?.focus();
                  }}
                >
                  {e.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        ref={input}
        class="search-input"
        type="search"
        placeholder={t('widgets.search.placeholder')}
        aria-label={t('common.search')}
        aria-keyshortcuts="/"
        role="combobox"
        aria-autocomplete="both"
        aria-expanded={listOpen}
        aria-controls="search-suggestions"
        aria-activedescendant={listOpen && active >= 0 ? `sugg-${active}` : undefined}
        autoComplete="off"
        value={boxValue}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(e) => {
          setComposing(false);
          setQ((e.target as HTMLInputElement).value);
        }}
        onInput={(e) => {
          setComposing((e as InputEvent).isComposing);
          // typing over the selected completion replaces it, so the value is what was typed
          setQ((e.target as HTMLInputElement).value);
          setNoComplete((e as InputEvent).inputType?.startsWith('delete') ?? false);
          setShowList(true);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setShowList(true);
          loadBrowser();
        }}
        onBlur={() => {
          setShowList(false);
          setComposing(false);
        }}
        autoFocus
      />
      {listOpen && (
        <ul id="search-suggestions" class="search-suggest" role="listbox" aria-label={t('widgets.search.suggestions')}>
          {items.map((s, i) => {
            const main = s.kind === 'url' || s.kind === 'tab' ? s.title : s.text;
            const head = s.kind === 'suggest' && main.toLowerCase().startsWith(text.toLowerCase()) ? main.slice(0, text.length) : '';
            return (
              <li
                key={`${s.kind}:${s.kind === 'url' || s.kind === 'tab' ? s.url : s.text}`}
                id={`sugg-${i}`}
                role="option"
                aria-selected={i === active}
                // keeps the input focused, so its blur doesn't close the list before the click
                onMouseDown={(e) => e.preventDefault()}
                // goes there; hovering only highlights
                onClick={() => void go(s)}
              >
                {s.kind === 'url' || s.kind === 'tab' ? (
                  <img class="search-suggest-icon" src={favicon(s.url, 16)} alt="" width={16} height={16} />
                ) : s.kind === 'past' ? (
                  <Clock />
                ) : (
                  <Magnifier />
                )}
                <span class="search-suggest-main">
                  {head && <span class="search-suggest-typed">{head}</span>}
                  {main.slice(head.length)}
                </span>
                {s.kind === 'url' && <span class="search-suggest-sub">{displayUrl(s.url)}</span>}
                {s.kind === 'tab' && <span class="search-suggest-action">{t('widgets.search.switchTab')}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {ask && (
        // mousedown would blur the input and close this before the click lands
        <div class="search-suggest search-suggest-ask" onMouseDown={(e) => e.preventDefault()}>
          <HostPrompt text={t('widgets.permission.suggest')} perms={SUGGEST_PERMS} onDecline={onSuggestOff} />
        </div>
      )}
    </form>
  );
}
