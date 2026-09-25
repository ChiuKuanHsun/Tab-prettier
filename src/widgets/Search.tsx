import { useEffect, useRef, useState } from 'preact/hooks';

export const ENGINES: Record<string, { label: string; url?: string }> = {
  default: { label: '預設' },
  google: { label: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  ddg: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  youtube: { label: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
  bilibili: { label: 'bilibili', url: 'https://search.bilibili.com/all?keyword=%s' },
  anilist: { label: 'AniList', url: 'https://anilist.co/search/anime?search=%s' },
  pixiv: { label: 'pixiv', url: 'https://www.pixiv.net/tags/%s' },
};

export function Search({ engine, onEngine }: { engine: string; onEngine: (e: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const cur = ENGINES[engine] ?? ENGINES.default;

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

  const submit = (e: Event) => {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    if (/^https?:\/\/\S+$/i.test(text)) location.href = text;
    else if (cur.url) location.href = cur.url.replace('%s', encodeURIComponent(text));
    else void chrome.search.query({ text, disposition: 'CURRENT_TAB' });
  };

  return (
    <form class="search" role="search" onSubmit={submit}>
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
        placeholder="搜尋,或輸入網址…"
        aria-label="搜尋"
        aria-keyshortcuts="/"
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        autoFocus
      />
    </form>
  );
}
