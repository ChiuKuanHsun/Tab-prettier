// Turns the Chrome build (dist/) into a Firefox one (dist-firefox/): the code is the same, only
// the manifest differs. Run after a build (npm run build:firefox does both).
//
// Usage: node tools/firefox.mjs
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'dist-firefox');

rmSync(OUT, { recursive: true, force: true });
// no offscreen documents in Firefox: the background page makes the scenes itself
cpSync(DIST, OUT, { recursive: true, filter: (src) => !src.endsWith('offscreen.html') });

const m = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
// Firefox's background is an event page (it has a DOM, so it can run the pipeline), not a service worker
m.background = { scripts: [m.background.service_worker], type: 'module' };
// offscreen and favicon don't exist there
m.permissions = m.permissions.filter((p) => p !== 'offscreen' && p !== 'favicon');
m.browser_specific_settings = {
  gecko: {
    id: 'tab-prettier@kuanhsun',
    // built-in data consent (data_collection_permissions) needs 140
    strict_min_version: '140.0',
    data_collection_permissions: {
      required: ['none'],
      // asked for when the feature is switched on (src/lib/permissions.ts)
      optional: ['locationInfo', 'searchTerms'],
    },
  },
};
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(m, null, 2)}\n`);
console.log('dist-firefox/ ready');
