/**
 * The few places Firefox and Edge differ from Chrome. The same build runs in all three; only
 * Firefox's manifest differs (tools/firefox.mjs), so pages tell them apart at run time.
 */
export const IS_FIREFOX = !!globalThis.chrome?.runtime?.getURL?.('').startsWith('moz-extension:');
/** Edge runs the Chrome build as is; only a few notes differ. */
export const IS_EDGE = /\bEdg\//.test(globalThis.navigator?.userAgent ?? '');

/** Where AniList sends the user back after signing in (Chrome: *.chromiumapp.org, Firefox: *.extensions.allizom.org). */
export const redirectUrl = () => chrome.identity.getRedirectURL();
