import { isAnalyticsHost } from './analytics-host';
import { isInternalAnalyticsBrowser } from './internal-analytics';

/** Fixed names only: never send form values, answers, or error messages. */
export type ContentsquareEvent =
  | 'start_free_click'
  | 'sign_up'
  | 'sign_up_free_trial'
  | 'trial_signup_viewed'
  | 'trial_signup_started'
  | 'trial_signup_submit'
  | 'trial_signup_validation_error'
  | 'trial_signup_registration_error'
  | 'trial_verify_viewed'
  | 'trial_verify_submit'
  | 'trial_verify_error'
  | 'trial_verify_success'
  | 'trial_login_viewed'
  | 'trial_login_submit'
  | 'trial_login_error'
  | 'trial_login_success'
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
  if (
    typeof window === 'undefined'
    || !isAnalyticsHost(window.location.hostname)
    || isInternalAnalyticsBrowser()
  ) return;
  try {
    const win = window as unknown as { _uxa?: { push: (command: unknown[]) => unknown } };
    const queue = win._uxa || ([] as unknown[][]);
    win._uxa = queue;
    queue.push(['trackPageEvent', event]);
  } catch {
    // Analytics must never prevent a calculation, registration, or navigation.
  }
}
