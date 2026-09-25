import { describe, expect, it } from 'vitest';
import { t, tRich } from '../i18n';
import { zhTW } from '../i18n/zh-TW';

const leaves = (o: object, path = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${path}${k}`, v]] : leaves(v, `${path}${k}.`)));

describe('i18n', () => {
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
});
