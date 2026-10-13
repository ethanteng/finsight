import {
  COUNTED_OPERATOR_BROWSER_KEY,
  INTERNAL_ANALYTICS_BROWSER_KEY,
  isInternalAnalyticsBrowser,
  markInternalAnalyticsBrowser,
  setOperatorBrowserCounted,
} from '@/lib/internal-analytics';

type AnalyticsWindow = Window & typeof globalThis & { dataLayer?: unknown[] };

describe('operator browser', () => {
  const analyticsWindow = window as AnalyticsWindow;

  beforeEach(() => {
    window.localStorage.clear();
    analyticsWindow.dataLayer = [];
  });

  it('tells GA4 whose browser this was once, then goes quiet', () => {
    expect(markInternalAnalyticsBrowser()).toBe(true);
    expect(isInternalAnalyticsBrowser()).toBe(true);
    expect(analyticsWindow.dataLayer).toEqual([{ event: 'internal_browser_marked' }]);

    // Every later sign-in finds it marked and says nothing more.
    expect(markInternalAnalyticsBrowser()).toBe(false);
    expect(analyticsWindow.dataLayer).toHaveLength(1);
  });

  it('stays counted after the operator chose to count it, until they switch back', () => {
    window.localStorage.setItem(INTERNAL_ANALYTICS_BROWSER_KEY, '1');
    setOperatorBrowserCounted(true);
    expect(isInternalAnalyticsBrowser()).toBe(false);
    expect(window.localStorage.getItem(COUNTED_OPERATOR_BROWSER_KEY)).toBe('1');

    expect(markInternalAnalyticsBrowser()).toBe(false);
    expect(isInternalAnalyticsBrowser()).toBe(false);
    expect(analyticsWindow.dataLayer).toEqual([]);

    setOperatorBrowserCounted(false);
    expect(isInternalAnalyticsBrowser()).toBe(true);
    expect(window.localStorage.getItem(COUNTED_OPERATOR_BROWSER_KEY)).toBeNull();
    expect(analyticsWindow.dataLayer).toEqual([{ event: 'internal_browser_marked' }]);
  });

  it('does nothing when storage is blocked', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      expect(markInternalAnalyticsBrowser()).toBe(false);
      expect(isInternalAnalyticsBrowser()).toBe(false);
      expect(analyticsWindow.dataLayer).toEqual([]);
    } finally {
      getItem.mockRestore();
    }
  });
});
