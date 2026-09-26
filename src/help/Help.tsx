import type { ComponentChildren } from 'preact';
import { t, tRich, type MessageKey } from '../i18n';
import { SECTION_IDS, type SectionId } from '../options/sections';

/** One explanation: an optional term (usually the setting's own label) and its text. */
type Item = [term: MessageKey | null, text: MessageKey];

const ITEMS: Record<SectionId, Item[]> = {
  look: [
    ['options.look.language', 'help.look.language'],
    ['options.look.rotation', 'help.look.rotation'],
    ['options.look.rotationMinutes', 'help.look.minutes'],
    ['options.look.rotationTabs', 'help.look.tabs'],
    ['options.look.suggest', 'help.look.suggest'],
    ['options.look.linkTint', 'help.look.linkTint'],
    ['options.weather.label', 'help.look.weather'],
    ['options.weather.auto', 'help.look.weatherAuto'],
    ['help.look.chromeTheme', 'help.look.chromeThemeText'],
  ],
  sources: [
    [null, 'help.sources.overview'],
    ['options.sources.timeAware', 'help.sources.timeAware'],
    ['options.sources.query', 'help.sources.query'],
    ['options.sources.nekosiaCategory', 'help.sources.nekosiaCategory'],
    ['options.sources.danbooru', 'help.sources.danbooru'],
    ['options.sources.duo', 'help.sources.duo'],
    ['options.sources.favoriteChars', 'help.sources.favoriteChars'],
    ['options.listChars.label', 'help.sources.listChars'],
    ['options.listChars.birthdays', 'help.sources.birthday'],
    ['options.sources.exclude', 'help.sources.exclude'],
    ['options.sources.prefer', 'help.sources.prefer'],
  ],
  blend: [
    [null, 'help.blend.bake'],
    ['options.blend.variety', 'help.blend.variety'],
    ['options.blend.rim', 'help.blend.rim'],
  ],
  motion: [
    [null, 'help.motion.reduced'],
    ['options.motion.depth', 'help.motion.depth'],
  ],
  power: [
    ['options.power.powerSave', 'help.power.powerSave'],
    ['options.power.perf', 'help.power.perf'],
    ['options.power.idleOnly', 'help.power.idleOnly'],
    ['options.power.queueSize', 'help.power.queueSize'],
    ['options.power.cache', 'help.power.cache'],
  ],
  focus: [
    ['options.focus.block', 'help.focus.block'],
    ['options.focus.sites', 'help.focus.sites'],
  ],
  uploads: [
    [null, 'help.uploads.formats'],
    ['options.sources.uploadsWeight', 'help.uploads.weight'],
  ],
  favorites: [
    [null, 'help.favorites.how'],
    ['options.favorites.limit', 'help.favorites.limit'],
    ['help.favorites.rotationTerm', 'help.favorites.rotation'],
    [null, 'help.favorites.storage'],
    ['help.favorites.blacklist', 'help.favorites.blacklistText'],
  ],
  anilist: [[null, 'help.anilist.overview']],
  backup: [[null, 'help.backup.what']],
};

const NEWTAB_ITEMS: Item[] = [
  [null, 'help.newtab.dock'],
  ['common.search', 'help.newtab.search'],
  ['widgets.next.label', 'help.newtab.next'],
  ['newtab.dock.focus', 'help.newtab.focus'],
  ['newtab.dock.credit', 'help.newtab.credit'],
  [null, 'help.newtab.firstRun'],
];

function HelpSection({
  id,
  title,
  items,
  settings,
  children,
}: {
  id: string;
  title: string;
  items: Item[];
  /** Link back to the matching settings section. */
  settings?: boolean;
  children?: ComponentChildren;
}) {
  return (
    <section id={id} class="opt-section">
      <header>
        <h2>{title}</h2>
        {settings && (
          <a class="opt-help" href={`options.html#${id}`}>
            {t('help.backToSettings')}
          </a>
        )}
      </header>
      <div class="help-body">
        {items.map(([term, text]) =>
          term ? (
            <dl key={text} class="help-item">
              <dt>{t(term)}</dt>
              <dd>{t(text)}</dd>
            </dl>
          ) : (
            <p key={text}>{t(text)}</p>
          ),
        )}
        {children}
      </div>
    </section>
  );
}

export function Help() {
  const redirectUrl = `https://${chrome.runtime.id}.chromiumapp.org/`;
  return (
    <div class="opt">
      <header class="opt-hero">
        <p class="opt-kicker">TAB PRETTIER</p>
        <h1>{t('help.heading')}</h1>
        <p class="opt-status">
          {t('help.intro')}
          <a class="opt-link" href="options.html">
            {t('help.backToSettings')}
          </a>
        </p>
      </header>

      <nav class="opt-nav">
        <a href="#newtab">{t('help.newtab.title')}</a>
        {SECTION_IDS.map((id) => (
          <a key={id} href={`#${id}`}>
            {t(`options.nav.${id}`)}
          </a>
        ))}
      </nav>

      <HelpSection id="newtab" title={t('help.newtab.title')} items={NEWTAB_ITEMS} />
      {SECTION_IDS.map((id) => (
        <HelpSection key={id} id={id} title={t(`options.nav.${id}`)} items={ITEMS[id]} settings>
          {id === 'anilist' && (
            <>
              <ol class="opt-steps">
                <li>
                  {tRich('help.anilist.step1', {
                    link: (
                      <a href="https://anilist.co/settings/developer" target="_blank" rel="noreferrer">
                        anilist.co/settings/developer
                      </a>
                    ),
                  })}
                </li>
                <li>{tRich('help.anilist.step2', { url: <code>{redirectUrl}</code> })}</li>
                <li>{t('help.anilist.step3')}</li>
              </ol>
              <p>{t('help.anilist.watching')}</p>
            </>
          )}
        </HelpSection>
      ))}
    </div>
  );
}
