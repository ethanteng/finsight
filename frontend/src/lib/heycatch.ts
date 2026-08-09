import { analytics } from '@heycatch/sdk';

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
  if (!user?.id) return;

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
  analytics.resetIdentity();
}
