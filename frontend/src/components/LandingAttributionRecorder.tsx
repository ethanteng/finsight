'use client';

import { useEffect } from 'react';
import { rememberLanding } from '../lib/landing-attribution';

/**
 * Remembers the page a visitor landed on, with its campaign tags, so a signup
 * several pages later is still attributed to it. See `landing-attribution`.
 */
export default function LandingAttributionRecorder() {
  useEffect(() => {
    rememberLanding();
  }, []);
  return null;
}
