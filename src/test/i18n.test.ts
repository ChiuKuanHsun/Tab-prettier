import { beforeEach, describe, expect, it } from 'vitest';
import { applyPref, t, tRich } from '../i18n';
import { en } from '../i18n/en';
import { zhTW } from '../i18n/zh-TW';

const leaves = (o: object, path = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${path}${k}`, v]] : leaves(v, `${path}${k}.`)));

describe('i18n', () => {
  beforeEach(() => applyPref('zh-TW'));

  it('looks up nested keys', () => {
    expect(t('common.settings')).toBe('設定');
  });

  it('fills placeholders and keeps unknown ones', () => {
    expect(t('widgets.todo.left', { n: 3 })).toBe('剩 3 項');
    expect(t('widgets.todo.left')).toBe('剩 {n} 項');
  });

  it('splits rich messages around their parts', () => {
    const link = { tag: 'a' };
    expect(tRich('options.queue', { n: link })).toEqual(['佇列中已準備 ', link, ' 幅畫面']);
  });

  it('uses full-width commas, colons and parentheses in Chinese prose', () => {
    // a half-width , : ( ) touching a CJK character; ASCII lists like "white-hair, catgirl" are fine
    const cjk = '[\\u3000-\\u9fff\\uff00-\\uffef]';
    const halfWidth = new RegExp(`${cjk}\\s*[,:()]|[,:()]\\s*${cjk}`);
    expect(leaves(zhTW).filter(([, s]) => halfWidth.test(s))).toEqual([]);
  });

  it('switches language', () => {
    applyPref('en');
    expect(t('common.settings')).toBe(en.common.settings);
    applyPref('zh-TW');
    expect(t('common.settings')).toBe('設定');
  });

  it('keeps the same placeholders in every language', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const zh = new Map(leaves(zhTW));
    const mismatched = leaves(en).filter(([k, v]) => names(v) !== names(zh.get(k) ?? ''));
    expect(mismatched).toEqual([]);
  });

  it('leaves no Chinese in the English strings', () => {
    // on purpose: the language picker names both languages; character search takes Japanese names
    const allowed = new Set(['options.look.language', 'options.chars.placeholder']);
    const cjk = /[\u3000-\u9fff\uff00-\uffef]/;
    expect(leaves(en).filter(([k, v]) => cjk.test(v) && !allowed.has(k))).toEqual([]);
  });
});
