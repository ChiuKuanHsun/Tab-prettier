import { describe, expect, it } from 'vitest';
import { blockingNow, isBlockedUrl, normalizeSite, parseSites, sitePattern } from '../lib/focus-block';

describe('sites', () => {
  it('reduces whatever is typed or pasted to the site name', () => {
    expect(normalizeSite('youtube.com')).toBe('youtube.com');
    expect(normalizeSite('https://www.YouTube.com/watch?v=abc')).toBe('youtube.com');
    expect(normalizeSite('*.reddit.com')).toBe('reddit.com');
    expect(normalizeSite('m.facebook.com:443/home')).toBe('m.facebook.com');
    expect(normalizeSite('localhost')).toBeUndefined();
    expect(normalizeSite('not a site')).toBeUndefined();
  });

  it('splits on commas, spaces and new lines, each site once', () => {
    expect(parseSites('youtube.com, x.com\nhttps://www.youtube.com/，reddit.com  junk')).toEqual(['youtube.com', 'x.com', 'reddit.com']);
  });

  it('covers subdomains but not look-alike names', () => {
    const sites = ['youtube.com', 'x.com'];
    expect(isBlockedUrl('https://www.youtube.com/watch', sites)).toBe(true);
    expect(isBlockedUrl('https://m.youtube.com/', sites)).toBe(true);
    expect(isBlockedUrl('https://x.com/home', sites)).toBe(true);
    expect(isBlockedUrl('https://notyoutube.com/', sites)).toBe(false);
    expect(isBlockedUrl('https://box.com/', sites)).toBe(false);
    expect(isBlockedUrl('not a url', sites)).toBe(false);
    expect(sitePattern('youtube.com')).toBe('*://*.youtube.com/*');
  });
});

describe('blockingNow', () => {
  const now = 1_000_000;
  it('blocks only during a running focus round', () => {
    expect(blockingNow({ status: 'running', phase: 'work', endAt: now + 1, durationMs: 1 }, now)).toBe(true);
    expect(blockingNow({ status: 'running', phase: 'break', endAt: now + 1, durationMs: 1 }, now)).toBe(false);
    expect(blockingNow({ status: 'running', phase: 'work', endAt: now - 1, durationMs: 1 }, now)).toBe(false);
    expect(blockingNow({ status: 'paused', phase: 'work', remainingMs: 5, durationMs: 1 }, now)).toBe(false);
    expect(blockingNow({ status: 'idle' }, now)).toBe(false);
  });
});
