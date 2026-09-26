import { t } from '../i18n';
import { requestHosts } from '../lib/permissions';

/**
 * A one-line request for a site the extension may not reach yet: Allow asks Chrome (the
 * permission change updates whoever is watching), Not now turns the feature off instead.
 */
export function HostPrompt({ text, origins, onDecline }: { text: string; origins: string[]; onDecline: () => void }) {
  return (
    <p class="host-prompt">
      <span>{text}</span>
      <button type="button" class="text-btn" onClick={() => void requestHosts(origins)}>
        {t('widgets.permission.allow')}
      </button>
      <button type="button" class="text-btn" onClick={onDecline}>
        {t('widgets.permission.decline')}
      </button>
    </p>
  );
}
