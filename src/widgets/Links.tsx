import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
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

/** Compact favicon row shown under the search box when links are pinned. */
export function LinkStrip() {
  const [groups] = useLinks();
  const links = groups.flatMap((g) => g.links).slice(0, 12);
  return (
    <nav class="link-strip" aria-label={t('widgets.links.strip')} data-enter="rise">
      {links.map((l) => (
        <a key={l.id} href={l.url} title={l.title}>
          <img src={favicon(l.url)} alt={l.title} width={20} height={20} />
        </a>
      ))}
    </nav>
  );
}

export function LinksPanel() {
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
    </div>
  );
}
