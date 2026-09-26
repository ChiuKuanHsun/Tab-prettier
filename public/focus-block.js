// Registered by the service worker on the listed distracting sites (see src/lib/focus-block.ts).
// It asks the service worker, which sends the tab to the blocked page if needed. While a focus
// round runs it shows a small timer in a corner: no clicks, hidden in fullscreen, gone after.
(async () => {
  const reply = await chrome.runtime.sendMessage({ to: 'bg', type: 'focus-check' }).catch(() => undefined);
  if (!reply?.remind) return;

  const running = (f) => !!f && f.status === 'running' && f.phase === 'work' && f.endAt > Date.now();
  const fmt = (ms) => {
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  let host, text, timer;
  function show(focus) {
    clearInterval(timer);
    if (!running(focus)) {
      host?.remove();
      host = undefined;
      return;
    }
    if (!host) {
      host = document.createElement('div');
      const root = host.attachShadow({ mode: 'closed' });
      // accent: the new tab's current scene colour; mixed towards white where it's text, so a
      // dark accent still reads on the dark pill
      root.innerHTML = `<style>
        .pill {
          --accent: ${/^#[0-9a-f]{3,8}$/i.test(reply.accent ?? '') ? reply.accent : '#c9a7ff'};
          position: fixed; left: 20px; bottom: 20px; z-index: 2147483647;
          display: flex; align-items: center; gap: 10px;
          padding: 10px 18px 10px 14px; border-radius: 999px; pointer-events: none;
          font-family: system-ui, sans-serif; font-variant-numeric: tabular-nums;
          background: rgb(18 16 22 / 0.78); backdrop-filter: blur(8px);
          border: 1px solid color-mix(in oklab, var(--accent) 55%, transparent);
          box-shadow: 0 6px 22px rgb(0 0 0 / 0.3), 0 0 0 4px color-mix(in oklab, var(--accent) 16%, transparent);
        }
        .dot {
          width: 9px; height: 9px; border-radius: 50%;
          background: var(--accent); box-shadow: 0 0 10px var(--accent);
          animation: pulse 2.4s ease-in-out infinite;
        }
        .label {
          font-size: 13px; font-weight: 600; letter-spacing: 0.14em;
          color: color-mix(in oklab, var(--accent) 60%, white);
        }
        .time { font-size: 22px; font-weight: 600; line-height: 1; color: #fff; }
        @keyframes pulse { 50% { opacity: 0.35; } }
        @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
      </style><div class="pill" role="timer"><span class="dot"></span><span class="label"></span><span class="time"></span></div>`;
      root.querySelector('.label').textContent = reply.label;
      text = root.querySelector('.time');
      document.documentElement.append(host);
    }
    const tick = () => {
      const left = focus.endAt - Date.now();
      if (left <= 0) return show(undefined);
      text.textContent = fmt(left);
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  const { focus } = await chrome.storage.local.get('focus');
  show(focus);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.focus) show(changes.focus.newValue);
  });
})();
