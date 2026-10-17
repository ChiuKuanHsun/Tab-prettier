// Zips dist/ into tab-prettier-v<version>.zip for the Chrome Web Store upload. Run after a
// production build (npm run package does both); refuses a dist/ that still has source maps.
//
// Usage: node tools/package.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const { version } = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
const out = join(ROOT, `tab-prettier-v${version}.zip`);

const files = (function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
})(DIST);
if (files.some((f) => f.endsWith('.map'))) throw new Error('dist/ has source maps: run a production build first');

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
