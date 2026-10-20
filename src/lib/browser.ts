/**
 * The few places Firefox differs from Chrome. The same build runs in both; only the manifest
 * differs (tools/firefox.mjs), so pages tell them apart at run time.
 */
export const IS_FIREFOX = !!globalThis.chrome?.runtime?.getURL?.('').startsWith('moz-extension:');

/** Where AniList sends the user back after signing in (Chrome: *.chromiumapp.org, Firefox: *.extensions.allizom.org). */
export const redirectUrl = () => chrome.identity.getRedirectURL();
