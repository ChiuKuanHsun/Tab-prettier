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
  startFocus,
  stopFocus,
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

const WORK_PRESETS = [25, 50];
const BREAK_PRESETS = [5, 10];
const clampMin = (v: number) => Math.min(240, Math.max(1, Math.round(v) || 1));

function Minutes({ label, presets, value, onChange }: { label: string; presets: number[]; value: number; onChange: (v: number) => void }) {
  return (
    <div class="focus-row">
      <span class="panel-kicker">{label}</span>
      <div class="focus-chips" role="radiogroup" aria-label={label}>
        {presets.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={value === p} class="chip" onClick={() => onChange(p)}>
            {p} 分
          </button>
        ))}
        <label class="chip chip-input">
          <input
            type="number"
            min={1}
            max={240}
            value={presets.includes(value) ? '' : value}
            placeholder="自訂"
            aria-label={`${label}自訂分鐘`}
            onChange={(e) => onChange(clampMin(Number((e.target as HTMLInputElement).value)))}
          />
        </label>
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
      <Minutes label="專注" presets={WORK_PRESETS} value={prefs.work} onChange={(v) => update({ ...prefs, work: v })} />
      <Minutes label="休息" presets={BREAK_PRESETS} value={prefs.break} onChange={(v) => update({ ...prefs, break: v })} />
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
