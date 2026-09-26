import { describe, expect, it } from 'vitest';
import { listFolder, mediaKind, usableFile, type FolderHandle } from '../lib/folders';

type Fake = { kind: 'file'; name: string } | { kind: 'directory'; name: string; values(): AsyncGenerator<Fake> };
const file = (name: string): Fake => ({ kind: 'file', name });
const dir = (name: string, ...entries: Fake[]): Fake => ({
  kind: 'directory',
  name,
  async *values() {
    yield* entries;
  },
});

describe('folders', () => {
  it('takes pictures (and videos for backgrounds) only', () => {
    expect(usableFile('a.JPG', 'bg')).toBe(true);
    expect(usableFile('clip.webm', 'bg')).toBe(true);
    expect(usableFile('clip.webm', 'char')).toBe(false);
    expect(usableFile('anim.gif', 'char')).toBe(false);
    expect(usableFile('notes.txt', 'bg')).toBe(false);
    expect(mediaKind('x.mp4')).toBe('video');
    expect(mediaKind('x.gif')).toBe('gif');
    expect(mediaKind('x.png')).toBe('image');
  });

  it('walks two levels of subfolders, skipping hidden entries', async () => {
    const root = dir(
      'wallpapers',
      file('a.png'),
      file('.hidden.png'),
      file('readme.md'),
      dir('night', file('b.webp'), dir('old', file('c.jpg'), dir('older', file('d.jpg')))),
      dir('.trash', file('e.png')),
    );
    const found = await listFolder(root as unknown as FolderHandle, 'bg');
    expect(found.map((f) => f.path)).toEqual(['a.png', 'night/b.webp', 'night/old/c.jpg']);
  });
});
