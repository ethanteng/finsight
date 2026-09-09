/**
 * Set only after this browser successfully loads the authenticated marketing
 * admin API. GTM and Contentsquare then stay disabled for that browser.
 */
export const INTERNAL_ANALYTICS_BROWSER_KEY = 'asklinc_internal_analytics_browser';

export function isInternalAnalyticsBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(INTERNAL_ANALYTICS_BROWSER_KEY) === '1';
  } catch {
    return false;
  }
}

export function markInternalAnalyticsBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const wasMarked = isInternalAnalyticsBrowser();
    window.localStorage.setItem(INTERNAL_ANALYTICS_BROWSER_KEY, '1');
    return !wasMarked;
  } catch {
    return false;
  }
}
