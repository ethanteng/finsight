'use client';

import { useEffect, useRef } from 'react';
import { isInternalAnalyticsBrowser } from './internal-analytics';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/** Observe the final answer, never streaming text, loading skeletons, errors, or hidden tabs. */
export function useVisibleAnswerMeasurement(conversationId: string | null, ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ready || !conversationId || !ref.current || isInternalAnalyticsBrowser()
      || typeof IntersectionObserver === 'undefined') return;
    let token: string | null;
    try { token = localStorage.getItem('auth_token'); } catch { return; }
    if (!token) return;
    const controller = new AbortController();
    let visible = false;
    let done = false;
    let busy = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const record = async () => {
      if (!visible || busy || done || attempts >= 3 || controller.signal.aborted
        || document.visibilityState !== 'visible') return;
      busy = true;
      attempts++;
      try {
        const response = await fetch(`${API_URL}/api/product-milestones/answer-viewed`, {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId }),
        });
        if (response.ok) {
          done = true;
          window.dispatchEvent(new Event('asklinc:milestone-recorded'));
        }
      } catch { /* Best effort; no error UI for measurement. */ }
      finally {
        busy = false;
        if (!done && !controller.signal.aborted && attempts < 3) {
          retry = setTimeout(() => { void record(); }, 1500 * attempts);
        }
      }
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      void record();
    });
    observer.observe(ref.current);
    const onVisibility = () => { void record(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      observer.disconnect();
      clearTimeout(retry);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [conversationId, ready]);
  return ref;
}
