import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';

/** Dock button that swaps in the next scene right away, same as the credit panel's "next". */
export function NextSceneButton({ onNext }: { onNext: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(undefined), 3200);
    return () => clearTimeout(timer);
  }, [note]);

  const next = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await onNext())) setNote(t('widgets.credit.notReady'));
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
        class={`dock-icon next-btn ${busy ? 'is-busy' : ''}`}
        aria-label={t('widgets.next.label')}
        title={t('widgets.next.label')}
        disabled={busy}
        onClick={next}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.5" />
          <path d="M20 3.5v5h-5" />
        </svg>
      </button>
    </span>
  );
}
