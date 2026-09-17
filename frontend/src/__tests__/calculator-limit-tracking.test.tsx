import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { useCalculatorLimitTracking } from '@/lib/use-calculator-limit-tracking';
import { pushCalculatorRunLimitReached, pushCalculatorResultsPageCtaOpened, pushCoastFireResultsEmailed } from '@/lib/dataLayer';

function Limit({ locked }: { locked: boolean }) {
  useCalculatorLimitTracking('retirement', locked);
  return null;
}

describe('calculator limit telemetry', () => {
  beforeEach(() => { window.dataLayer = []; });

  it('emits once per mount, including Strict Mode and a restored lock', () => {
    const view = render(<StrictMode><Limit locked={false} /></StrictMode>);
    expect(window.dataLayer).toEqual([]);
    view.rerender(<StrictMode><Limit locked /></StrictMode>);
    view.rerender(<StrictMode><Limit locked /></StrictMode>);
    expect(window.dataLayer).toHaveLength(1);
    view.unmount();
    render(<StrictMode><Limit locked /></StrictMode>);
    expect(window.dataLayer).toHaveLength(2);
  });

  it('sends fixed calculator identity, never a lead token or financial inputs', () => {
    window.history.replaceState({}, '', '/getstarted?source=coast-fire-calculator&entry=results_page');
    pushCalculatorResultsPageCtaOpened('coast_fire_calculator');
    pushCalculatorRunLimitReached('coast_fire');
    expect(window.dataLayer).toEqual([
      { event: 'calculator_results_page_cta_opened', source_page: '/getstarted',
        content_type: 'coast_fire_calculator', calculator_type: 'coast_fire',
        signup_origin: 'coast_fire_calculator', signup_entry: 'results_page' },
      { event: 'calculator_run_limit_reached', source_page: '/getstarted',
        content_type: 'coast_fire_calculator', calculator_type: 'coast_fire' },
    ]);
  });

  it('waits for GTM dispatch before navigation but has a bounded fallback', async () => {
    jest.useFakeTimers();
    try {
      const dispatched = jest.fn();
      const tracking = pushCoastFireResultsEmailed('reached').then(dispatched);
      expect(dispatched).not.toHaveBeenCalled();
      const event = window.dataLayer[0] as unknown as { eventCallback: () => void; eventTimeout: number };
      expect(event.eventTimeout).toBe(500);
      event.eventCallback();
      await tracking;
      expect(dispatched).toHaveBeenCalledTimes(1);
      const fallback = jest.fn();
      const blockedTracking = pushCoastFireResultsEmailed('reached').then(fallback);
      jest.advanceTimersByTime(499);
      expect(fallback).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      await blockedTracking;
      expect(fallback).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });
});
