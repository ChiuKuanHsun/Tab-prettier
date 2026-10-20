import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { dismissNotice, takeNotice, type Release } from '../lib/updates';

/**
 * After an update with release notes, one line above the dock for the next few new tabs: the
 * version, what changed most, and a link to the full notes. `wait` holds it back (and keeps the
 * tab from counting) while it would get in the way, e.g. during a focus round.
 */
export function UpdateNote({ wait }: { wait: boolean }) {
  const [release, setRelease] = useState<Release>();
  const [taken, setTaken] = useState(false);
  useEffect(() => {
    if (wait || taken) return;
    setTaken(true);
    void takeNotice().then(setRelease);
  }, [wait, taken]);
  if (!release || wait) return null;

  const close = () => {
    setRelease(undefined);
    void dismissNotice();
  };
  return (
    <div class="update-note" role="status">
      <span class="update-mark" aria-hidden="true">✦</span>
      <span class="update-version">{t('newtab.update.updated', { version: release.version })}</span>
      <span class="update-summary">{t(release.summary)}</span>
      <a class="update-more" href={chrome.runtime.getURL('updates.html')} onClick={() => void dismissNotice()}>
        {t('newtab.update.details')} ›
      </a>
      <button type="button" class="update-close" aria-label={t('newtab.update.close')} title={t('newtab.update.close')} onClick={close}>
        ×
      </button>
    </div>
  );
}
