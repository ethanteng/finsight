'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { rememberLanding } from '../lib/landing-attribution';

/**
 * Remembers the page a visitor landed on, with its campaign tags, so a signup
 * several pages later is still attributed to it. See `landing-attribution`.
 *
 * Re-runs on client navigations: the root layout stays mounted across App
 * Router transitions, so a mount-only effect would miss a campaign URL reached
 * via an in-app Link after the first page. `rememberLanding` reads
 * `window.location.search` itself, so a pathname change is enough to pick up
 * new UTM tags on that navigation.
 */
export default function LandingAttributionRecorder() {
  const pathname = usePathname();
  useEffect(() => {
    rememberLanding();
  }, [pathname]);
  return null;
}
