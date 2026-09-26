import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { SUGGEST, useHosts } from '../lib/permissions';
import { HostPrompt } from './HostPrompt';

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
  return (data[1] ?? []).slice(0, 7);
}

const isUrl = (t: string) => /^https?:\/\/\S+$/i.test(t);

export function Search({
  engine,
  onEngine,
  suggest,
  onSuggestOff,
}: {
  engine: string;
  onEngine: (e: string) => void;
  suggest: boolean;
  /** Turns suggestions off (the user declined to allow them). */
  onSuggestOff: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [showList, setShowList] = useState(false);
  const cur = ENGINES[engine] ?? ENGINES.default;
  const allowed = useHosts(SUGGEST);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable]');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  // Debounced suggestions; each keystroke aborts the previous request.
  useEffect(() => {
    const text = q.trim();
    if (!suggest || !allowed || !text || isUrl(text)) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetchSuggestions(text, engine, ctrl.signal).then(
        (s) => {
          setItems(s.filter((x) => x !== text));
          setActive(-1);
        },
        () => {},
      );
    }, 140);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, engine, suggest, allowed]);

  const go = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    if (isUrl(text)) location.href = text;
    else if (cur.url) location.href = cur.url.replace('%s', encodeURIComponent(text));
    else void chrome.search.query({ text, disposition: 'CURRENT_TAB' });
  };

  const listOpen = showList && items.length > 0;
  // Suggestions are on but Google isn't allowed yet: ask where they would appear.
  const ask = showList && suggest && allowed === false && !!q.trim() && !isUrl(q.trim());

  const onKeyDown = (e: KeyboardEvent) => {
    if (!listOpen) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = items.length;
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setShowList(false);
    }
  };

  return (
    <form
      class="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(listOpen && active >= 0 ? items[active] : q);
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
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls="search-suggestions"
        aria-activedescendant={listOpen && active >= 0 ? `sugg-${active}` : undefined}
        autoComplete="off"
        value={listOpen && active >= 0 ? items[active] : q}
        onInput={(e) => {
          setQ((e.target as HTMLInputElement).value);
          setShowList(true);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setShowList(true)}
        onBlur={() => setShowList(false)}
        autoFocus
      />
      {listOpen && (
        <ul id="search-suggestions" class="search-suggest" role="listbox" aria-label={t('widgets.search.suggestions')}>
          {items.map((s, i) => {
            const typed = q.trim();
            const head = s.toLowerCase().startsWith(typed.toLowerCase()) ? s.slice(0, typed.length) : '';
            return (
              <li
                key={s}
                id={`sugg-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown (not click) so the input's blur doesn't close the list first
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(s);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {head && <span class="search-suggest-typed">{head}</span>}
                <span>{s.slice(head.length)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {ask && (
        // mousedown would blur the input and close this before the click lands
        <div class="search-suggest search-suggest-ask" onMouseDown={(e) => e.preventDefault()}>
          <HostPrompt text={t('widgets.permission.suggest')} origins={SUGGEST} onDecline={onSuggestOff} />
        </div>
      )}
    </form>
  );
}
