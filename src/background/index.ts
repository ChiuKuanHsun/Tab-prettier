import { loadLocalePref, t } from '../i18n';
import { hasAnyScene, queueCount } from '../lib/db';
import { FOCUS_ALARM, getFocus, getFocusPrefs, setFocus, startFocus, type FocusState } from '../lib/focus';
import { queueTarget, type FocusCheckReply, type ToBackground, type ToOffscreen } from '../lib/messages';
import { getBlacklist, getSettings, onKeyChange } from '../lib/settings';
import { allowedThisRound, blockingNow, clearAllowed, sitePattern, siteRule, unallowedSites, watchedSites } from '../lib/focus-block';
import { getToken, myListAnime } from '../lib/anilist';
import { chosenAnime, withPickedCharacters, type ListAnime } from '../lib/list-chars';
import { getCharPicks } from '../lib/list-picks';
import { PERF, resolveTier } from '../lib/perf';
import type { Settings } from '../lib/types';

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

/**
 * Shows on the user's AniList lists to take characters from, each with only the characters the
 * user has ticked — when that's switched on and logged in.
 */
async function listAnimeFor(s: Settings): Promise<ListAnime[] | undefined> {
  if (!s.sources.danbooru || !s.sources.listChars) return undefined;
  const token = await getToken();
  if (!token) return undefined;
  try {
    return withPickedCharacters(chosenAnime(await myListAnime(token), s.sources), await getCharPicks());
  } catch (e) {
    console.warn('[bg] AniList list', e);
    return undefined;
  }
}

async function refill(opts: { fromIdle?: boolean; lowPower?: boolean; force?: boolean } = {}) {
  const settings = await getSettings();
  // Cache-only power saving makes nothing new, unless there is nothing at all to show yet or
  // the user asked for it (regenerate in the settings).
  if (settings.powerSave === 'cache' && !opts.force && (await hasAnyScene())) return;
  const target = queueTarget(settings);
  if ((await queueCount()) >= target) return;
  // the low tier (chosen, or detected by the offscreen page) also waits for idle — unless there
  // is nothing at all to show yet
  const idleOnly = settings.processOnlyWhenIdle || opts.lowPower || PERF[await resolveTier(settings.perfTier, false)].idleOnly;
  if (idleOnly && !opts.fromIdle && (await hasAnyScene())) {
    const state = await chrome.idle.queryState(60);
    if (state === 'active') {
      await chrome.storage.session.set({ refillDeferred: true });
      return;
    }
  }
  await chrome.storage.session.set({ refillDeferred: false });
  await ensureOffscreen();
  const msg: ToOffscreen = {
    to: 'offscreen',
    type: 'refill',
    settings,
    blacklist: await getBlacklist(),
    target,
    listAnime: await listAnimeFor(settings),
  };
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
  await syncBlocker();
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
  if (area === 'local' && changes.focus) {
    const s = (changes.focus.newValue as FocusState) ?? { status: 'idle' };
    void scheduleFocus(s);
    if (blockingNow(s)) void blockOpenTabs();
    // "continue anyway" lasts until the round is over (a pause keeps it)
    if (s.status === 'idle' || s.status === 'done' || s.phase === 'break') void clearAllowed();
  }
});

// --- Distracting sites while focusing ---------------------------------------------

const BLOCK_SCRIPT = 'focus-block';
let registered: string | undefined;
let syncing = Promise.resolve();

/**
 * Registers the asking script (public/focus-block.js) on the listed sites Chrome has allowed,
 * or removes it when the feature is off. Registrations persist, so this runs only on changes,
 * one at a time (two at once would register the same id twice).
 */
function syncBlocker() {
  syncing = syncing.then(registerBlocker).catch((e) => console.warn('[bg] focus block', e));
  return syncing;
}

async function registerBlocker() {
  const matches = (await allowedWatched(await getSettings())).map(sitePattern);
  const key = matches.join(' ');
  if (key === registered) return;
  await chrome.scripting.unregisterContentScripts({ ids: [BLOCK_SCRIPT] }).catch(() => undefined);
  if (matches.length) {
    await chrome.scripting.registerContentScripts([{ id: BLOCK_SCRIPT, matches, js: ['focus-block.js'], runAt: 'document_start' }]);
  }
  registered = key;
}

onKeyChange('settings', () => void syncBlocker());
chrome.permissions.onAdded.addListener(() => void syncBlocker());
chrome.permissions.onRemoved.addListener(() => void syncBlocker());

/** Both lists' sites that Chrome has allowed (none when the feature is off). */
async function allowedWatched(s: Settings) {
  if (!s.focusBlock) return [];
  const sites = [...new Set([...watchedSites(s.focusBlockSites), ...watchedSites(s.focusRemindSites)])];
  const missing = new Set(await unallowedSites(sites));
  return sites.filter((x) => !missing.has(x));
}

/** How the page in a tab is treated (undefined: not listed, or the feature is off). */
async function ruleFor(url: string | undefined) {
  const s = await getSettings();
  return url && s.focusBlock ? siteRule(url, s.focusBlockSites, s.focusRemindSites) : undefined;
}

/**
 * Sends a tab on a "stop first" site to the blocked page while a focus round runs — unless it's
 * playing sound (music to work to) or was let through this round.
 */
async function blockTab(tab: chrome.tabs.Tab, url: string | undefined) {
  const rule = await ruleFor(url);
  if (!url || tab.id === undefined || tab.audible || rule?.mode !== 'block' || !blockingNow(await getFocus())) return;
  if ((await allowedThisRound()).includes(rule.site)) return;
  const q = new URLSearchParams({ from: url, site: rule.site });
  await chrome.tabs.update(tab.id, { url: chrome.runtime.getURL(`blocked.html?${q}`) });
}

/** When a focus round starts, tabs already open on "stop first" sites go too (not ones playing sound). */
async function blockOpenTabs() {
  const url = (await allowedWatched(await getSettings())).map(sitePattern);
  if (!url.length) return;
  for (const tab of await chrome.tabs.query({ url })) await blockTab(tab, tab.url);
}

async function finishFocus() {
  const s = await getFocus();
  if (s.status !== 'running' || s.endAt > Date.now() + 2000) return;
  await setFocus({ status: 'done', phase: s.phase, finishedAt: Date.now() });
  const prefs = await getFocusPrefs();
  await loadLocalePref(); // the user's language, not just Chrome's
  const work = t('lib.phase.work');
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
          { title: t('background.workAgain', { phase: work, n: prefs.work }) },
        ]
      : [{ title: t('background.startWork', { phase: work, n: prefs.work }) }],
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

chrome.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
  if (msg?.to !== 'bg') return;
  (async () => {
    let reply: object = { ok: true };
    try {
      if (msg.type === 'refill') await refill({ lowPower: msg.lowPower, force: msg.force });
      if (msg.type === 'focus-check' && sender.tab) {
        const url = sender.tab.url ?? sender.url;
        const rule = await ruleFor(url);
        await blockTab(sender.tab, url);
        await loadLocalePref();
        // the page shows the corner timer during focus rounds when it's listed at all
        reply = { remind: !!rule, label: t('blocked.kicker') } satisfies FocusCheckReply;
      }
      if (msg.type === 'offscreen-idle' && (await hasOffscreen())) await chrome.offscreen.closeDocument();
    } catch (e) {
      console.warn('[bg]', msg.type, e);
    }
    sendResponse(reply);
  })();
  return true;
});
