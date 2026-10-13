/**
 * An operator's browser leaves itself out of analytics.
 *
 * The browser is marked once it proves to be an operator's: signing in to an
 * account in ADMIN_EMAILS (`/auth/login` and `/auth/verify` say `operator`),
 * or loading an admin API. From then on GTM, Contentsquare, Vercel Analytics
 * and every dataLayer push stay off in it, from the next page load for the
 * tags already running. Each browser and device is marked separately, and a
 * private window or cleared site data loses the mark.
 */
export const INTERNAL_ANALYTICS_BROWSER_KEY = 'asklinc_internal_analytics_browser';

/**
 * The operator chose, on /admin, to count this browser again (to check tags
 * from it, say). Marking on sign-in respects that until they switch it back.
 */
export const COUNTED_OPERATOR_BROWSER_KEY = 'asklinc_count_operator_browser';

export function isInternalAnalyticsBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(INTERNAL_ANALYTICS_BROWSER_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * One last event before analytics goes quiet, so reports can also leave out
 * what this browser sent before it was marked: the Visitors tab drops every
 * browser that sent it. Pushed directly rather than through `dataLayer.ts`,
 * which asks this module whether to push at all.
 */
function announceOperatorBrowser(): void {
  const win = window as unknown as { dataLayer?: unknown[] };
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push({ event: 'internal_browser_marked' });
}

/** Returns true when the browser was not marked before. */
export function markInternalAnalyticsBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (isInternalAnalyticsBrowser()) return false;
    if (window.localStorage.getItem(COUNTED_OPERATOR_BROWSER_KEY) === '1') return false;
    announceOperatorBrowser();
    window.localStorage.setItem(INTERNAL_ANALYTICS_BROWSER_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * The switch on /admin. Counting again takes effect from the next page load;
 * GA4 already knows the browser as an operator's, so the Visitors tab keeps
 * leaving it out either way.
 */
export function setOperatorBrowserCounted(counted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (counted) {
      window.localStorage.setItem(COUNTED_OPERATOR_BROWSER_KEY, '1');
      window.localStorage.removeItem(INTERNAL_ANALYTICS_BROWSER_KEY);
    } else {
      window.localStorage.removeItem(COUNTED_OPERATOR_BROWSER_KEY);
      markInternalAnalyticsBrowser();
    }
  } catch {
    // Storage blocked: nothing to switch.
  }
}
