/**
 * Adding one marketing lead to a MailerLite group.
 *
 * Separate from `mailerlite-sync`, which walks the user table on a schedule
 * and needs a database. This is the single-address path used when someone
 * hands us their email on a public page, so it has no Prisma dependency and
 * no constructor that throws when the integration is unconfigured: a missing
 * key means we skip the list, not that the page fails.
 *
 * MailerLite's POST /subscribers upserts. An address already on the list keeps
 * its history and simply gains the group, which is what "add them to the Coast
 * FIRE group" has to mean for a returning visitor.
 */

const MAILERLITE_API = 'https://connect.mailerlite.com/api';

/** Cap on how long we will wait for MailerLite while a visitor waits for us. */
const REQUEST_TIMEOUT_MS = 8_000;

export type MailerLiteSubscribeOutcome = 'subscribed' | 'skipped' | 'failed';

export interface MailerLiteSubscribeParams {
  email: string;
  /** Group IDs to add the subscriber to. Empty means no group assignment. */
  groups: string[];
  /** Custom fields, matched by name in the MailerLite account. */
  fields?: Record<string, string | number>;
}

/**
 * Returns an outcome rather than throwing: every caller so far is a public
 * page whose real job is something else, and none of them should fail because
 * an email list did.
 */
export async function subscribeToMailerLite(
  params: MailerLiteSubscribeParams,
): Promise<MailerLiteSubscribeOutcome> {
  const apiKey = process.env.MAILER_LITE_API_KEY;
  if (!apiKey) {
    console.log('MailerLite not configured, skipping subscribe');
    return 'skipped';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${MAILERLITE_API}/subscribers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: params.email,
        groups: params.groups,
        ...(params.fields ? { fields: params.fields } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`MailerLite subscribe failed: ${response.status} ${response.statusText} ${detail}`);
      return 'failed';
    }

    return 'subscribed';
  } catch (error) {
    console.error('MailerLite subscribe error:', error);
    return 'failed';
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The group Coast FIRE calculator leads join.
 *
 * Its own environment variable, not the sync job's `MAILER_LITE_GROUP_ID`:
 * that group is every registered user, and the point of this one is the people
 * who have not registered. Unset means the address still reaches the account's
 * subscriber list, just without a group.
 */
export function coastFireGroupIds(): string[] {
  return groupIdsFrom('MAILER_LITE_COAST_FIRE_GROUP_ID');
}

/**
 * The group retirement calculator leads join. Separate from the Coast FIRE
 * group because they are different questions and deserve different follow-up,
 * and separate from the sync job's group because neither has an account yet.
 */
export function retirementGroupIds(): string[] {
  return groupIdsFrom('MAILER_LITE_RETIREMENT_GROUP_ID');
}

/**
 * The group a no-card signup joins the moment the account is created.
 *
 * Separate from the sync job's `MAILER_LITE_GROUP_ID`, which is every
 * registered user and is rewritten nightly: this one marks the people who
 * just started a trial, so a welcome sequence can trigger on joining it
 * rather than on a list the whole user table is re-posted to every morning.
 *
 * Separate from the two calculator groups for the opposite reason — those are
 * for visitors who gave an address and never registered.
 */
export function trialGroupIds(): string[] {
  return groupIdsFrom('MAILER_LITE_TRIAL_GROUP_ID');
}

function groupIdsFrom(variable: string): string[] {
  const groupId = process.env[variable]?.trim();
  return groupId ? [groupId] : [];
}

/**
 * Which calculator a signup came from, when it came from one.
 *
 * The same two names the frontend already uses for this in its own signup
 * attribution, so the value can travel from the page to here unchanged.
 */
export const CALCULATOR_SIGNUP_ORIGINS = [
  'retirement_calculator',
  'coast_fire_calculator',
] as const;
export type CalculatorSignupOrigin = (typeof CALCULATOR_SIGNUP_ORIGINS)[number];

/**
 * An allowlist, not a cast. The origin arrives in a request body, and it picks
 * which of our groups an address joins — so anything unrecognized becomes "no
 * calculator" rather than reaching MailerLite as a group name.
 */
export function normalizeCalculatorSignupOrigin(
  value: unknown,
): CalculatorSignupOrigin | null {
  return (CALCULATOR_SIGNUP_ORIGINS as readonly unknown[]).includes(value)
    ? (value as CalculatorSignupOrigin)
    : null;
}

/**
 * Every group a new no-card account joins, as one list.
 *
 * The trial group always, because that is what the account is. The calculator
 * group as well when the signup continued from one: someone who clicked
 * through from the calculator page never gave that page an address, so they
 * are not on its list yet — the email-results endpoint is what normally puts
 * them there, and they skipped it. Whoever *did* arrive from a results email
 * is already in the group, and MailerLite upserts, so adding it again costs
 * nothing and keeps one rule for both doors.
 *
 * Unset variables drop out, so an account with no trial group configured still
 * joins its calculator group, and vice versa.
 */
export function signupGroupIds(origin: CalculatorSignupOrigin | null): string[] {
  return [
    ...trialGroupIds(),
    ...(origin === 'retirement_calculator' ? retirementGroupIds() : []),
    ...(origin === 'coast_fire_calculator' ? coastFireGroupIds() : []),
  ];
}
