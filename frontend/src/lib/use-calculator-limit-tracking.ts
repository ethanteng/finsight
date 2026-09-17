'use client';

import { useEffect, useRef } from 'react';
import { pushCalculatorRunLimitReached } from './dataLayer';

/** Once per page mount, including a lock restored from tab storage. Not a GA4 session counter. */
export function useCalculatorLimitTracking(calculator: 'retirement' | 'coast_fire', locked: boolean) {
  const reported = useRef(false);
  useEffect(() => {
    if (!locked || reported.current) return;
    reported.current = true;
    pushCalculatorRunLimitReached(calculator);
  }, [calculator, locked]);
}
