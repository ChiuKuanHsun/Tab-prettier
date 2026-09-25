// Builds the extension icon: an anime catgirl peeking over a new tab, ears breaking out of the
// frame. Writes the SVG sources to assets/icon/ (including the alternative concepts) and the
// PNGs referenced by the manifest to public/icons/.
//
// Usage: node tools/build_icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = join(import.meta.dirname, '..');
const INK = '#16141a', TOP = '#3a3146', CREAM = '#f4efe7', GOLD = '#c9a27a', SKIN = '#f7e6d8';

// 128-unit canvas; the tile is the 96-unit square at 16..112 (Chrome Web Store asks for 16px of
// padding at 128px). Small sizes crop tighter so the tile fills more of the pixels.
const VIEW = { store: '0 0 128 128', tight: '10 4 108 108' };

const tile = (id, inner, outside = '') => `
  <defs>
    <linearGradient id="bg-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${TOP}"/><stop offset="1" stop-color="${INK}"/>
    </linearGradient>
    <clipPath id="sq-${id}"><rect x="16" y="16" width="96" height="96" rx="22"/></clipPath>
  </defs>
  <rect x="16" y="16" width="96" height="96" rx="22" fill="url(#bg-${id})"/>
  ${outside}
  <g clip-path="url(#sq-${id})">${inner}</g>`;

/** The new tab in front: a cream tab with a title line and a gold "+". */
const newTab = `
  <path d="M6 114 Q22 114 22 104 L22 90 Q22 80 32 80 L96 80 Q106 80 106 90 L106 104 Q106 114 122 114 Z" fill="${CREAM}"/>
  <rect x="34" y="94" width="36" height="6" rx="3" fill="${INK}" opacity="0.45"/>
  <path d="M90 90 V104 M83 97 H97" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>`;

const eyes = `
  <ellipse cx="52" cy="73" rx="5.6" ry="7" fill="${INK}"/>
  <ellipse cx="76" cy="73" rx="5.6" ry="7" fill="${INK}"/>
  <ellipse cx="52" cy="76" rx="3.8" ry="3.2" fill="${GOLD}"/>
  <ellipse cx="76" cy="76" rx="3.8" ry="3.2" fill="${GOLD}"/>
  <circle cx="54" cy="70" r="2.1" fill="#fff"/>
  <circle cx="78" cy="70" r="2.1" fill="#fff"/>
  <path d="M44.5 67.5 Q51 62.5 58.5 66" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M83.5 67.5 Q77 62.5 69.5 66" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;

const head = (hair, shade) => `
  <ellipse cx="64" cy="64" rx="35" ry="33" fill="${hair}"/>
  <path d="M29 64 Q27 86 34 100 L40 100 Q36 84 38 66 Z" fill="${shade}"/>
  <path d="M99 64 Q101 86 94 100 L88 100 Q92 84 90 66 Z" fill="${shade}"/>
  <ellipse cx="64" cy="76" rx="27" ry="22" fill="${SKIN}"/>
  <path d="M34 66 Q36 42 64 39 Q92 42 94 66 L88 58 L82 66 L74 55 L66 64 L58 55 L50 66 L44 57 L38 66 Z" fill="${hair}"/>
  <path d="M41 58 Q45 47 57 43" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.45"/>`;

/** Cat ears reaching past the tile's top edge; a shade outline keeps them readable on any surface. */
const ears = (hair, shade) => `
  <g stroke-linejoin="round">
    <path d="M32 54 L29 8 L58 34 Z" fill="${hair}" stroke="${shade}" stroke-width="3"/>
    <path d="M96 54 L99 8 L70 34 Z" fill="${hair}" stroke="${shade}" stroke-width="3"/>
    <path d="M36 42 L34 20 L49 34 Z" fill="#f2b8c6"/>
    <path d="M92 42 L94 20 L79 34 Z" fill="#f2b8c6"/>
  </g>`;

const bow = `
  <g transform="translate(90 44) rotate(20)">
    <path d="M0 0 L-10 -7 L-10 7 Z M0 0 L10 -7 L10 7 Z" fill="${GOLD}" stroke="${GOLD}" stroke-width="2" stroke-linejoin="round"/>
    <circle r="3" fill="#e0bf97"/>
  </g>`;
const ahoge = (hair) => `<path d="M64 31 C62 22 70 15 78 17 C71 19 68 24 68 31 Z" fill="${hair}"/>`;

const DESIGNS = {
  // chosen: silver-lavender catgirl, ears breaking the frame
  icon: (id) => {
    const [hair, shade] = ['#cdbfe6', '#a996cf'];
    return tile(id, head(hair, shade) + eyes + newTab, ears(hair, shade));
  },
  // alternatives kept for later
  'concept-girl-bow': (id) => {
    const [hair, shade] = ['#cdbfe6', '#a996cf'];
    return tile(id, ahoge(hair) + head(hair, shade) + bow + eyes + newTab);
  },
  'concept-girl-brown-catears': (id) => {
    const [hair, shade] = ['#c9a27a', '#a8835c'];
    return tile(id, head(hair, shade) + eyes + newTab, ears(hair, shade));
  },
  'concept-tab-catears': (id) =>
    tile(id, `
      <g fill="${CREAM}" stroke="${CREAM}" stroke-width="4" stroke-linejoin="round">
        <path d="M33 57 L37 31 L55 55 Z"/><path d="M95 57 L91 31 L73 55 Z"/>
        <path d="M10 98 Q26 98 26 88 L26 64 Q26 53 37 53 L91 53 Q102 53 102 64 L102 88 Q102 98 118 98 Z"/>
      </g>
      <path d="M39 52 L40 40 L48 51 Z" fill="${GOLD}"/><path d="M89 52 L88 40 L80 51 Z" fill="${GOLD}"/>
      <circle cx="43" cy="75" r="7" fill="${GOLD}"/>
      <rect x="56" y="72" width="32" height="6" rx="3" fill="${INK}" opacity="0.55"/>`),
};

const svg = (body, viewBox, size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}">${body}</svg>\n`;

const iconDir = join(ROOT, 'assets/icon');
const pngDir = join(ROOT, 'public/icons');
mkdirSync(iconDir, { recursive: true });
mkdirSync(pngDir, { recursive: true });

for (const [name, draw] of Object.entries(DESIGNS)) {
  writeFileSync(join(iconDir, `${name}.svg`), svg(draw(name), VIEW.store, 128));
}

for (const size of [16, 32, 48, 128]) {
  const view = size === 128 ? VIEW.store : VIEW.tight;
  const png = new Resvg(svg(DESIGNS.icon(`s${size}`), view, size), { fitTo: { mode: 'width', value: size } })
    .render()
    .asPng();
  writeFileSync(join(pngDir, `icon-${size}.png`), png);
  console.log(`public/icons/icon-${size}.png`);
}
