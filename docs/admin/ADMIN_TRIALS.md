# Admin-granted trials

## What it does

The user management tab in `/admin` can convert an **Admin Created** account into a
**Trialing** one with an end date you choose, and can later move that date.

An admin-created account is one that never went through Stripe: `User.subscriptionStatus`
is `inactive` and it has no `Subscription` rows. `getUserSubscriptionStatus` reads that
combination as "Admin-created user. Full access granted." — access with no end to it.
Converting the account replaces that with a real Stripe trial, so the date you pick is the
date access actually stops.

## How the date becomes binding

Nothing in this codebase expires an account on a date. The only live access gate is
`authenticateUser` (`src/auth/middleware.ts`), which blocks a user whose
`subscriptionStatus` is in `ACCESS_BLOCKING_SUBSCRIPTION_STATUSES` — `canceled`. So the
trial is a genuine Stripe subscription and Stripe is what moves it:

1. `POST /admin/user-trial` creates (or reuses) a Stripe customer for the account and
   creates a subscription on the configured price with `trial_end` set to your date and
   `trial_settings.end_behavior.missing_payment_method: 'cancel'`.
2. The local `Subscription` row and `User.subscriptionStatus` are written immediately so the
   panel shows the trial without waiting for the webhook. The Stripe customer id is stored
   on the user *before* the subscription is created so the webhook can resolve the account
   by customer id. `customer.subscription.created` then updates the same row when it already
   exists; when the webhook wins the insert race instead, `metadata.source: admin_trial`
   still suppresses the welcome email — an account that already had full access does not
   need one. Subscription creates also carry an idempotency key and re-read the
   account afterwards, so overlapping grants cannot leave two trials behind (see
   Constraints).
3. No card is ever collected. At `trial_end` Stripe cancels the subscription,
   `customer.subscription.deleted` sets the account to `canceled`, and the next sign-in is
   refused with the standard "Subscription expired" message. The user can subscribe from
   the pricing page as anyone else would; having held this subscription makes them a
   returning subscriber, so checkout will not hand them a second free trial.

`PUT /admin/user-trial` moves the end date by updating `trial_end` on that same Stripe
subscription. Stripe owns the date; the local row mirrors what Stripe returns.

## Tier

There is one Stripe price and under single-tier pricing it maps to `premium`. The webhooks
re-derive a subscription's tier from its price — `autoSyncSubscriptionTier` rewrites the
subscription's tier, the user's tier, and even the subscription metadata on the first
delivery — so a trial on a `starter` or `standard` account is not something Stripe can
represent. Starting a trial therefore moves the account onto the tier the trial actually
bills, at the moment you click, and the panel says which. The alternative was letting a
webhook change the tier silently a second later.

## Constraints

- The account must be admin-created. An account with any Stripe billing history is refused
  (409) rather than given a parallel subscription.
- An account with access revoked is refused; restore access first.
- Stripe requires a trial to end at least **48 hours** out, so the picker and the API both
  enforce that. Trials longer than **365 days** are refused as a typo guard.
- Errors from Stripe are returned with their message so the panel can show what to fix.
- Concurrent grants: the create call carries an account-and-date idempotency key, so a
  double-click collapses into one subscription, and the call re-reads the account
  afterwards — if another subscription appeared while Stripe was answering, the one just
  created is cancelled and the request is refused. Claiming the account by flipping
  `subscriptionStatus` first was rejected: a crash between the claim and Stripe would leave
  the account `trialing` with no subscription row, which reads as "account setup
  incomplete" and locks the comped user out.

## Testing

There is no way to exercise the Stripe calls from the test suite, so
`src/__tests__/unit/admin-trial.test.ts` covers the service against a mocked Stripe client:
what is sent to Stripe, what is written locally, and every refusal. Before using this
against production accounts, run it once against Stripe **test mode** and confirm in the
Stripe dashboard that the subscription is `trialing` with the expected trial end, and that
it cancels at that date.
