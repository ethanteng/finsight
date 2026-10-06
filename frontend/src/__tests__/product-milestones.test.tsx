import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { useVisibleAnswerMeasurement } from '@/lib/use-visible-answer-measurement';
import { dispatchMilestoneConversion, MILESTONE_AD_DESTINATIONS } from '@/lib/product-milestones';
import { isAnalyticsHost } from '@/lib/analytics-host';
import { isInternalAnalyticsBrowser } from '@/lib/internal-analytics';

jest.mock('@/lib/internal-analytics', () => ({ isInternalAnalyticsBrowser: jest.fn(() => false) }));
jest.mock('@/lib/analytics-host', () => ({ isAnalyticsHost: jest.fn(() => true) }));
let notify: IntersectionObserverCallback;
const disconnect = jest.fn();
function Answer({ ready = true, id = 'conversation1' }) {
  const ref = useVisibleAnswerMeasurement(id, ready);
  return <div ref={ref}>Private financial answer</div>;
}
beforeEach(() => {
  jest.clearAllMocks();
  (isInternalAnalyticsBrowser as jest.Mock).mockReturnValue(false);
  (isAnalyticsHost as jest.Mock).mockReturnValue(true);
  localStorage.setItem('auth_token', 'local-test-token');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  global.IntersectionObserver = jest.fn((callback) => {
    notify = callback;
    return { observe: jest.fn(), disconnect, unobserve: jest.fn(), takeRecords: jest.fn() };
  }) as unknown as typeof IntersectionObserver;
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});
it('waits for the completed answer to enter a visible viewport and cleans up', async () => {
  const view = render(<Answer ready={false} />);
  expect(global.IntersectionObserver).not.toHaveBeenCalled();
  view.rerender(<Answer />);
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => notify([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => notify([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const options = (fetch as jest.Mock).mock.calls[0][1];
  expect(JSON.parse(options.body)).toEqual({ conversationId: 'conversation1' });
  await act(async () => notify([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  expect(fetch).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(options.signal.aborted).toBe(true);
  expect(disconnect).toHaveBeenCalled();
});
it('does not measure a hidden tab, missing auth, or an internal browser', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  const view = render(<Answer />);
  await act(async () => notify([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  expect(fetch).not.toHaveBeenCalled();
  view.unmount();
  (global.IntersectionObserver as jest.Mock).mockClear();
  localStorage.removeItem('auth_token');
  const anonymous = render(<Answer />);
  expect(global.IntersectionObserver).not.toHaveBeenCalled();
  anonymous.unmount();
  localStorage.setItem('auth_token', 'local-test-token');
  (isInternalAnalyticsBrowser as jest.Mock).mockReturnValue(true);
  render(<Answer />);
  expect(global.IntersectionObserver).not.toHaveBeenCalled();
});
it('sends only the configured event, a stable deduplication id, and redacted page context', () => {
  MILESTONE_AD_DESTINATIONS.first_result_viewed = 'AW-123/example_label';
  const dataLayer: unknown[] = [];
  Object.assign(window, { dataLayer });
  window.history.replaceState({}, '', '/app?conversation=private&ref=secret');
  const callback = jest.fn();
  const event = { id: 'milestone1', kind: 'first_result_viewed' as const, definitionVersion: 1 };
  expect(dispatchMilestoneConversion(event, callback)).toBe(true);
  expect(Array.from(dataLayer[0] as ArrayLike<unknown>)).toEqual(['event', 'conversion', {
    send_to: 'AW-123/example_label', transaction_id: 'milestone1', event_callback: callback,
    page_location: `${window.location.origin}/app`, page_referrer: '',
  }]);
  expect(callback).not.toHaveBeenCalled();
  expect(dispatchMilestoneConversion({ ...event, definitionVersion: 2 }, callback)).toBe(false);
  (isAnalyticsHost as jest.Mock).mockReturnValue(false);
  expect(dispatchMilestoneConversion(event, callback)).toBe(false);
  expect(dataLayer).toHaveLength(1);
  window.history.replaceState({}, '', '/');
});
