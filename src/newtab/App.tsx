import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { locale, t as msg } from '../i18n'; // `t` is the layout's text box below
import { computeLayout } from '../lib/compose';
import { saveSettings } from '../lib/settings';
import type { SceneTheme } from '../lib/types';
import { AnimePanel } from '../widgets/Anime';
import { hexToRgb, luminance } from '../lib/color';
import { shownVariant } from '../lib/curation';
import { BirthdayBadge, birthdayToday, CakeIcon, CreditPanel } from '../widgets/Credit';
import { Dock, type DockItem } from '../widgets/Dock';
import { FavoriteButton, FavoriteRotationToggle } from '../widgets/Favorite';
import { NextSceneButton } from '../widgets/NextScene';
import { FocusPanel, useFocus } from '../widgets/Focus';
import { useWeather, WeatherBadge } from '../widgets/Weather';
import { weatherFog, weatherParticle } from '../lib/weather';
import { countdownActive, formatRemaining, PHASE_LABEL, remainingMs } from '../lib/focus';
import { LinksPanel, LinkStrip } from '../widgets/Links';
import { Search } from '../widgets/Search';
import { NotesPanel, TodoPanel } from '../widgets/Todo';
import { CLOCK_SCALE } from '../themes';
import { Clock, Dateline, VerticalDate } from './Clock';
import { useMedia, useNow, usePageVisible, usePowerSave, useScene, useSettings, useViewport } from './hooks';
import { autoParticle, Background, Character, Particles } from './layers';
import { playEnter, startParallax } from './motion';

const FALLBACK_THEME: SceneTheme = {
  accent: '#c9a27a',
  ink: '#f4efe7',
  inkSoft: 'rgba(244, 239, 231, 0.7)',
  surface: 'rgba(22, 20, 24, 0.8)',
  glow: 'rgba(201, 162, 122, 0.5)',
  haze: 'rgba(60, 50, 70, 0.35)',
  scrim: false,
};

async function decoded(urls: (string | undefined)[]) {
  await Promise.all(
    urls.filter(Boolean).map(async (src) => {
      const img = new Image();
      img.src = src!;
      await img.decode().catch(() => {});
    }),
  );
}

export function App() {
  const settings = useSettings();
  const lowPower = usePowerSave(settings?.powerSave);
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const visible = usePageVisible();
  const vp = useViewport();
  const focus = useFocus();
  const weatherState = useWeather(settings?.weatherMode, settings?.weatherLocation);
  const weather = weatherState?.w;
  const focusActive = focus.status === 'running';
  const now = useNow(focusActive || settings?.clockSeconds ? 1000 : 60_000);
  const { scene, urls, next } = useScene(settings, lowPower);
  const stage = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);

  const animate = !!settings && !reducedMotion;

  // Starts once the real stage is mounted: while the scene loads, a bare placeholder <main> is
  // rendered without the ref, so keying on `ready` makes this run again when the stage appears.
  useEffect(() => {
    if (!ready || !stage.current || !animate || !settings?.parallax) return;
    return startParallax(stage.current);
  }, [ready, animate, settings?.parallax]);

  // Reveal only once the layers are decoded, then run the entrance.
  useLayoutEffect(() => {
    if (scene === undefined) return;
    let alive = true;
    setReady(false);
    const isVideo = scene?.bg.kind === 'video';
    void decoded([isVideo ? undefined : urls?.bg, urls?.char]).then(() => {
      if (!alive) return;
      setReady(true);
      if (stage.current && animate && settings?.enterAnimation) playEnter(stage.current);
    });
    return () => {
      alive = false;
    };
    // run per scene
  }, [urls, scene === undefined]);

  if (!settings || scene === undefined) return <main class="stage" />;

  const theme = scene?.theme ?? FALLBACK_THEME;
  const side = scene?.layout.charSide ?? 'right';
  const layout = computeLayout(vp, side, scene?.char, shownVariant(scene?.layout.variant, settings));
  const t = layout.text;
  const colLeft = Math.min(t.inner, t.outer);
  const colW = Math.abs(t.inner - t.outer);
  // The clock reaches behind the character; when the small seconds / AM-PM sit at the end facing
  // it (text on the left), the clock steps outward so they stay clear, allowing for the parallax
  // drift between the text and character layers (12px per unit). The character doesn't move.
  const tail = (settings.clockSeconds || !settings.clock24h) && !countdownActive(focus);
  const reach = layout.char && t.side === 'left' ? t.inner - layout.char.left : 0;
  const clockShift = tail && reach > 0 ? reach + 12 * (animate ? settings.parallax : 0) + 8 : 0;
  // HH:MM is ~2.35em wide; small seconds add ~0.45em
  const clockSize = (CLOCK_SCALE[settings.theme] ?? 1) * Math.max(96, Math.min((colW - clockShift) / (settings.clockSeconds && !countdownActive(focus) ? 2.8 : 2.35), vp.h * (t.side === 'center' ? 0.34 : 0.3), t.side === 'center' ? 440 : 380));

  const particleKind = settings.particles === 'auto' ? (weatherParticle(weather?.mood) ?? autoParticle()) : settings.particles;
  const showParticles = particleKind !== 'off' && !lowPower && !reducedMotion;
  // haze in the distance when the effects follow the weather
  const depthFog = settings.particles === 'auto' ? weatherFog(weather?.mood, scene?.bucket) : undefined;

  const style = {
    '--accent': theme.accent,
    '--ink': theme.ink,
    '--ink-soft': theme.inkSoft,
    '--surface': theme.surface,
    '--glow': theme.glow,
    '--haze': theme.haze,
    '--ink-low': theme.low?.ink ?? theme.ink,
    '--ink-soft-low': theme.low?.inkSoft ?? theme.inkSoft,
    '--surface-low': theme.low?.surface ?? theme.surface,
    '--accent-low': theme.low?.accent ?? theme.accent,
    '--bg-blur': `${settings.bgBlur}px`,
    '--bg-dim': settings.bgDim,
    '--pk': animate ? settings.parallax : 0,
    '--col-left': `${colLeft}px`,
    '--col-w': `${colW}px`,
    '--col-top': `${t.top}px`,
    '--clock-size': `${clockSize}px`,
    '--clock-shift': `${clockShift}px`,
    '--outer': `${Math.max(32, vp.w * 0.05)}px`,
  };

  const focusLeft = remainingMs(focus, now.getTime());
  const countdown = focusLeft !== undefined ? formatRemaining(focusLeft) : undefined;
  const hhmm = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: !settings.clock24h });
  const focusStatus =
    focus.status === 'running'
      ? msg('newtab.focusRunning', { phase: PHASE_LABEL[focus.phase], end: hhmm(new Date(focus.endAt)), now: hhmm(now) })
      : focus.status === 'paused'
        ? msg('newtab.focusPaused', { phase: PHASE_LABEL[focus.phase], now: hhmm(now) })
        : undefined;
  const focusProgress =
    focusLeft !== undefined && (focus.status === 'running' || focus.status === 'paused') ? 1 - focusLeft / focus.durationMs : undefined;

  const birthday = birthdayToday(scene, settings.sources.listBirthdays);

  const dockItems: DockItem[] = [
    { id: 'links', label: msg('newtab.dock.links'), render: () => <LinksPanel /> },
    { id: 'todo', label: msg('newtab.dock.todo'), render: () => <TodoPanel /> },
    { id: 'notes', label: msg('newtab.dock.notes'), render: () => <NotesPanel /> },
    { id: 'focus', label: msg('newtab.dock.focus'), render: () => <FocusPanel state={focus} now={now} /> },
    {
      id: 'anime',
      label: msg('newtab.dock.anime'),
      render: () => (
        <AnimePanel
          clientId={settings.anilistClientId}
          src={settings.sources}
          onSources={(patch) => void saveSettings({ ...settings, sources: { ...settings.sources, ...patch } })}
        />
      ),
    },
    ...(scene
      ? [
          {
            id: 'credit',
            label: msg('newtab.dock.credit'),
            render: () => <CreditPanel scene={scene} birthday={birthday} onNext={next} />,
            badge: birthday && { icon: <CakeIcon size={14} />, label: msg('widgets.credit.birthdayBadge') },
          },
        ]
      : []),
  ];

  const classes = [
    'stage',
    ready && 'is-ready',
    `text-${t.side}`,
    settings.breathing && animate && !lowPower && 'is-breathing',
    !scene && 'is-empty',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <main ref={stage} class={classes} data-theme={settings.theme} style={style}>
      {scene && urls ? (
        <Background
          scene={scene}
          url={urls.bg}
          depthUrl={urls.depth}
          depthStrength={animate && !lowPower ? settings.depthMotion : 0}
          fog={depthFog}
          playing={visible && !lowPower}
        />
      ) : (
        <div class="layer layer-bg bg-placeholder" />
      )}
      {/* most particles fall behind the clock and the character; a few blurred ones pass in front */}
      {showParticles && <Particles kind={particleKind} accent={theme.accent} running={visible} plane="far" />}

      <div class="layer layer-text" aria-hidden="true">
        <div class="col col-clock" data-enter="rise">
          <Clock now={now} h24={settings.clock24h} seconds={settings.clockSeconds} size={clockSize} countdown={countdown} />
        </div>
      </div>

      {scene?.char && urls?.char && layout.char && <Character scene={scene} url={urls.char} box={layout.char} />}

      <div class="layer layer-fog" />
      {showParticles && <Particles kind={particleKind} accent={theme.accent} running={visible} plane="near" />}

      <div class="layer layer-ui">
        <div class="vdate-wrap" data-enter="fade">
          <VerticalDate now={now} />
        </div>
        <div class="col col-ui" style={{ top: `${t.top + clockSize * 0.92}px` }}>
          <div data-enter="rise">
            <Dateline
              now={now}
              status={focusStatus}
              progress={focusProgress}
              extra={
                <>
                  {weatherState && <WeatherBadge w={weatherState.w} place={weatherState.place} />}
                  {birthday && <BirthdayBadge name={birthday.name} />}
                </>
              }
            />
          </div>
          <div data-enter="rise">
            <Search
              engine={settings.searchEngine}
              suggest={settings.searchSuggest}
              onEngine={(e) => void saveSettings({ ...settings, searchEngine: e })}
              onSuggestOff={() => void saveSettings({ ...settings, searchSuggest: false })}
            />
          </div>
          {settings.pinLinks && (
            <LinkStrip
              perRow={settings.linksPerRow}
              tint={settings.linkIconsTint ? { accent: theme.accent, light: luminance(hexToRgb(theme.ink)) > 0.4 } : undefined}
            />
          )}
          {!scene && <p class="preparing">{msg('newtab.preparing')}</p>}
        </div>
        <Dock
          items={dockItems}
          side={t.side === 'right' ? 'right' : 'left'}
          settingsUrl={chrome.runtime.getURL('options.html')}
          extra={
            scene && (
              <>
                <NextSceneButton onNext={next} />
                <FavoriteButton scene={scene} limit={settings.favoritesLimit} />
                <FavoriteRotationToggle
                  on={settings.favoritesOnly}
                  onChange={(on) => {
                    void saveSettings({ ...settings, favoritesOnly: on });
                    // show a favourite right away rather than at the next rotation
                    if (on) void next({ favoritesOnly: true });
                  }}
                />
              </>
            )
          }
        />
      </div>
    </main>
  );
}
