import { useEffect, useState } from 'preact/hooks';
import {
  extendFocus,
  formatRemaining,
  getFocus,
  getFocusPrefs,
  onFocusChange,
  pauseFocus,
  PHASE_LABEL,
  remainingMs,
  resumeFocus,
  setFocusPrefs,
  BREAK_PRESETS,
  startFocus,
  stopFocus,
  WORK_PRESETS,
  type FocusPrefs,
  type FocusState,
} from '../lib/focus';

export function useFocus(): FocusState {
  const [s, setS] = useState<FocusState>({ status: 'idle' });
  useEffect(() => {
    void getFocus().then(setS);
    return onFocusChange(setS);
  }, []);
  return s;
}

const clampMin = (v: number) => Math.min(240, Math.max(1, Math.round(v) || 1));

/**
 * Preset chips plus a saved custom duration. The custom field keeps its own draft while typing
 * (the panel re-renders every second when the clock shows seconds, which would otherwise reset
 * a controlled input) and commits on Enter or blur.
 */
function Minutes({
  label,
  presets,
  value,
  custom,
  onChange,
}: {
  label: string;
  presets: number[];
  value: number;
  custom: number | undefined;
  onChange: (v: number, custom?: number) => void;
}) {
  const [draft, setDraft] = useState(custom ? String(custom) : '');
  useEffect(() => setDraft(custom ? String(custom) : ''), [custom]);
  const commit = () => {
    const n = Number(draft);
    if (!draft.trim() || !Number.isFinite(n) || n <= 0) {
      setDraft(custom ? String(custom) : '');
      return;
    }
    const v = clampMin(n);
    setDraft(String(v));
    onChange(v, v);
  };
  const customOn = custom !== undefined && value === custom && !presets.includes(value);
  return (
    <div class="focus-row">
      <span class="panel-kicker">{label}</span>
      <div class="focus-chips" role="radiogroup" aria-label={label}>
        {presets.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={value === p} class="chip" onClick={() => onChange(p)}>
            {p} 分
          </button>
        ))}
        <span class={`chip chip-input ${customOn ? 'is-on' : ''}`} role="radio" aria-checked={customOn}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            value={draft}
            placeholder="自訂"
            aria-label={`${label}自訂分鐘(1–240)`}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value.replace(/[^0-9]/g, ''))}
            onFocus={(e) => (e.target as HTMLInputElement).select()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          <span
            class="chip-unit"
            onClick={() => custom !== undefined && onChange(custom)}
          >
            分
          </span>
        </span>
      </div>
    </div>
  );
}

export function FocusPanel({ state, now }: { state: FocusState; now: Date }) {
  const [prefs, setPrefs] = useState<FocusPrefs>({ work: 25, break: 5 });
  useEffect(() => {
    void getFocusPrefs().then(setPrefs);
  }, []);
  const update = (p: FocusPrefs) => {
    setPrefs(p);
    void setFocusPrefs(p);
  };

  const left = remainingMs(state, now.getTime());
  if (left !== undefined && (state.status === 'running' || state.status === 'paused')) {
    const progress = 1 - left / state.durationMs;
    const end = state.status === 'running' ? new Date(state.endAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : undefined;
    return (
      <div class="focus">
        <p class="focus-phase">
          {PHASE_LABEL[state.phase]}
          {state.status === 'paused' ? '(已暫停)' : end ? ` · ${end} 結束` : ''}
        </p>
        <p class="focus-remaining" aria-live="off">
          {formatRemaining(left)}
        </p>
        <div class="focus-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <div class="panel-actions">
          {state.status === 'running' ? (
            <button type="button" class="text-btn" onClick={() => pauseFocus(state)}>暫停</button>
          ) : (
            <button type="button" class="text-btn" onClick={() => resumeFocus(state)}>繼續</button>
          )}
          <button type="button" class="text-btn" onClick={() => extendFocus(state, 5)}>+5 分鐘</button>
          <button type="button" class="text-btn" onClick={() => stopFocus()}>結束</button>
        </div>
      </div>
    );
  }

  return (
    <div class="focus">
      {state.status === 'done' && (
        <p class="focus-done">上一輪{PHASE_LABEL[state.phase]}已完成 ✓</p>
      )}
      <Minutes
        label="專注"
        presets={WORK_PRESETS}
        value={prefs.work}
        custom={prefs.workCustom}
        onChange={(v, custom) => update({ ...prefs, work: v, workCustom: custom ?? prefs.workCustom })}
      />
      <Minutes
        label="休息"
        presets={BREAK_PRESETS}
        value={prefs.break}
        custom={prefs.breakCustom}
        onChange={(v, custom) => update({ ...prefs, break: v, breakCustom: custom ?? prefs.breakCustom })}
      />
      <p class="panel-muted">開始後大時鐘會變成倒數;時間到時會跳出系統通知,關掉分頁也會提醒。</p>
      <div class="panel-actions">
        <button type="button" class="text-btn" onClick={() => startFocus('break', prefs.break)}>
          休息 {prefs.break} 分鐘
        </button>
        <button type="button" class="focus-start" onClick={() => startFocus('work', prefs.work)}>
          開始專注 {prefs.work} 分鐘
        </button>
      </div>
    </div>
  );
}
