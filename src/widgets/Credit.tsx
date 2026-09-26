import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { isBirthdayOn } from '../lib/list-chars';
import { addToBlacklist } from '../lib/settings';
import type { Credit, Scene } from '../lib/types';

const SOURCE_LABEL: Record<Credit['source'], string> = {
  wallhaven: 'Wallhaven',
  nekosia: 'Nekosia',
  waifuim: 'waifu.im',
  danbooru: 'Danbooru',
  upload: t('widgets.credit.upload'),
};

function CreditRow({ role, credit, onBlock }: { role: string; credit: Credit; onBlock?: () => void }) {
  return (
    <div class="credit-row">
      <span class="panel-kicker">{role}</span>
      <p>
        {credit.artist ? (
          credit.artistUrl ? <a href={credit.artistUrl}>{credit.artist}</a> : <span>{credit.artist}</span>
        ) : (
          <span class="panel-muted">{t('widgets.credit.unknownArtist')}</span>
        )}
        <span class="credit-src">
          {' · '}
          {credit.pageUrl ? <a href={credit.pageUrl}>{SOURCE_LABEL[credit.source]}</a> : SOURCE_LABEL[credit.source]}
        </span>
      </p>
      {onBlock && (
        <button type="button" class="text-btn" onClick={onBlock}>
          {t('widgets.credit.block')}
        </button>
      )}
    </div>
  );
}

export function CreditPanel({ scene, onNext }: { scene: Scene; onNext: () => Promise<boolean> }) {
  const [msg, setMsg] = useState<string>();
  useEffect(() => setMsg(undefined), [scene.id]);

  const block = async (c: Credit) => {
    await addToBlacklist(c.id);
    setMsg(t('widgets.credit.blocked'));
  };

  return (
    <div class="credit">
      {scene.char?.birthday && isBirthdayOn(scene.char.birthday) && (
        <p class="credit-birthday">{t('widgets.credit.birthday', { name: scene.char.birthday.name })}</p>
      )}
      <CreditRow role={t('common.bg')} credit={scene.bg.credit} onBlock={scene.bg.credit.source !== 'upload' ? () => block(scene.bg.credit) : undefined} />
      {scene.char && (
        <CreditRow
          role={t('common.char')}
          credit={scene.char.credit}
          onBlock={scene.char.credit.source !== 'upload' ? () => block(scene.char!.credit) : undefined}
        />
      )}
      {scene.char?.credit.tags?.length ? (
        <p class="credit-tags">{scene.char.credit.tags.slice(0, 8).map((t) => `#${t}`).join('  ')}</p>
      ) : null}
      <div class="panel-actions">
        <button
          type="button"
          class="text-btn"
          onClick={async () => {
            if (!(await onNext())) setMsg(t('widgets.credit.notReady'));
          }}
        >
          {t('widgets.credit.next')}
        </button>
      </div>
      {msg && <p class="panel-muted" role="status">{msg}</p>}
    </div>
  );
}
