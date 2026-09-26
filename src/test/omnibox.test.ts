import { describe, expect, it } from 'vitest';
import {
  composeSuggestions,
  displayUrl,
  inlineCompletion,
  looksLikeAddress,
  matchTabs,
  pastSearches,
  rankSites,
  searchedFor,
  type Visit,
} from '../lib/omnibox';

const now = Date.UTC(2026, 8, 26);
const day = 86_400_000;
const visit = (url: string, visitCount = 1, typedCount = 0, daysAgo = 1, title = ''): Visit => ({
  url,
  title,
  visitCount,
  typedCount,
  lastVisitTime: now - daysAgo * day,
});

describe('searchedFor', () => {
  it('reads the words from search result pages', () => {
    expect(searchedFor('https://www.google.com/search?q=frieren+anime&hl=zh')).toBe('frieren anime');
    expect(searchedFor('https://www.google.com.tw/search?q=%E8%91%AC%E9%80%81')).toBe('葬送');
    expect(searchedFor('https://www.youtube.com/results?search_query=lofi')).toBe('lofi');
    expect(searchedFor('https://search.bilibili.com/all?keyword=%E5%88%9D%E9%9F%B3')).toBe('初音');
    expect(searchedFor('https://duckduckgo.com/?q=vite')).toBe('vite');
  });

  it('ignores other pages', () => {
    expect(searchedFor('https://www.google.com/maps?q=taipei')).toBeUndefined();
    expect(searchedFor('https://www.youtube.com/watch?v=1')).toBeUndefined();
    expect(searchedFor('not a url')).toBeUndefined();
  });
});

describe('sites', () => {
  const visits = [
    visit('https://www.youtube.com/', 80, 20),
    visit('https://www.youtube.com/watch?v=abc', 3, 0, 2, 'Some video'),
    visit('https://yourdictionary.com/', 2),
    visit('https://www.google.com/search?q=youtube', 5),
    visit('ftp://you.example/', 50),
  ];

  it('ranks the often-typed site first and leaves out search pages and non-web links', () => {
    const ranked = rankSites(visits, 'you').map((v) => v.url);
    expect(ranked[0]).toBe('https://www.youtube.com/');
    expect(ranked).not.toContain('https://www.google.com/search?q=youtube');
    expect(ranked).not.toContain('ftp://you.example/');
  });

  it('completes a site name the user has gone to before', () => {
    expect(inlineCompletion(visits, 'yo')).toEqual({ display: 'youtube.com', url: 'https://www.youtube.com/' });
    expect(inlineCompletion(visits, 'YOUT')).toEqual({ display: 'youtube.com', url: 'https://www.youtube.com/' });
    // rarely visited: no completion; a search with spaces: none either
    expect(inlineCompletion(visits, 'yourd')).toBeUndefined();
    expect(inlineCompletion(visits, 'you tube')).toBeUndefined();
  });

  it('shows addresses the way the address bar does', () => {
    expect(displayUrl('https://www.youtube.com/')).toBe('youtube.com');
    expect(displayUrl('http://example.org/a/b')).toBe('example.org/a/b');
  });
});

describe('pastSearches', () => {
  it('finds earlier searches starting with the text, latest first, each once', () => {
    const visits = [
      visit('https://www.google.com/search?q=frieren+season+2', 1, 0, 3),
      visit('https://www.youtube.com/results?search_query=Frieren+OST', 1, 0, 1),
      visit('https://www.google.com/search?q=frieren+season+2&start=10', 1, 0, 2),
      visit('https://www.google.com/search?q=sousou+no+frieren', 1, 0, 5),
      visit('https://www.google.com/search?q=fern', 1, 0, 1),
    ];
    expect(pastSearches(visits, 'frie')).toEqual(['Frieren OST', 'frieren season 2', 'sousou no frieren']);
  });
});

describe('tabs and the whole list', () => {
  const tabs = [
    { id: 1, windowId: 1, url: 'https://github.com/me/tab-prettier', title: 'tab-prettier' },
    { id: 2, windowId: 1, url: 'chrome://extensions', title: 'Extensions' },
    { id: 3, windowId: 1, url: 'https://github.com/', title: 'GitHub' },
  ];

  it('matches open web tabs, not this one', () => {
    expect(matchTabs(tabs, 'git', 3).map((t) => t.id)).toEqual([1]);
    expect(matchTabs(tabs, 'ext').map((t) => t.id)).toEqual([]);
  });

  it('puts sites, tabs and past searches before Google, without repeats, eight at most', () => {
    const visits = [visit('https://github.com/', 30, 5), visit('https://www.google.com/search?q=github+actions', 1)];
    const google = ['github', 'github actions', 'github copilot', 'a', 'b', 'c', 'd', 'e', 'f'];
    const list = composeSuggestions('github', { visits, tabs, currentTabId: 99, google });
    expect(list.slice(0, 4).map((s) => s.kind)).toEqual(['tab', 'tab', 'past', 'suggest']);
    expect(list.filter((s) => s.kind === 'suggest').map((s) => s.kind === 'suggest' && s.text)).not.toContain('github actions');
    expect(list).toHaveLength(8);
  });
});

describe('looksLikeAddress', () => {
  it('tells addresses from searches', () => {
    expect(looksLikeAddress('youtube.com')).toBe(true);
    expect(looksLikeAddress('example.org/path?a=1')).toBe(true);
    expect(looksLikeAddress('localhost:5173')).toBe(true);
    expect(looksLikeAddress('frieren anime')).toBe(false);
    expect(looksLikeAddress('frieren')).toBe(false);
    expect(looksLikeAddress('v1.2 release')).toBe(false);
  });
});
