// Zips dist/ into tab-prettier-v<version>.zip for the Chrome Web Store upload, or with `firefox`
// dist-firefox/ into tab-prettier-firefox-v<version>.zip for addons.mozilla.org. Run after a
// production build (npm run package / package:firefox do both); refuses a build that still has
// source maps.
//
// With `source`, zips the committed source instead (git archive of HEAD) as
// tab-prettier-source-v<version>.zip, which addons.mozilla.org asks for alongside a bundled build.
//
// Usage: node tools/package.mjs [firefox|source]
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const ROOT = join(import.meta.dirname, '..');

if (process.argv[2] === 'source') {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  // the reviewers rebuild from this, so it has to be exactly what the package was built from
  if (git('status', '--porcelain', '--untracked-files=no').trim()) throw new Error('uncommitted changes: commit them first');
  const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const out = join(ROOT, `tab-prettier-source-v${version}.zip`);
  git('archive', '--format=zip', `--output=${out}`, 'HEAD');
  console.log(`${relative(ROOT, out)}: ${(statSync(out).size / 1e6).toFixed(1)} MB (${git('rev-parse', '--short', 'HEAD').trim()})`);
  process.exit(0);
}

const firefox = process.argv[2] === 'firefox';
const DIST = join(ROOT, firefox ? 'dist-firefox' : 'dist');
const { version } = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
const out = join(ROOT, `tab-prettier${firefox ? '-firefox' : ''}-v${version}.zip`);

const files = (function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
})(DIST);
if (files.some((f) => f.endsWith('.map'))) throw new Error(`${relative(ROOT, DIST)}/ has source maps: run a production build first`);

// A plain zip writer (deflate, no zip64): the package stays well under 4 GB.
const local = [], central = [];
let offset = 0;
for (const f of files) {
  const name = Buffer.from(relative(DIST, f).split('\\').join('/'));
  const raw = readFileSync(f);
  const packed = deflateRawSync(raw, { level: 9 });
  const [method, body] = packed.length < raw.length ? [8, packed] : [0, raw];
  const crc = crc32(raw);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4); // version needed
  head.writeUInt16LE(0x0800, 6); // UTF-8 names
  head.writeUInt16LE(method, 8);
  head.writeUInt32LE(0x00210000, 10); // 1980-01-01 00:00, so the zip is reproducible
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(body.length, 18);
  head.writeUInt32LE(raw.length, 22);
  head.writeUInt16LE(name.length, 26);
  local.push(head, name, body);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4); // made by
  dir.writeUInt16LE(20, 6);
  dir.writeUInt16LE(0x0800, 8);
  dir.writeUInt16LE(method, 10);
  dir.writeUInt32LE(0x00210000, 12);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(body.length, 20);
  dir.writeUInt32LE(raw.length, 24);
  dir.writeUInt16LE(name.length, 28);
  dir.writeUInt32LE(offset, 42);
  central.push(dir, name);
  offset += head.length + name.length + body.length;
}
const dirSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(dirSize, 12);
end.writeUInt32LE(offset, 16);
writeFileSync(out, Buffer.concat([...local, ...central, end]));
console.log(`${relative(ROOT, out)}: ${files.length} files, ${(statSync(out).size / 1e6).toFixed(1)} MB`);
