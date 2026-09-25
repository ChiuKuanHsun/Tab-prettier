import { useEffect, useState } from 'preact/hooks';
import { addToBlacklist } from '../lib/settings';
import type { Credit, Scene } from '../lib/types';

const SOURCE_LABEL: Record<Credit['source'], string> = {
  wallhaven: 'Wallhaven',
  nekosia: 'Nekosia',
  waifuim: 'waifu.im',
  upload: '我的上傳',
};

function CreditRow({ role, credit, onBlock }: { role: string; credit: Credit; onBlock?: () => void }) {
  return (
    <div class="credit-row">
      <span class="panel-kicker">{role}</span>
      <p>
        {credit.artist ? (
          credit.artistUrl ? <a href={credit.artistUrl}>{credit.artist}</a> : <span>{credit.artist}</span>
        ) : (
          <span class="panel-muted">作者不詳</span>
        )}
        <span class="credit-src">
          {' · '}
          {credit.pageUrl ? <a href={credit.pageUrl}>{SOURCE_LABEL[credit.source]}</a> : SOURCE_LABEL[credit.source]}
        </span>
      </p>
      {onBlock && (
        <button type="button" class="text-btn" onClick={onBlock}>
          不要再出現
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
    setMsg('已加入黑名單,之後不會再出現。');
  };

  return (
    <div class="credit">
      <CreditRow role="背景" credit={scene.bg.credit} onBlock={scene.bg.credit.source !== 'upload' ? () => block(scene.bg.credit) : undefined} />
      {scene.char && (
        <CreditRow
          role="角色"
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
            if (!(await onNext())) setMsg('下一幅還在準備中,稍後再試。');
          }}
        >
          換一幅 →
        </button>
      </div>
      {msg && <p class="panel-muted" role="status">{msg}</p>}
    </div>
  );
}
