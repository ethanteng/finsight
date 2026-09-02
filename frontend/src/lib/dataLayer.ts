/**
 * Analytics event tracking through the dataLayer and GTM.
 *
 * For Google Analytics via GTM: dataLayer pushes require GTM configuration.
 * In GTM, create Custom Event triggers for "view_examples" and "view_more_examples",
 * then add GA4 Event tags that fire on those triggers.
 */
interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown> | unknown[]>;
}

function pushToDataLayer(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const win = window as unknown as DataLayerWindow;
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push(payload);
}

function getContentType(pathname: string): string {
  if (pathname === '/retirement-answers') return 'retirement_answers_hub';
  if (/^\/can-i-retire-(at|with)-/.test(pathname)) return 'retirement_answer';
  return 'marketing_page';
}

export function pushBeginCheckout(ctaLocation = 'marketing_cta'): void {
  if (typeof window === 'undefined') return;

  const sourcePage = window.location.pathname;
  const contentType = getContentType(sourcePage);
  const payload = {
    event: 'begin_checkout',
    source_page: sourcePage,
    cta_location: ctaLocation,
    content_type: contentType,
  };
  pushToDataLayer(payload);
}

export function pushViewExamples(): void {
  const payload = {
    event: 'view_examples',
    source_page: window.location.pathname,
  };
  pushToDataLayer(payload);

  // GA4 via gtag (when loaded directly, e.g. NEXT_PUBLIC_GA_ID)
  if (typeof window !== 'undefined' && typeof (window as Window & { gtag?: unknown }).gtag === 'function') {
    (window as Window & { gtag: (c: 'event', e: string, p?: Record<string, unknown>) => void }).gtag('event', 'view_examples', { source_page: window.location.pathname });
  }
}

export function pushViewMoreExamples(): void {
  const payload = {
    event: 'view_more_examples',
    source_page: window.location.pathname,
  };
  pushToDataLayer(payload);

  // GA4 via gtag (when loaded directly)
  if (typeof window !== 'undefined' && typeof (window as Window & { gtag?: unknown }).gtag === 'function') {
    (window as Window & { gtag: (c: 'event', e: string, p?: Record<string, unknown>) => void }).gtag('event', 'view_more_examples', { source_page: window.location.pathname });
  }
}
