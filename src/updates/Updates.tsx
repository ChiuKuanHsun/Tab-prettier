import { t } from '../i18n';
import { RELEASES } from '../lib/updates';

/** Every release with notes, newest first; the new tab's update notice links here. */
export function Updates() {
  return (
    <div class="opt">
      <header class="opt-hero">
        <p class="opt-kicker">TAB PRETTIER</p>
        <h1>{t('updates.title')}</h1>
        <p class="opt-status">
          <a class="opt-link" href="help.html">
            {t('help.heading')}
          </a>
          <a class="opt-link" href="options.html">
            {t('help.backToSettings')}
          </a>
        </p>
      </header>

      {RELEASES.map((r) => (
        <section key={r.version} id={`v${r.version}`} class="opt-section">
          <header>
            <h2>{r.version}</h2>
          </header>
          <div class="help-body">
            <ul class="help-list">
              {r.items.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
