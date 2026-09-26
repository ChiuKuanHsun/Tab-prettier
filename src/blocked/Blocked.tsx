import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { getCurrent } from '../lib/db';
import { formatRemaining, getFocus, onFocusChange, remainingMs, type FocusState } from '../lib/focus';
import { allowForRound, blockingNow } from '../lib/focus-block';
import { useNow } from '../newtab/hooks';

const params = new URLSearchParams(location.search);
/** The list entry that stopped the tab, e.g. "youtube.com" (let through for the round on request). */
const listed = params.get('site') ?? '';

/** Where the tab was going; only web pages are gone back to. */
const from = (() => {
  const raw = params.get('from') ?? '';
  try {
    const u = new URL(raw);
    return /^https?:$/.test(u.protocol) ? u : undefined;
  } catch {
    return undefined;
  }
})();

/** The scene on the new tab right now, dimmed behind the countdown so the pause looks like home. */
function useBackdrop() {
  const [bg, setBg] = useState<{ url: string; accent: string }>();
  useEffect(() => {
    let url: string | undefined;
    void getCurrent().then((cur) => {
      if (!cur || cur.scene.bg.kind === 'video') return;
      url = URL.createObjectURL(cur.scene.bg.blob);
      setBg({ url, accent: cur.scene.theme.accent });
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, []);
  return bg;
}

/**
 * Shown instead of a "stop first" site during a focus round: the time left, a way on for the
 * rest of the round, and the way back once the round ends (or is paused or stopped), by itself.
 */
export function Blocked() {
  const [focus, setFocusState] = useState<FocusState>();
  const now = useNow(1000);
  const bg = useBackdrop();

  useEffect(() => {
    void getFocus().then(setFocusState);
    return onFocusChange(setFocusState);
  }, []);

  const blocked = !focus || blockingNow(focus, now.getTime());
  useEffect(() => {
    if (!blocked && from) location.replace(from.href);
  }, [blocked]);

  const left = focus && remainingMs(focus, now.getTime());
  const site = from?.hostname.replace(/^www\./, '');

  return (
    <main class="blocked" style={bg ? { '--accent': bg.accent } : undefined}>
      {bg && <img class="blocked-bg" src={bg.url} alt="" />}
      <div class="blocked-card">
        <p class="blocked-kicker">{t('blocked.kicker')}</p>
        <p class="blocked-time" role="timer">
          {left !== undefined ? formatRemaining(left) : '--:--'}
        </p>
        <p class="blocked-text">{site ? t('blocked.text', { site }) : t('blocked.textNoSite')}</p>
        {from && listed && (
          <button
            type="button"
            class="blocked-go"
            onClick={async () => {
              await allowForRound(listed);
              location.replace(from.href);
            }}
          >
            {t('blocked.continue')}
          </button>
        )}
      </div>
    </main>
  );
}
