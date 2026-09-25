import type { ThemeId } from '../lib/types';

export const THEMES: { id: ThemeId; label: string; note: string }[] = [
  { id: 'editorial', label: '日系雜誌極簡', note: '細腳大字、直書日期、細線留白' },
  { id: 'dreamy', label: '夢幻柔光', note: '斜體、柔和光暈、粉彩漸層' },
  { id: 'neon', label: '賽博霓虹', note: '等寬字、霓虹描邊、掃描線' },
];
