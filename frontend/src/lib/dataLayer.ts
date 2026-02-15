interface DataLayerWindow {
  dataLayer?: Record<string, unknown>[];
}

export function pushBeginCheckout(): void {
  if (typeof window === 'undefined') return;
  const win = window as unknown as DataLayerWindow;
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push({
    event: 'begin_checkout',
    source_page: window.location.pathname,
  });
}
