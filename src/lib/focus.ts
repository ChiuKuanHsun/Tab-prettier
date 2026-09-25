/**
 * Focus timer shared by every tab: the state lives in chrome.storage.local, new tabs render it,
 * and the service worker schedules an alarm for `endAt` and notifies when a phase ends.
 */

export type FocusPhase = 'work' | 'break';

export type FocusState =
  | { status: 'running'; phase: FocusPhase; endAt: number; durationMs: number }
  | { status: 'paused'; phase: FocusPhase; remainingMs: number; durationMs: number }
  | { status: 'done'; phase: FocusPhase; finishedAt: number }
  | { status: 'idle' };

const KEY = 'focus';
export const FOCUS_ALARM = 'focus-end';

export async function getFocus(): Promise<FocusState> {
  const { [KEY]: s } = await chrome.storage.local.get(KEY);
  return (s as FocusState | undefined) ?? { status: 'idle' };
}

export const setFocus = (s: FocusState) => chrome.storage.local.set({ [KEY]: s });

export function onFocusChange(cb: (s: FocusState) => void) {
  const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) cb((changes[KEY].newValue as FocusState | undefined) ?? { status: 'idle' });
  };
  chrome.storage.onChanged.addListener(l);
  return () => chrome.storage.onChanged.removeListener(l);
}

export const startFocus = (phase: FocusPhase, minutes: number) =>
  setFocus({ status: 'running', phase, endAt: Date.now() + minutes * 60_000, durationMs: minutes * 60_000 });

export function pauseFocus(s: FocusState) {
  if (s.status !== 'running') return;
  return setFocus({ status: 'paused', phase: s.phase, remainingMs: Math.max(0, s.endAt - Date.now()), durationMs: s.durationMs });
}

export function resumeFocus(s: FocusState) {
  if (s.status !== 'paused') return;
  return setFocus({ status: 'running', phase: s.phase, endAt: Date.now() + s.remainingMs, durationMs: s.durationMs });
}

export function extendFocus(s: FocusState, minutes: number) {
  const ms = minutes * 60_000;
  if (s.status === 'running') return setFocus({ ...s, endAt: s.endAt + ms, durationMs: s.durationMs + ms });
  if (s.status === 'paused') return setFocus({ ...s, remainingMs: s.remainingMs + ms, durationMs: s.durationMs + ms });
}

export const stopFocus = () => setFocus({ status: 'idle' });

/** Remaining milliseconds for a running or paused timer, else undefined. */
export function remainingMs(s: FocusState, now = Date.now()) {
  if (s.status === 'running') return Math.max(0, s.endAt - now);
  if (s.status === 'paused') return s.remainingMs;
  return undefined;
}

export const countdownActive = (s: FocusState) => s.status === 'running' || s.status === 'paused';

export function formatRemaining(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60), sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const WORK_PRESETS = [25, 50];
export const BREAK_PRESETS = [5, 10];

/** Chosen durations, plus the user's own custom duration for each (kept even when a preset is picked). */
export interface FocusPrefs { work: number; break: number; workCustom?: number; breakCustom?: number }

export async function getFocusPrefs(): Promise<FocusPrefs> {
  const { focusPrefs } = await chrome.storage.local.get('focusPrefs');
  const p: FocusPrefs = { work: 25, break: 5, ...(focusPrefs as Partial<FocusPrefs> | undefined) };
  // earlier versions only stored the chosen value; a non-preset one was a custom duration
  p.workCustom ??= WORK_PRESETS.includes(p.work) ? undefined : p.work;
  p.breakCustom ??= BREAK_PRESETS.includes(p.break) ? undefined : p.break;
  return p;
}
export const setFocusPrefs = (p: FocusPrefs) => chrome.storage.local.set({ focusPrefs: p });

export const PHASE_LABEL: Record<FocusPhase, string> = { work: '專注', break: '休息' };
