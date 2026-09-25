import { queueCount } from '../lib/db';
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

async function refill(opts: { fromIdle?: boolean; lowPower?: boolean } = {}) {
  const settings = await getSettings();
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
      if (msg.type === 'refill') await refill({ lowPower: msg.lowPower });
      if (msg.type === 'offscreen-idle' && (await hasOffscreen())) await chrome.offscreen.closeDocument();
    } catch (e) {
      console.warn('[bg]', msg.type, e);
    }
    sendResponse({ ok: true });
  })();
  return true;
});
