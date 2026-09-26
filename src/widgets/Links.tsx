import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { duotone } from '../lib/duotone';
import { RECENT, TOP_SITES, usePerms } from '../lib/permissions';
import { getLinks, onKeyChange, saveLinks, uid } from '../lib/settings';
import type { LinkGroup } from '../lib/types';

export const favicon = (url: string, size = 32) =>
  `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=${size}`;

export function useLinks() {
  const [groups, setGroups] = useState<LinkGroup[]>([]);
  useEffect(() => {
    void getLinks().then(setGroups);
    return onKeyChange<LinkGroup[]>('links', setGroups);
  }, []);
  const update = (g: LinkGroup[]) => {
    setGroups(g);
    void saveLinks(g);
  };
  return [groups, update] as const;
}

export function normaliseUrl(u: string) {
  const t = u.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
}

/** Colours for the pinned icons: the scene's accent, and whether the text there is light. */
export interface IconTint { accent: string; light: boolean }

/** A pinned link's icon; tinted, the original shows through on hover. */
function StripIcon({ url, title, tint }: { url: string; title: string; tint?: IconTint }) {
  const src = favicon(url);
  const [tinted, setTinted] = useState<string>();
  useEffect(() => {
    setTinted(undefined);
    if (tint) void duotone(src, tint.accent, tint.light).then(setTinted, () => undefined);
  }, [src, tint?.accent, tint?.light]);
  return (
    <>
      <img src={src} alt={title} width={20} height={20} />
      {tinted && <img class="link-tint" src={tinted} alt="" width={20} height={20} />}
    </>
  );
}

/**
 * Compact favicon rows under the search box when links are pinned: `perRow` a row, and with
 * `tint` the icons take the scene's colours.
 */
export function LinkStrip({ perRow, tint }: { perRow: number; tint?: IconTint }) {
  const [groups] = useLinks();
  const links = groups.flatMap((g) => g.links).slice(0, 24);
  return (
    <nav class="link-strip" style={{ '--per-row': perRow }} aria-label={t('widgets.links.strip')} data-enter="rise">
      {links.map((l) => (
        <a key={l.id} href={l.url} title={l.title}>
          <StripIcon url={l.url} title={l.title} tint={tint} />
        </a>
      ))}
    </nav>
  );
}

interface BrowserLink { key: string; title: string; url: string; open?: () => void }

const webPage = (url: string | undefined): url is string => !!url && /^(https?|file):/.test(url);

/** Recently closed tabs, reopened with their history; live while the permission is granted. */
function useRecentlyClosed(on: boolean): BrowserLink[] {
  const ok = usePerms(RECENT);
  const [items, setItems] = useState<BrowserLink[]>([]);
  useEffect(() => {
    if (!on || !ok) return setItems([]);
    const load = () =>
      void chrome.sessions.getRecentlyClosed({ maxResults: 20 }).then((sessions) =>
        setItems(
          sessions
            .flatMap(({ tab }) => {
              const id = tab?.sessionId;
              if (!id || !webPage(tab.url)) return []; // other new tabs, settings pages…
              return [{ key: id, title: tab.title || tab.url, url: tab.url, open: () => void chrome.sessions.restore(id) }];
            })
            .slice(0, 8),
        ),
      );
    load();
    chrome.sessions.onChanged.addListener(load);
    return () => chrome.sessions.onChanged.removeListener(load);
  }, [on, ok]);
  return items;
}

/** The sites Chrome's own new tab offers as shortcuts. */
function useTopSites(on: boolean): BrowserLink[] {
  const ok = usePerms(TOP_SITES);
  const [items, setItems] = useState<BrowserLink[]>([]);
  useEffect(() => {
    if (!on || !ok) return setItems([]);
    void chrome.topSites.get().then((sites) =>
      setItems(sites.filter((s) => webPage(s.url)).slice(0, 8).map((s) => ({ key: s.url, title: s.title || s.url, url: s.url }))),
    );
  }, [on, ok]);
  return items;
}

function BrowserList({ title, items }: { title: string; items: BrowserLink[] }) {
  if (!items.length) return null;
  return (
    <section class="link-group">
      <h3 class="panel-kicker">{title}</h3>
      <ul class="link-list">
        {items.map((l) => (
          <li key={l.key}>
            <a
              href={l.url}
              class="link"
              title={l.url}
              aria-label={l.open ? t('widgets.links.restore', { title: l.title }) : undefined}
              onClick={
                l.open &&
                ((e) => {
                  e.preventDefault();
                  l.open!();
                })
              }
            >
              <img src={favicon(l.url)} alt="" width={18} height={18} />
              <span>{l.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The user's link groups (editable), then recently closed tabs and top sites when switched on. */
export function LinksPanel({ recent, top }: { recent: boolean; top: boolean }) {
  const recentItems = useRecentlyClosed(recent);
  const topItems = useTopSites(top);
  const [groups, update] = useLinks();
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<{ g: number; i: number }>();

  const edit = (fn: (next: LinkGroup[]) => void) => {
    const next = structuredClone(groups);
    fn(next);
    update(next);
  };

  const move = (to: { g: number; i: number }) => {
    if (!drag) return;
    edit((next) => {
      const [item] = next[drag.g].links.splice(drag.i, 1);
      const idx = drag.g === to.g && drag.i < to.i ? to.i - 1 : to.i;
      next[to.g].links.splice(idx, 0, item);
    });
    setDrag(undefined);
  };

  const addLink = (gi: number, form: HTMLFormElement) => {
    const data = new FormData(form);
    const raw = String(data.get('url') ?? '').trim();
    if (!raw) return;
    const url = normaliseUrl(raw);
    let title = String(data.get('title') ?? '').trim();
    if (!title) {
      try {
        title = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        title = raw;
      }
    }
    edit((next) => next[gi].links.push({ id: uid(), title, url }));
    form.reset();
  };

  return (
    <div class={`links ${editing ? 'is-editing' : ''}`}>
      <div class="panel-actions">
        <button type="button" class="text-btn" onClick={() => setEditing(!editing)}>
          {editing ? t('widgets.links.done') : t('widgets.links.edit')}
        </button>
        {editing && (
          <button type="button" class="text-btn" onClick={() => update([...groups, { id: uid(), name: t('widgets.links.newGroup'), links: [] }])}>
            {t('widgets.links.addGroup')}
          </button>
        )}
      </div>
      {groups.map((g, gi) => (
        <section
          key={g.id}
          class="link-group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => move({ g: gi, i: g.links.length })}
        >
          {editing ? (
            <div class="link-group-head">
              <input
                class="inline-input"
                value={g.name}
                aria-label={t('widgets.links.groupName')}
                onChange={(e) => edit((next) => (next[gi].name = (e.target as HTMLInputElement).value))}
              />
              <button type="button" class="icon-btn" aria-label={t('widgets.links.deleteGroup')} onClick={() => update(groups.filter((_, i) => i !== gi))}>
                ×
              </button>
            </div>
          ) : (
            <h3 class="panel-kicker">{g.name}</h3>
          )}
          <ul class="link-list">
            {g.links.map((l, i) => (
              <li
                key={l.id}
                draggable={editing}
                onDragStart={() => setDrag({ g: gi, i })}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.stopPropagation();
                  move({ g: gi, i });
                }}
              >
                <a href={editing ? undefined : l.url} class="link">
                  <img src={favicon(l.url)} alt="" width={18} height={18} />
                  <span>{l.title}</span>
                </a>
                {editing && (
                  <button
                    type="button"
                    class="icon-btn"
                    aria-label={t('common.deleteItem', { name: l.title })}
                    onClick={() => edit((next) => next[gi].links.splice(i, 1))}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editing && (
            <form
              class="link-add"
              onSubmit={(e) => {
                e.preventDefault();
                addLink(gi, e.currentTarget);
              }}
            >
              <input name="title" placeholder={t('widgets.links.name')} aria-label={t('widgets.links.name')} />
              <input name="url" placeholder={t('widgets.links.url')} aria-label={t('widgets.links.url')} required />
              <button type="submit" class="text-btn">{t('common.add')}</button>
            </form>
          )}
        </section>
      ))}
      {!editing && <BrowserList title={t('widgets.links.recent')} items={recentItems} />}
      {!editing && <BrowserList title={t('widgets.links.top')} items={topItems} />}
    </div>
  );
}
