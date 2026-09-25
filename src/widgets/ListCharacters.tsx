import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { knownMatch, lookupCharacter, type CharMatch } from '../lib/char-map';
import { isPicked, MIN_POSTS, type CharPicks, type ListAnime } from '../lib/list-chars';
import { getCharPicks, onCharPicks, setCharPick } from '../lib/list-picks';
import './list-characters.css';

/** The user's per-character ticks, kept in step across pages. */
export function useCharPicks(): CharPicks {
  const [picks, setPicks] = useState<CharPicks>({});
  useEffect(() => {
    void getCharPicks().then(setPicks);
    return onCharPicks(setPicks);
  }, []);
  return picks;
}

/**
 * Looks up each character's Danbooru tag, cached answers first, then the rest one at a time
 * (a show can have 25 characters; firing them all at once would trip Danbooru's rate limits).
 */
function useMatches(anime: ListAnime) {
  const [matches, setMatches] = useState<Map<number, CharMatch | null>>(new Map());
  useEffect(() => {
    let alive = true;
    const found = new Map<number, CharMatch | null>();
    void (async () => {
      for (const c of anime.characters) {
        const known = await knownMatch(c.id);
        if (known !== undefined) found.set(c.id, known);
      }
      if (alive) setMatches(new Map(found));
      for (const c of anime.characters) {
        if (!alive) return;
        if (found.has(c.id)) continue;
        found.set(c.id, await lookupCharacter(c).catch(() => null));
        if (alive) setMatches(new Map(found));
        await new Promise((r) => setTimeout(r, 150));
      }
    })();
    return () => {
      alive = false;
    };
  }, [anime.id]);
  return matches;
}

function matchText(m: CharMatch | null | undefined) {
  if (m === undefined) return t('widgets.listChars.checking');
  if (!m) return t('widgets.listChars.notFound');
  if (m.posts < MIN_POSTS) return t('widgets.listChars.tooFew');
  return t('widgets.listChars.posts', { n: m.posts.toLocaleString() });
}

/**
 * One show's main and supporting characters with ticks: which of them character scenes may
 * use. Female characters are ticked by default. Characters without enough Danbooru images are
 * shown faded — they would never be picked. `disabled` explains why nothing can be changed.
 */
export function ListCharacters({ anime, picks, disabled }: { anime: ListAnime; picks: CharPicks; disabled?: string }) {
  const matches = useMatches(anime);
  if (!anime.characters.length) return <p class="lc-note">{t('widgets.listChars.none')}</p>;
  return (
    <>
      {disabled && <p class="lc-note">{disabled}</p>}
      <ul class="lc-grid">
        {anime.characters.map((c) => {
          const on = isPicked(c, picks);
          const m = matches.get(c.id);
          const weak = m === null || (m !== undefined && m.posts < MIN_POSTS);
          const role = t(c.role === 'MAIN' ? 'widgets.listChars.main' : 'widgets.listChars.supporting');
          return (
            <li key={c.id} class={`lc ${on ? 'is-on' : ''} ${weak ? 'is-weak' : ''}`}>
              <label title={m ? m.tag : undefined}>
                <input type="checkbox" checked={on} disabled={!!disabled} onChange={() => void setCharPick(c.id, !on)} />
                {c.image ? <img src={c.image} alt="" loading="lazy" /> : <span class="lc-img" />}
                <span class="lc-name">{c.name.native || c.name.full}</span>
                <small>{role}</small>
                <small class="lc-status">{matchText(m)}</small>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}
