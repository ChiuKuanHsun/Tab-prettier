// Registered by the service worker on the sites blocked while focusing (see src/lib/focus-block.ts).
// It only asks; the service worker checks the timer and sends the tab to the blocked page if needed.
chrome.runtime.sendMessage({ to: 'bg', type: 'focus-check' }).catch(() => {});
