import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { addFavorite, isFavorite, removeFavorite } from '../lib/scene-store';
import type { Scene } from '../lib/types';

/** Heart toggle for the scene on screen; favourites come back at random in later rotations. */
export function FavoriteButton({ scene, limit }: { scene: Scene; limit: number }) {
  const [fav, setFav] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  useEffect(() => {
    void isFavorite(scene.id).then(setFav);
  }, [scene.id]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(undefined), 3200);
    return () => clearTimeout(t);
  }, [note]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (fav) {
        await removeFavorite(scene.id);
      } else {
        const dropped = await addFavorite(scene, limit);
        if (dropped) setNote(t('widgets.favorite.limitDropped', { limit, n: dropped }));
      }
      setFav(!fav);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span class="fav-wrap">
      {note && (
        <span class="fav-note" role="status">
          {note}
        </span>
      )}
      <button
      type="button"
      class={`dock-icon fav-btn ${fav ? 'is-on' : ''}`}
      aria-pressed={fav}
      aria-label={fav ? t('widgets.favorite.remove') : t('widgets.favorite.add')}
      title={fav ? t('widgets.favorite.removeTitle') : t('widgets.favorite.addTitle')}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
      </button>
    </span>
  );
}
