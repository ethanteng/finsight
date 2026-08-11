'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { analytics } from '@heycatch/sdk';
import { HEYCATCH_INIT_CONFIG } from '@/lib/heycatch-config';
import { isHeyCatchEnabledPath } from '@/lib/heycatch-paths';
import { setHeyCatchCapturing } from '@/lib/heycatch';

/** Keeps HeyCatch off excluded routes during client-side navigations. */
export default function HeyCatchRouteGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const enabled = isHeyCatchEnabledPath(pathname);

    if (enabled) {
      analytics.init(HEYCATCH_INIT_CONFIG);
      setHeyCatchCapturing(true);
    } else {
      setHeyCatchCapturing(false);
    }
  }, [pathname]);

  return null;
}
