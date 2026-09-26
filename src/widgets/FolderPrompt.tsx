import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { allowFolder, folderAccess, getFolder, unbindFolder, type FolderHandle, type FolderRole } from '../lib/folders';

const ROLES: FolderRole[] = ['bg', 'char'];

/**
 * Chrome may ask again for read access to a bound folder after a restart, and only on a click:
 * one quiet line to allow it, or to stop using the folder. Until then the pipeline skips it.
 */
export function FolderPrompt() {
  const [waiting, setWaiting] = useState<{ role: FolderRole; handle: FolderHandle }[]>([]);

  const check = async () => {
    const out: typeof waiting = [];
    for (const role of ROLES) {
      const handle = await getFolder(role);
      if (handle && (await folderAccess(handle).catch(() => 'granted')) === 'prompt') out.push({ role, handle });
    }
    setWaiting(out);
  };
  useEffect(() => void check(), []);

  if (!waiting.length) return null;
  return (
    <p class="host-prompt">
      <span>{t('widgets.folder.prompt', { name: waiting.map((w) => w.handle.name).join(t('common.listSep')) })}</span>
      <button
        type="button"
        class="text-btn"
        onClick={async () => {
          for (const w of waiting) await allowFolder(w.handle).catch(() => false);
          void check();
        }}
      >
        {t('widgets.permission.allow')}
      </button>
      <button
        type="button"
        class="text-btn"
        onClick={async () => {
          for (const w of waiting) await unbindFolder(w.role);
          void check();
        }}
      >
        {t('widgets.permission.decline')}
      </button>
    </p>
  );
}
