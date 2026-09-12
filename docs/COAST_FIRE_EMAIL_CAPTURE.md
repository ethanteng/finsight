# Coast FIRE results email

The `/coast-fire-calculator` page is the acquisition wedge for the Coast FIRE
beachhead experiment. It answers the free question — "have I reached Coast
FIRE?" — in the browser, with no account and no email. This document covers the
one step past that: turning an anonymous calculator visitor into a known
prospect by emailing them their own result.

## The flow

1. A visitor submits the seven inputs. The number is calculated and rendered in
   the browser, as before.
2. An email capture appears under the result card. It appears only after a
   submitted run: the page opens with a default scenario already answered, and
   collecting an address against figures nobody entered would email someone a
   stranger's retirement.
3. `POST /api/coast-fire/email-results` receives the seven inputs and an email
   address. It recomputes the result server-side, stores a `CoastFireLead` row
   with a random token, and sends the message through Resend.
4. After the response, the address is added to MailerLite, in the Coast FIRE
   group.
5. The email's call to action — "Stress-test this with my actual finances" —
   links to `/getstarted?source=coast-fire-calculator&ref=<token>`.
6. `/getstarted` exchanges that token through
   `GET /api/coast-fire/signup-context/:token` and renders the Coast FIRE
   variant of the signup page: its own copy, the visitor's Coast FIRE number,
   what they have saved, and their retirement age, with their email prefilled.

The page's own "Stress-test my Coast FIRE plan" button reaches the same
tailored page through sessionStorage rather than a token, so both entry points
continue the same decision.

## Why a token and not the numbers

The link could carry the figures directly. It does not, for the same reason the
retirement calculator's handoff does not: page URLs are collected by analytics,
kept in browser history, and sent in referrer headers, so a dollar amount in one
leaks well past the person it belongs to. The token is 24 random bytes, is not
derived from the address or the figures, expires after 90 days, and resolves to
a response marked `no-store`. An unknown token and an expired one get the same
bare 404, so the endpoint cannot be used to test whether a token was ever real.

## Why the figures are recomputed

The request body carries the seven inputs and nothing else; the result is
calculated on the server before the email is built. An email carries Ask Linc
branding into someone's inbox, so every figure in it has to be one we produced.
A `coastFireNumber` posted by a caller is ignored.

`src/services/coast-fire.ts` is a deliberate second copy of
`frontend/src/lib/coast-fire.ts` — the two are separate TypeScript projects and
cannot import each other. Both suites pin the same worked example
(`$369,128` from the default scenario), so a change to one formula fails the
other side's tests.

## Both parts of the message

Every send includes an HTML part and a plain-text part with the same content:
the status, the number, the funded ratio, the retirement target, the
no-contribution projection, the return-sensitivity comparison, what was
entered, and the limitations. A text-first client shows the results, not a
"view this in a browser" stub.

The HTML uses the shared email shell in `src/email/templates.ts`, so the
message carries the same deep green, lime, and cream as the rest of Ask Linc's
mail, and the result card mirrors the one on the page.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MAILER_LITE_API_KEY` | — | Shared with the nightly user sync. Unset means the list step is skipped; the email still sends. |
| `MAILER_LITE_COAST_FIRE_GROUP_ID` | — | The Coast FIRE group. Unset means the address reaches the subscriber list without a group. |
| `COAST_FIRE_EMAIL_RATE_LIMIT` | 5 | Sends per caller per minute. Far below the quick plan's 20: every accepted request puts mail in an address the caller chose. |
| `COAST_FIRE_CONTEXT_RATE_LIMIT` | 30 | Token lookups per caller per minute, on its own window so a send does not spend it. |
| `COAST_FIRE_TRUSTED_PROXIES` | 1 | How many proxies sit in front of this process. See `routes/fixed-window-rate-limit.ts`. |
| `RESEND_API_KEY` | — | Unset means no mail is sent and the endpoint reports success, matching the rest of the auth email path in development. |

## What must not fail the visitor

The visitor asked for their results. Neither the lead row nor the mailing list
is allowed to stand between them and that:

- A failed database write costs personalization only. The email still sends,
  with its CTA pointing at plain `/getstarted`.
- MailerLite runs after the response and its outcome is recorded, never
  surfaced. A rejected address does not turn a delivered email into an error.
- A failed *send* is the one case that returns an error (502), because there
  the thing that was asked for did not happen.

## Analytics

`coast_fire_results_emailed` is pushed to the dataLayer on a successful send,
carrying `coast_fire_status`, `source_page`, and `content_type` — never the
address. GTM needs a Custom Event trigger and a GA4 Event tag for it, and it
should be marked a key event in GA4 Admin: it is the first point in this funnel
where an anonymous visitor becomes a known prospect, which is what the
experiment is trying to measure.
