import { isInternalAnalyticsBrowser } from './internal-analytics';
import { isAnalyticsHost } from './analytics-host';

export type MilestoneKind = 'first_result_viewed' | 'first_meaningful_answer'
  | 'first_account_linked' | 'returned_engaged_7d';

export interface AdMilestone {
  id: string;
  kind: MilestoneKind;
  definitionVersion: number;
}

// Public destinations for the four Secondary/One conversion actions created on 2026-10-06.
// Overrides allow a future tag migration; an explicitly empty override disables delivery.
export const MILESTONE_AD_DESTINATIONS: Partial<Record<MilestoneKind, string>> = {
  first_result_viewed: process.env.NEXT_PUBLIC_ADS_FIRST_RESULT_VIEWED ?? 'AW-17866479691/gd1kCPm8t5MdEMuws8dC',
  first_meaningful_answer: process.env.NEXT_PUBLIC_ADS_FIRST_MEANINGFUL_ANSWER ?? 'AW-17866479691/YFILCPy8t5MdEMuws8dC',
  first_account_linked: process.env.NEXT_PUBLIC_ADS_FIRST_ACCOUNT_LINKED ?? 'AW-17866479691/rJnvCP-8t5MdEMuws8dC',
  returned_engaged_7d: process.env.NEXT_PUBLIC_ADS_RETURNED_ENGAGED_7D ?? 'AW-17866479691/6Y2hCIK9t5MdEMuws8dC',
};

/** Dispatch is not proof of Google acceptance. The stable transaction id deduplicates retries. */
export function dispatchMilestoneConversion(milestone: AdMilestone, callback: () => void): boolean {
  if (typeof window === 'undefined' || isInternalAnalyticsBrowser()
    || !isAnalyticsHost(window.location.hostname)) return false;
  const destination = MILESTONE_AD_DESTINATIONS[milestone.kind];
  if (!destination || !/^AW-\d+\/[A-Za-z0-9_-]+$/.test(destination)
    || !/^[A-Za-z0-9_-]{1,64}$/.test(milestone.id) || milestone.definitionVersion !== 1) return false;
  // Use the existing Google tag and consent state. Never override consent or load another tag.
  const dataLayer = (window as unknown as { dataLayer?: unknown[] });
  dataLayer.dataLayer = dataLayer.dataLayer || [];
  // Google's command queue distinguishes its arguments object from ordinary dataLayer arrays.
  // eslint-disable-next-line prefer-rest-params
  function gtag(..._args: unknown[]) { dataLayer.dataLayer!.push(arguments); }
  gtag('event', 'conversion', {
    send_to: destination,
    transaction_id: milestone.id,
    // Product URLs may carry conversation or handoff identifiers. Never forward those.
    page_location: `${window.location.origin}${window.location.pathname}`,
    page_referrer: '',
    event_callback: callback,
  });
  return true;
}
