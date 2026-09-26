/** Settings sections, in page order; the help page uses the same ids so each can deep-link to it. */
export const SECTION_IDS = ['look', 'sources', 'blend', 'motion', 'power', 'focus', 'uploads', 'favorites', 'anilist', 'backup'] as const;

export type SectionId = (typeof SECTION_IDS)[number];
