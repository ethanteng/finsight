# Retirement results email

`/retirement-calculator` runs its model but shows the answer in Ask Linc rather
than on the page. This is the step that gets the visitor there: an email
address, a password, and the run waiting as their first decision.

It mirrors the Coast FIRE flow documented in `COAST_FIRE_EMAIL_CAPTURE.md` and
shares its machinery. This page covers what differs.

## The flow

1. A visitor runs the model. A plan result is held back
   (`COAST_FIRE_EMAIL_CAPTURE.md`, **The answer opens in Ask Linc**): a locked
   card and the capture render in its place, and nothing else about the
   verdict does.
2. `POST /api/retirement-quickplan/email-results` re-runs the model from the
   submitted figures, stores a `RetirementLead` row with a random token, and
   sends the figure-free "result ready" email through Resend as HTML and plain
   text. Only when the lead did not store does it send the full results email
   instead, and the page then shows the verdict itself.
3. The page takes the returned token straight to
   `/getstarted?source=retirement-calculator&entry=results_page`, where the
   visitor chooses a password. Registration skips the code and opens `/app` on
   the seeded first decision.
4. After the response, the address is added to MailerLite, in the retirement
   group.
5. The email's call to action links to `/retirement/continue?ref=<token>`,
   which moves the token into a short-lived first-party cookie and redirects to
   a clean `/getstarted?source=retirement-calculator`.
6. `/getstarted` spends the cookie, exchanges it through
   `GET /api/retirement-quickplan/signup-context/:token`, and shows what the
   visitor entered with the address prefilled. It states no verdict.

## What differs from Coast FIRE

**The model already runs on the server.** Coast FIRE recomputes a formula; this
re-runs the simulation. That is not as expensive as it sounds: a plan the
visitor ran moments ago is still in the quick plan's in-process cache, so the
usual path costs nothing. The principle is the same either way — an emailed
figure carries our branding, so it has to be one we computed, never one read
out of a request body.

**A run without a verdict is refused.** In `rates` mode the model has no
portfolio or spending level and will not invent one, so there is no survival
figure to send. The endpoint returns 400 naming the box that would produce one,
and the capture form does not render at all.

**The stored outcome is the one the account shows.** The model is
deterministic given its inputs, but both the engine and the checked-in market
dataset change, so the first decision is written from the survival rate on the
row rather than a fresh run. It is shown to one decimal, because rounding a
99.6% survival rate to "100%" overstates it.

## Shared machinery

| Piece | Where |
|---|---|
| Token shape, lifetime, and minting | `src/services/lead-token.ts` |
| Handover cookie read/clear, token pattern | `frontend/src/lib/calculator-handover.ts` |
| The `/continue` redirect | `frontend/src/lib/calculator-handover-redirect.ts` |
| Per-caller fixed window | `src/routes/fixed-window-rate-limit.ts` |
| One address into a MailerLite group | `src/services/mailerlite-subscribe.ts` |

The two calculators keep separate cookies (`asklinc_rt_ref` and
`asklinc_cf_ref`), separate tables, separate MailerLite groups, and separate
rate-limit windows, so neither can answer for the other.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MAILER_LITE_RETIREMENT_GROUP_ID` | — | The retirement group. Unset means the address reaches the subscriber list without a group. |
| `RETIREMENT_EMAIL_RATE_LIMIT` | 5 | Sends per caller per minute. Far below the model's own 20: every accepted request puts mail in an address the caller chose. |
| `RETIREMENT_CONTEXT_RATE_LIMIT` | 30 | Token lookups per caller per minute, on its own window so a send does not spend it. |
| `RETIREMENT_QUICKPLAN_TRUSTED_PROXIES` | 1 | Shared with the model endpoint. See `routes/fixed-window-rate-limit.ts`. |

A migration adds `retirement_leads`; apply it before or with the backend.

## Analytics

`retirement_results_emailed` is pushed on a successful send, carrying
`survival_band` (strong, mixed, or weak), `source_page`, and `content_type` —
never the address, and never the exact rate, which is close enough to a
fingerprint of one person's plan to be worth not sending. GTM needs a Custom
Event trigger and a GA4 Event tag for it, and it should be a key event in GA4
Admin.

After the email CTA restores the stored plan, the browser pushes
`calculator_results_email_cta_opened` with `calculator_type=retirement`,
`signup_origin=retirement_calculator`, and `signup_entry=results_email`. Those
fixed, non-sensitive attribution fields stay on the later trial events. The
backend records the first successful token exchange in `continuedAt`, which is
reported live in `/admin/retirement-calculator` and `/admin/marketing` without
waiting for the GA4 daily export.
