'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { dispatchMilestoneConversion, type AdMilestone } from '../lib/product-milestones';
import { isInternalAnalyticsBrowser } from '../lib/internal-analytics';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/** Retry pending dispatches on visits/focus; browser blocking remains a measurable delivery gap. */
export default function ProductMilestoneReporter() {
  const pathname = usePathname();
  useEffect(() => {
    if (isInternalAnalyticsBrowser()) return;
    let token: string | null;
    try { token = localStorage.getItem('auth_token'); } catch { return; }
    if (!token) return;
    const controller = new AbortController();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const attempted = new Set<string>();
    let busy = false;
    const poll = async () => {
      if (busy || controller.signal.aborted || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const response = await fetch(`${API_URL}/api/product-milestones/pending`, { headers, signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json();
        if (controller.signal.aborted || !Array.isArray(body.milestones)) return;
        for (const milestone of body.milestones as AdMilestone[]) {
          if (attempted.has(milestone.id)) continue;
          const dispatched = dispatchMilestoneConversion(milestone, () => {
            if (controller.signal.aborted) return;
            void fetch(`${API_URL}/api/product-milestones/dispatch-attempted`, {
              method: 'POST', headers, signal: controller.signal,
              body: JSON.stringify({ milestoneId: milestone.id }),
            }).catch(() => { /* Next visit safely replays the same transaction id. */ });
          });
          if (dispatched) attempted.add(milestone.id);
        }
      } catch { /* Analytics must never interrupt the workspace. */ }
      finally { busy = false; }
    };
    void poll();
    const interval = setInterval(() => { void poll(); }, 60_000);
    const onActivity = () => { void poll(); };
    window.addEventListener('focus', onActivity);
    window.addEventListener('online', onActivity);
    window.addEventListener('asklinc:milestone-recorded', onActivity);
    return () => {
      controller.abort();
      clearInterval(interval);
      window.removeEventListener('focus', onActivity);
      window.removeEventListener('online', onActivity);
      window.removeEventListener('asklinc:milestone-recorded', onActivity);
    };
  }, [pathname]);
  return null;
}
