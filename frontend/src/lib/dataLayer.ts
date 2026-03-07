/**
 * Analytics event tracking (dataLayer, Plausible, gtag).
 *
 * For Google Analytics via GTM: dataLayer pushes require GTM configuration.
 * In GTM, create Custom Event triggers for "view_examples" and "view_more_examples",
 * then add GA4 Event tags that fire on those triggers.
 *
 * For Plausible: add "view_examples" and "view_more_examples" as custom event goals
 * in your Plausible dashboard (Goals > Add goal > Custom event).
 */
interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown> | unknown[]>;
}

declare global {
  interface Window {
    plausible?: (eventName: string, options?: { props?: Record<string, string> }) => void;
    gtag?: (command: 'event', eventName: string, params?: Record<string, unknown>) => void;
  }
}

function pushToDataLayer(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const win = window as unknown as DataLayerWindow;
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push(payload);
}

export function pushBeginCheckout(): void {
  pushToDataLayer({
    event: 'begin_checkout',
    source_page: window.location.pathname,
  });
}

export function pushViewExamples(): void {
  const payload = {
    event: 'view_examples',
    source_page: window.location.pathname,
  };
  pushToDataLayer(payload);

  // Plausible: call plausible() - add "view_examples" as a goal in Plausible dashboard
  if (typeof window !== 'undefined' && typeof window.plausible === 'function') {
    window.plausible('view_examples', { props: { page: window.location.pathname } });
  }

  // GA4 via gtag (when loaded directly, e.g. NEXT_PUBLIC_GA_ID)
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', 'view_examples', { source_page: window.location.pathname });
  }
}

export function pushViewMoreExamples(): void {
  const payload = {
    event: 'view_more_examples',
    source_page: window.location.pathname,
  };
  pushToDataLayer(payload);

  // Plausible: add "view_more_examples" as a goal in Plausible dashboard
  if (typeof window !== 'undefined' && typeof window.plausible === 'function') {
    window.plausible('view_more_examples', { props: { page: window.location.pathname } });
  }

  // GA4 via gtag (when loaded directly)
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', 'view_more_examples', { source_page: window.location.pathname });
  }
}
