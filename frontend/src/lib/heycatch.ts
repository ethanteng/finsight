import { analytics } from '@heycatch/sdk';
import { isHeyCatchEnabledPath } from './heycatch-paths';

type PostHogClient = {
  __loaded?: boolean;
  has_opted_out_capturing?: () => boolean;
  opt_in_capturing?: () => void;
  opt_out_capturing?: () => void;
};

function getPostHogClient(): PostHogClient | undefined {
  return (globalThis as typeof globalThis & { posthog?: PostHogClient }).posthog;
}

function isHeyCatchActive(): boolean {
  if (typeof globalThis.location === 'undefined') return false;
  return isHeyCatchEnabledPath(globalThis.location.pathname);
}

/** Pause or resume autocapture when navigating between allowed and excluded routes. */
export function setHeyCatchCapturing(enabled: boolean): void {
  const posthog = getPostHogClient();
  if (!posthog?.__loaded) return;

  if (enabled && posthog.has_opted_out_capturing?.()) {
    posthog.opt_in_capturing?.();
  } else if (!enabled && !posthog.has_opted_out_capturing?.()) {
    posthog.opt_out_capturing?.();
  }
}

type IdentifyableUser = {
  id: string;
  email?: string | null;
  tier?: string | null;
  createdAt?: string | Date | null;
};

/**
 * Link the anonymous visitor to the authenticated user after sign-in
 * or session restore. Uses the stable internal user id (never email).
 */
export function identifyUser(user: IdentifyableUser): void {
  if (!user?.id || !isHeyCatchActive()) return;

  const properties: { email?: string; plan?: string } = {};
  if (user.email) properties.email = user.email;
  if (user.tier) properties.plan = user.tier;

  const propertiesOnce: { signup_date?: string } = {};
  if (user.createdAt) {
    propertiesOnce.signup_date =
      typeof user.createdAt === 'string'
        ? user.createdAt
        : user.createdAt.toISOString();
  }

  analytics.setIdentity(
    user.id,
    properties,
    Object.keys(propertiesOnce).length > 0 ? propertiesOnce : undefined,
  );
}

/** Clear identity on sign-out so the next visitor starts anonymous. */
export function resetUserIdentity(): void {
  if (!isHeyCatchActive()) return;
  analytics.resetIdentity();
}
