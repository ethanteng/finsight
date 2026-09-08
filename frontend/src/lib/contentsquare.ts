import { isAnalyticsHost } from './analytics-host';

/** Fixed names only: never send form values, answers, or error messages. */
export type ContentsquareEvent =
  | 'start_free_click'
  | 'sign_up'
  | 'sign_up_free_trial'
  | 'answer_received'
  | 'retirement_calculator_started'
  | 'retirement_calculator_field_edited'
  | 'retirement_model_clicked'
  | 'retirement_model_requested'
  | 'retirement_model_run'
  | 'retirement_validation_error'
  | 'retirement_api_error'
  | 'retirement_request_error';

/** Custom page events do not create artificial pageviews or alter bounce rates. */
export function trackContentsquareEvent(event: ContentsquareEvent): void {
  if (typeof window === 'undefined' || !isAnalyticsHost(window.location.hostname)) return;
  try {
    const win = window as unknown as { _uxa?: { push: (command: unknown[]) => unknown } };
    const queue = win._uxa || ([] as unknown[][]);
    win._uxa = queue;
    queue.push(['trackPageEvent', event]);
  } catch {
    // Analytics must never prevent a calculation, registration, or navigation.
  }
}
