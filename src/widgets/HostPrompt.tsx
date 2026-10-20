import { t } from '../i18n';
import { requestPerms, type Perms } from '../lib/permissions';

/**
 * A one-line request for a site the extension may not reach yet: Allow asks Chrome (the
 * permission change updates whoever is watching), Not now turns the feature off instead.
 */
export function HostPrompt({ text, perms, onDecline }: { text: string; perms: Perms; onDecline: () => void }) {
  return (
    <p class="host-prompt">
      <span>{text}</span>
      <button type="button" class="text-btn" onClick={() => void requestPerms(perms)}>
        {t('widgets.permission.allow')}
      </button>
      <button type="button" class="text-btn" onClick={onDecline}>
        {t('widgets.permission.decline')}
      </button>
    </p>
  );
}
