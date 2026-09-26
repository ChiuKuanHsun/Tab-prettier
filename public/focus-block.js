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
      root.innerHTML = `<style>
        span {
          position: fixed; left: 16px; bottom: 16px; z-index: 2147483647;
          padding: 5px 12px; border-radius: 999px; pointer-events: none;
          font: 500 12px/1.4 system-ui, sans-serif; letter-spacing: 0.06em; font-variant-numeric: tabular-nums;
          color: #fff; background: rgb(20 18 24 / 0.7); backdrop-filter: blur(6px);
          box-shadow: 0 2px 10px rgb(0 0 0 / 0.25);
        }
      </style><span role="timer"></span>`;
      text = root.querySelector('span');
      document.documentElement.append(host);
    }
    const tick = () => {
      const left = focus.endAt - Date.now();
      if (left <= 0) return show(undefined);
      text.textContent = `${reply.label} ${fmt(left)}`;
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
