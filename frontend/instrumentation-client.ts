import { analytics } from '@heycatch/sdk';
import { HEYCATCH_INIT_CONFIG } from './src/lib/heycatch-config';
import { isHeyCatchEnabledPath } from './src/lib/heycatch-paths';

if (isHeyCatchEnabledPath(globalThis.location.pathname)) {
  analytics.init(HEYCATCH_INIT_CONFIG);
}
