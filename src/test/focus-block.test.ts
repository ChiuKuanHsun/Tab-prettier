import { describe, expect, it } from 'vitest';
import { blockingNow, normalizeSite, parseSites, sitePattern, siteRule, watchedSites } from '../lib/focus-block';

describe('sites', () => {
  it('reduces whatever is typed or pasted to the site name', () => {
    expect(normalizeSite('youtube.com')).toBe('youtube.com');
    expect(normalizeSite('https://www.YouTube.com/watch?v=abc')).toBe('youtube.com');
    expect(normalizeSite('*.reddit.com')).toBe('reddit.com');
    expect(normalizeSite('m.facebook.com:443/home')).toBe('m.facebook.com');
    expect(normalizeSite('localhost')).toBeUndefined();
    expect(normalizeSite('not a site')).toBeUndefined();
  });

  it('splits on commas, spaces and new lines, each entry once, keeping exceptions', () => {
    expect(parseSites('youtube.com, x.com\nhttps://www.youtube.com/，reddit.com  junk')).toEqual(['youtube.com', 'x.com', 'reddit.com']);
    expect(parseSites('youtube.com -music.youtube.com - -https://music.youtube.com/')).toEqual(['youtube.com', '-music.youtube.com']);
    expect(watchedSites(['youtube.com', '-music.youtube.com'])).toEqual(['youtube.com']);
    expect(sitePattern('youtube.com')).toBe('*://*.youtube.com/*');
  });
});

describe('siteRule', () => {
  const block = ['youtube.com', '-music.youtube.com', 'x.com'];
  const remind = ['reddit.com', 'x.com'];
  const rule = (url: string) => siteRule(url, block, remind);

  it('covers subdomains but not look-alike names', () => {
    expect(rule('https://www.youtube.com/watch')).toEqual({ site: 'youtube.com', mode: 'block' });
    expect(rule('https://m.youtube.com/')).toEqual({ site: 'youtube.com', mode: 'block' });
    expect(rule('https://notyoutube.com/')).toBeUndefined();
    expect(rule('https://box.com/')).toBeUndefined();
    expect(rule('not a url')).toBeUndefined();
  });

  it('lets exceptions through, and stopping wins over reminding', () => {
    expect(rule('https://music.youtube.com/watch?v=1')).toBeUndefined();
    expect(rule('https://www.reddit.com/r/anime')).toEqual({ site: 'reddit.com', mode: 'remind' });
    expect(rule('https://x.com/home')).toEqual({ site: 'x.com', mode: 'block' });
    expect(siteRule('https://music.youtube.com/', ['youtube.com'], ['-music.youtube.com'])).toBeUndefined();
  });
});

describe('blockingNow', () => {
  const now = 1_000_000;
  it('counts only a running focus round', () => {
    expect(blockingNow({ status: 'running', phase: 'work', endAt: now + 1, durationMs: 1 }, now)).toBe(true);
    expect(blockingNow({ status: 'running', phase: 'break', endAt: now + 1, durationMs: 1 }, now)).toBe(false);
    expect(blockingNow({ status: 'running', phase: 'work', endAt: now - 1, durationMs: 1 }, now)).toBe(false);
    expect(blockingNow({ status: 'paused', phase: 'work', remainingMs: 5, durationMs: 1 }, now)).toBe(false);
    expect(blockingNow({ status: 'idle' }, now)).toBe(false);
  });
});
