import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface DockItem {
  id: string;
  label: string;
  render: () => ComponentChildren;
}

/**
 * Collapsed edge tabs that expand into a panel on hover (or click to pin, Alt+1..n, Esc to close),
 * so the artwork stays the focus until the user reaches for a tool.
 */
export function Dock({
  items,
  side,
  settingsUrl,
  extra,
}: {
  items: DockItem[];
  side: 'left' | 'right';
  settingsUrl: string;
  /** Rendered in the tab row before the settings link (e.g. the favourite heart). */
  extra?: ComponentChildren;
}) {
  const [open, setOpen] = useState<string>();
  const [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const root = useRef<HTMLDivElement>(null);

  const schedule = (fn: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(undefined);
        setPinned(false);
      }
      const n = e.altKey ? Number(e.key) : NaN;
      if (n >= 1 && n <= items.length) {
        e.preventDefault();
        const id = items[n - 1].id;
        setOpen((cur) => (cur === id ? undefined : id));
        setPinned(true);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (open && !root.current?.contains(e.target as Node)) {
        setOpen(undefined);
        setPinned(false);
      }
    };
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', onDown);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', onDown);
    };
  }, [items, open]);

  const active = items.find((i) => i.id === open);

  return (
    <div
      ref={root}
      class={`dock dock-${side}`}
      onPointerLeave={() => !pinned && schedule(() => setOpen(undefined), 380)}
      onPointerEnter={() => clearTimeout(timer.current)}
      data-enter="rise"
    >
      {active && (
        <section class="panel" aria-label={active.label} key={active.id}>
          <header class="panel-head">
            <h2>{active.label}</h2>
          </header>
          <div class="panel-body">{active.render()}</div>
        </section>
      )}
      <nav class="dock-tabs" aria-label="工具">
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            class="dock-tab"
            aria-expanded={open === it.id}
            aria-keyshortcuts={`Alt+${i + 1}`}
            onPointerEnter={(e) => e.pointerType === 'mouse' && !pinned && schedule(() => setOpen(it.id), 140)}
            onClick={() => {
              if (open === it.id && pinned) {
                setOpen(undefined);
                setPinned(false);
              } else {
                setOpen(it.id);
                setPinned(true);
              }
            }}
          >
            <span class="dock-num">{String(i + 1).padStart(2, '0')}</span>
            <span class="dock-label">{it.label}</span>
          </button>
        ))}
        {extra}
        <a class="dock-icon dock-settings" href={settingsUrl} aria-label="設定" title="設定">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            {/* 8 teeth, so a 45° turn lands on an identical pose */}
            <path class="gear-teeth" d="M9.89 5.11L10.17 2.58L13.83 2.58L14.11 5.11A7.2 7.2 0 0 1 15.38 5.64L17.37 4.04L19.96 6.63L18.36 8.62A7.2 7.2 0 0 1 18.89 9.89L21.42 10.17L21.42 13.83L18.89 14.11A7.2 7.2 0 0 1 18.36 15.38L19.96 17.37L17.37 19.96L15.38 18.36A7.2 7.2 0 0 1 14.11 18.89L13.83 21.42L10.17 21.42L9.89 18.89A7.2 7.2 0 0 1 8.62 18.36L6.63 19.96L4.04 17.37L5.64 15.38A7.2 7.2 0 0 1 5.11 14.11L2.58 13.83L2.58 10.17L5.11 9.89A7.2 7.2 0 0 1 5.64 8.62L4.04 6.63L6.63 4.04L8.62 5.64A7.2 7.2 0 0 1 9.89 5.11Z" />
            <circle class="gear-hub" cx="12" cy="12" r="3" />
          </svg>
        </a>
      </nav>
    </div>
  );
}
