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

function groupIdsFrom(variable: string): string[] {
  const groupId = process.env[variable]?.trim();
  return groupId ? [groupId] : [];
}
