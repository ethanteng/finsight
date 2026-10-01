import {
  MEASURED_QUERY_PARAMS,
  isAnalyticsHost,
  isMarketingPath,
} from './analytics-host';
import { isInternalAnalyticsBrowser } from './internal-analytics';

/**
 * clicks.page, held to the same rules as Vercel Web Analytics.
 *
 * The rules are the same, but they cannot be enforced the same way. Vercel
 * hands every event to a `beforeSend` that can drop it or rewrite its URL;
 * clicks.page's tracker has no such hook. It reads `location.href` whole —
 * query string included — every time it sends, and it patches
 * `history.pushState` so it follows client-side navigation from then on. Once
 * it is on a page, nothing can redact what it reports or remove it again.
 *
 * So the gate is on the document instead of the event. The tracker is only
 * ever loaded into a document whose URL it may report as-is, and that
 * document is never allowed to reach a URL that it may not: such a
 * navigation becomes a full page load, and the new document does not load
 * the tracker. See analytics-host.ts for what may be reported and why.
 */

export const CLICKS_SITE_ID = '5i4z4m2v232t';
export const CLICKS_SCRIPT_SRC = 'https://clicks.page/t.js';

const MEASURED = new Set<string>(MEASURED_QUERY_PARAMS);

function parse(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/**
 * Host, path and query: the parts of a URL the tracker may report as-is.
 *
 * Stricter than measuredUrl(), which can strip what it does not want: here an
 * unrecognised query parameter rules the whole URL out, because nothing will
 * strip it before it is sent.
 */
function isReportableAddress(url: URL): boolean {
  if (!isAnalyticsHost(url.hostname)) return false;
  if (!isMarketingPath(url.pathname)) return false;

  for (const key of url.searchParams.keys()) {
    if (!MEASURED.has(key)) return false;
  }
  return true;
}

/**
 * True when the tracker may be loaded into a document at this URL.
 *
 * No fragment at all, the same as redactAnalyticsUrl(). A fragment on the
 * URL a document loads at was written by whoever wrote the link —
 * `/register#email=…` is as easy to send as `/register?email=…` — and the
 * tracker would send it whole.
 */
export function canLoadClicksTracker(href: string): boolean {
  const url = parse(href);
  return url !== null && isReportableAddress(url) && url.hash === '';
}

/**
 * True when a document already carrying the tracker may move to this URL.
 *
 * Here the fragment is allowed. The document loaded without one, so the only
 * fragments it can reach come from this site's own in-page anchor links
 * (`#sources`, `#by-portfolio`), and refusing them would reload the page on
 * every table-of-contents click.
 */
export function canCarryClicksTracker(href: string): boolean {
  const url = parse(href);
  return url !== null && isReportableAddress(url);
}

type HistoryMethod = 'pushState' | 'replaceState';

/**
 * Keeps this document on URLs the tracker may report.
 *
 * Wraps pushState and replaceState so a move to any other URL — the signed-in
 * app, /login, a /register link carrying an email address — leaves the
 * document instead of rewriting its address. The tracker then never observes
 * the new URL: the history entry it would have reported is never created in
 * this document, and the full load that replaces it does not load the
 * tracker.
 *
 * Next's router calls `window.history.pushState` at the moment it navigates,
 * so wrapping the method catches every router.push and router.replace
 * regardless of whether Next patched it before or after this ran. A
 * back/forward traversal needs no guard: every entry in this document was
 * made through these methods, so every one is already a URL the tracker may
 * report.
 *
 * After the first hand-off, later calls do nothing. Rewriting history while
 * the browser is already loading the next document could only make the
 * session history disagree with where the visitor ends up.
 */
export function installClicksNavigationGuard(win: Pick<Window, 'history' | 'location'>): void {
  const { history, location } = win;
  let leaving = false;

  const guard = (method: HistoryMethod, leave: (url: string) => void) => {
    const original = history[method];
    history[method] = function (
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      if (leaving) return;
      if (url != null) {
        let target: string | null = null;
        try {
          target = new URL(String(url), location.href).href;
        } catch {
          // Unparseable: the native method will reject it the same way.
        }
        if (target !== null && !canCarryClicksTracker(target)) {
          leaving = true;
          leave(target);
          return;
        }
      }
      return original.call(this, data, unused, url);
    };
  };

  guard('pushState', url => location.assign(url));
  guard('replaceState', url => location.replace(url));
}

/**
 * Loads the tracker into this document, if this document may carry it.
 *
 * Decided once, from the URL the document was loaded at, and the guard goes
 * in before the script does so there is no moment when the tracker is
 * running unguarded. Returns whether it loaded, for tests.
 */
export function startClicksTracker(
  win: Pick<Window, 'history' | 'location'>,
  doc: Pick<Document, 'createElement' | 'head' | 'querySelector'>,
): boolean {
  if (!canLoadClicksTracker(win.location.href)) return false;
  // The same opt-out that keeps our own browsing out of every other tag.
  if (isInternalAnalyticsBrowser()) return false;
  // Once per document, even if the component mounts twice.
  if (doc.querySelector(`script[src="${CLICKS_SCRIPT_SRC}"]`)) return false;

  installClicksNavigationGuard(win);

  const script = doc.createElement('script');
  script.defer = true;
  script.src = CLICKS_SCRIPT_SRC;
  script.setAttribute('data-site', CLICKS_SITE_ID);
  doc.head.appendChild(script);
  return true;
}
