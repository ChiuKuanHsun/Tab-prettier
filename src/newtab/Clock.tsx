const KANJI = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 1..31 → 一 … 三十一 */
export function kanjiNumber(n: number): string {
  if (n < 10) return KANJI[n];
  const tens = Math.floor(n / 10), ones = n % 10;
  return (tens > 1 ? KANJI[tens] : '') + '十' + (ones ? KANJI[ones] : '');
}

const pad = (n: number) => String(n).padStart(2, '0');

export function Clock({ now, h24, size }: { now: Date; h24: boolean; size: number }) {
  const h = h24 ? now.getHours() : now.getHours() % 12 || 12;
  const text = `${pad(h)}:${pad(now.getMinutes())}`;
  return (
    <time class="clock" dateTime={now.toISOString()} data-text={text} style={{ fontSize: `${size}px` }}>
      <span class="clock-h">{pad(h)}</span>
      <span class="clock-colon">:</span>
      <span class="clock-m">{pad(now.getMinutes())}</span>
      {!h24 && <span class="clock-ampm">{now.getHours() < 12 ? 'AM' : 'PM'}</span>}
    </time>
  );
}

export function VerticalDate({ now }: { now: Date }) {
  return (
    <div class="vdate" aria-label={now.toLocaleDateString('zh-TW', { dateStyle: 'full' })}>
      <span class="vdate-md">{kanjiNumber(now.getMonth() + 1)}月{kanjiNumber(now.getDate())}日</span>
      <span class="vdate-dow">{WEEK_JA[now.getDay()]}曜日</span>
    </div>
  );
}

export function Dateline({ now }: { now: Date }) {
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return (
    <p class="dateline">
      <span class="dateline-no">No.{String(day).padStart(3, '0')}</span>
      <span class="dateline-rule" />
      <span class="dateline-text">{WEEK_EN[now.getDay()]}, {MONTH_EN[now.getMonth()]} {now.getDate()}</span>
    </p>
  );
}
