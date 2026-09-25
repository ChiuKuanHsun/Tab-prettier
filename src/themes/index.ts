import { t } from '../i18n';
import type { ThemeId } from '../lib/types';

export const THEMES: { id: ThemeId; label: string; note: string }[] = [
  { id: 'editorial', label: t('lib.themes.editorial.label'), note: t('lib.themes.editorial.note') },
  { id: 'dreamy', label: t('lib.themes.dreamy.label'), note: t('lib.themes.dreamy.note') },
  { id: 'neon', label: t('lib.themes.neon.label'), note: t('lib.themes.neon.note') },
];

/** Clock size relative to the layout's; the neon monospace digits read much larger at the same size. */
export const CLOCK_SCALE: Record<ThemeId, number> = { editorial: 1, dreamy: 1, neon: 0.8 };
