import { t } from '../i18n';
import { hasAnyScene, queueCount } from '../lib/db';
import { FOCUS_ALARM, getFocus, getFocusPrefs, PHASE_LABEL, setFocus, startFocus, type FocusState } from '../lib/focus';
import { queueTarget, type ToBackground, type ToOffscreen } from '../lib/messages';
import { getBlacklist, getSettings } from '../lib/settings';

const OFFSCREEN_URL = 'offscreen.html';

async function hasOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  return ctx.length > 0;
}

let creating: Promise<void> | undefined;
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Runs the on-device image segmentation model that cuts characters out of artwork.',
    })
    .finally(() => (creating = undefined));
  await creating;
}

async function refill(opts: { fromIdle?: boolean; lowPower?: boolean; force?: boolean } = {}) {
  const settings = await getSettings();
  // Cache-only power saving makes nothing new, unless there is nothing at all to show yet or
  // the user asked for it (regenerate in the settings).
  if (settings.powerSave === 'cache' && !opts.force && (await hasAnyScene())) return;
  const target = queueTarget(settings);
  if ((await queueCount()) >= target) return;
  if ((settings.processOnlyWhenIdle || opts.lowPower) && !opts.fromIdle) {
    const state = await chrome.idle.queryState(60);
    if (state === 'active') {
      await chrome.storage.session.set({ refillDeferred: true });
      return;
    }
  }
  await chrome.storage.session.set({ refillDeferred: false });
  await ensureOffscreen();
  const msg: ToOffscreen = { to: 'offscreen', type: 'refill', settings, blacklist: await getBlacklist(), target };
  // A freshly created document may not have registered its listener yet (and other extension
  // pages can swallow the message), so retry until the offscreen document acknowledges it.
  for (let i = 0; i < 40; i++) {
    const res = await chrome.runtime.sendMessage(msg).catch(() => undefined);
    if (res?.ack) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  console.warn('[bg] offscreen document never acknowledged refill');
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create('refill', { periodInMinutes: 30 });
  await refill();
});
chrome.runtime.onStartup.addListener(() => void refill());
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'refill') void refill();
  if (a.name === FOCUS_ALARM) void finishFocus();
});

// --- Focus timer -------------------------------------------------------------------

/** Keeps the alarm in step with the shared timer state, whichever tab changed it. */
async function scheduleFocus(s: FocusState) {
  await chrome.alarms.clear(FOCUS_ALARM);
  if (s.status === 'running') await chrome.alarms.create(FOCUS_ALARM, { when: s.endAt });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.focus) void scheduleFocus((changes.focus.newValue as FocusState) ?? { status: 'idle' });
});

async function finishFocus() {
  const s = await getFocus();
  if (s.status !== 'running' || s.endAt > Date.now() + 2000) return;
  await setFocus({ status: 'done', phase: s.phase, finishedAt: Date.now() });
  const prefs = await getFocusPrefs();
  const wasWork = s.phase === 'work';
  await chrome.notifications.create('focus', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: wasWork ? t('background.workDoneTitle') : t('background.breakDoneTitle'),
    message: wasWork
      ? t('background.workDoneMessage', { n: Math.round(s.durationMs / 60_000) })
      : t('background.breakDoneMessage'),
    buttons: wasWork
      ? [
          { title: t('background.startBreak', { n: prefs.break }) },
          { title: t('background.workAgain', { phase: PHASE_LABEL.work, n: prefs.work }) },
        ]
      : [{ title: t('background.startWork', { phase: PHASE_LABEL.work, n: prefs.work }) }],
    priority: 2,
    // stays until dismissed, so a break reminder isn't missed while away from the screen
    requireInteraction: true,
  });
}

chrome.notifications.onButtonClicked.addListener(async (id, index) => {
  if (id !== 'focus') return;
  const s = await getFocus();
  const prefs = await getFocusPrefs();
  const startBreak = s.status === 'done' && s.phase === 'work' && index === 0;
  await (startBreak ? startFocus('break', prefs.break) : startFocus('work', prefs.work));
  await chrome.notifications.clear('focus');
});

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === 'active') return;
  const { refillDeferred } = await chrome.storage.session.get('refillDeferred');
  if (refillDeferred) await refill({ fromIdle: true });
});

chrome.runtime.onMessage.addListener((msg: ToBackground, _sender, sendResponse) => {
  if (msg?.to !== 'bg') return;
  (async () => {
    try {
      if (msg.type === 'refill') await refill({ lowPower: msg.lowPower, force: msg.force });
      if (msg.type === 'offscreen-idle' && (await hasOffscreen())) await chrome.offscreen.closeDocument();
    } catch (e) {
      console.warn('[bg]', msg.type, e);
    }
    sendResponse({ ok: true });
  })();
  return true;
});
