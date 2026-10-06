import { GET_STARTED_HREF } from './site-nav';

/**
 * The cash-flow forecast page's signup tag. Its buttons carry the source the
 * same way the calculators' do, so a signup from it is attributed to it and
 * joins its MailerLite group; there is no run to hand over, so nothing else
 * travels with it.
 */
export const CASH_FLOW_SIGNUP_SOURCE = 'cash-flow-forecast';
export const CASH_FLOW_SIGNUP_HREF = `${GET_STARTED_HREF}?source=${CASH_FLOW_SIGNUP_SOURCE}`;

export function hasCashFlowSignupSource(searchParams: Pick<URLSearchParams, 'get'>): boolean {
  return searchParams.get('source') === CASH_FLOW_SIGNUP_SOURCE;
}
