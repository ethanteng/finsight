# Ask Linc today: pricing, trial, the calculator and cash-flow-forecast funnels, cost per use, payment and analytics infrastructure

Scope: a read-only investigation of the repo at `/home/user/finsight` as of commit `50d0a67` (2026-10-07). Citations are repo-relative file paths with line numbers (L). The local git history is shallow and starts 2026-10-01, so earlier history cannot be seen. No production data (live Stripe price, lead counts, conversion rates, provider invoices) is in the repo. Where a figure is missing, the Gaps sections say so.

---

## 1. Subscription tiers, prices, and what each tier gates

### Takeaway
There is one plan: a single monthly Stripe price, with a 30-day free trial that needs no card. The price is read live from Stripe, and the code falls back to **$19/month**. There is no annual plan. Starter, Standard and Premium still exist in code, but every price maps to `premium` and new users default to `premium`. The only live access gate is "subscription canceled", so in practice the tiers gate nothing.

### Cited Findings
- The price is a single source of truth. The price ID comes from the `STRIPE_PRICE_DEFAULT` env var (legacy fallbacks: `STRIPE_PRICE_PREMIUM`, `_STANDARD`, `_STARTER`). The amount is read back from Stripe rather than written into code, "so changing the price in the Stripe dashboard changes both checkout and every price shown on the site." — `src/config/stripe-pricing.ts` L1-22
- Hard-coded fallback, used only when Stripe can't be reached or nothing is configured: `FALLBACK_PRICE_ID = 'price_1UAKSrBDHiWEJZBM6gupEC9p'`, `FALLBACK_PRICE_UNIT_AMOUNT = 1900` ($19.00), currency `usd`, interval `month`. — `src/config/stripe-pricing.ts` L24-29. The frontend mirrors it: `FALLBACK_PRICE_AMOUNT = 19`, `month`. — `frontend/src/config/pricing.ts` (FALLBACK_* constants)
- The resolved price is cached for 5 minutes (`STRIPE_PRICE_CACHE_TTL_MS`) and failures for 30 seconds. Marketing pages fetch `/api/stripe/price` with Next revalidation every 300 seconds. — `src/config/stripe-pricing.ts` L31-36; `frontend/src/lib/pricing.ts` L11-15, L35-59
- `/pricing` copy: title "Ask Linc Pricing — 1 Month Free, Then {price label}"; H1 "One month free. Then {$X} a {month}."; "One plan, full access, and no credit card to start"; "NO TIERS TO DECODE". The card lists: connected accounts in one picture; unlimited questions and follow-ups; what-if scenarios and retirement stress tests; inspectable inputs, assumptions, math and sources; read-only access and no AI training on your data. CTA: "Start free". — `frontend/src/app/pricing/page.tsx` L9-50
- `llms.txt`: "1 month free, then a flat monthly subscription; see /pricing for the current price … Cancel anytime." — `frontend/public/llms.txt` L7-10
- Sitewide CTA microcopy: "Try free for 30 days. No credit card required." A code comment says it is "Not derived from the Stripe price: the trial no longer collects a card, so there is nothing to bill when it ends." — `frontend/src/components/marketing/trial-copy.ts`
- Legacy tier definitions: `getSubscriptionPlans()` defines starter, standard and premium, all at `FALLBACK_MONTHLY_PRICE`, all `month`, and all on the same `singlePriceId()`. Their feature lists differ only nominally (Premium adds "Advanced market context" and "Advanced analytics"). `getLiveSubscriptionPlans()` overwrites every tier with the one live Stripe price. — `src/types/stripe.ts` L140-228
- `TIER_ACCESS` is defined (starter: basic-analysis, account-balances; standard adds economic-indicators and rag-system; premium adds advanced-market-context) — `src/types/stripe.ts` L116-127. A grep found it referenced nowhere else in `src/` outside tests.
- "With single-tier pricing, all price IDs map to 'premium' tier." `getTierFromPriceId` returns `'premium'` for any ID that starts with `price_`. — `src/config/stripe.ts` L99-132
- The `User.tier` column defaults to `"premium"`. — `prisma/schema.prisma` L15
- AI data sources are still filtered by tier: Tiingo market context is Standard and Premium only, "Historical Retirement Market Data" is Premium only, and FRED CPI is Standard and Premium only. Everyone defaults to Premium, so these filters have no effect in practice. — `src/data/sources.ts` L114-153 (via `DataSourceManager.getSourcesForTier`, `src/data/orchestrator.ts` L323)
- The only live gate: `ACCESS_BLOCKING_SUBSCRIPTION_STATUSES = ['canceled']`. The code comment says `subscriptionAuthMiddleware` and its `requireStarterTier` / `requirePremiumTier` / `requireActiveSubscription` derivatives "are defined but mounted on no route". — `src/services/subscription-refresh-eligibility.ts` L21-33. A blocked user gets "Subscription expired. Please renew to continue." — `src/auth/middleware.ts` L80-82
- A feature flag `ENABLE_TIER_ENFORCEMENT` exists (default off unless set to `'true'`). — `src/config/features.ts` L1-11
- Conflicting sources: `CLAUDE.md` says "Tier checks are embedded throughout routes and services (not a centralized middleware)", while the comment in `src/services/subscription-refresh-eligibility.ts` L25-31 says no tier middleware is mounted. The code supports the second statement.

### Inferences
- In practice Ask Linc today is **one product at one price, $19/month (if the live Stripe price matches the fallback), with a 30-day no-card trial**. The three tiers are vestigial. Any pricing test would introduce price differentiation, which the product does not have now.
- Because the price is read from Stripe at request time, changing the price (for example a new monthly amount, or a second recurring price) needs only a Stripe dashboard change plus an env var, with no deploy. A second, parallel price (such as an annual plan or a one-time product) would need code, because everything resolves to one `STRIPE_PRICE_DEFAULT`.

### Gaps
- The live Stripe price can't be confirmed from the repo. Every displayed price follows Stripe, and $19/month is only the fallback.
- There is no annual or other interval price anywhere in code or docs.

---

## 2. How the 30-day no-card trial works, and what happens at the end

### Takeaway
Since **2026-10-06**, every no-card signup is turned into a real Stripe trial subscription at registration: 30 days, no payment method, `missing_payment_method: 'cancel'`. Nothing auto-bills. To keep using the product, a user must add a card through the Stripe billing portal before day 30. Otherwise Stripe cancels the subscription, the account becomes `canceled`, and sign-in is refused. Whether adding a card through the portal really converts this kind of trial has not yet been tested against real Stripe.

### Cited Findings
- `/auth/register` awaits `stripeService.grantAdminTrial({ userId, trialEndsAt: now + 30 days })` before its 201, whenever no Stripe checkout session is involved and `STRIPE_SECRET_KEY` is set. A failure is caught and logged; the signup still succeeds and the account stays "Admin Created", which means full access with no end date. — `src/auth/routes.ts` L357-379; `docs/admin/ADMIN_TRIALS.md` L14-18
- The commit "Convert new no-card signups to a trial automatically" is dated 2026-10-06. — git `accf891`; follow-up `2a3cac4` "await signup trial grant before register response"
- `grantAdminTrial` creates a Stripe subscription on the configured price with `trial_end` set and `trial_settings: { end_behavior: { missing_payment_method: 'cancel' } }`, with metadata `source: 'admin_trial'`. The code explains: "`pause` would leave the account in a status this codebase still admits, and `create_invoice` would bill someone who never gave a card." — `src/services/stripe.ts` L1304-1395
- At trial end: "Stripe cancels the subscription at `trial_end`, `customer.subscription.deleted` sets the account to `canceled`, and the next sign-in is refused with the standard 'Subscription expired' message. From there the user can subscribe from the pricing page … having held this subscription makes them a returning subscriber, so checkout will not hand them a second free trial." — `docs/admin/ADMIN_TRIALS.md` L51-55. Returning subscribers get `skipTrial = priorSubscriptions > 0`. — `src/routes/stripe.ts` L336
- How a trial converts: the signed-in header shows "Upgrade your account". For a trial with no card, `upgradeAction = 'billing_portal'`, which sends the user to `/billing` (Stripe Customer Portal) to add a payment method. That "converts it in place, keeps the end date … and bills once". Checkout is refused for such accounts (409 `ALREADY_SUBSCRIBED`) so Stripe can't create a second subscription. — `docs/admin/ADMIN_TRIALS.md` L39-49; `src/services/stripe.ts` L1580-1610, L1649-1706; `src/routes/stripe.ts` L322
- "**Still unconfirmed against a real Stripe account:** that adding a default payment method through the billing portal converts a granted trial rather than letting it cancel." — `docs/admin/ADMIN_TRIALS.md` L105-110
- The `customer.subscription.trial_will_end` webhook handler only syncs the tier. In the code: "// TODO: Send notification to user about trial ending". — `src/services/stripe.ts` L1241-1253
- Trial-ending reminders are lifecycle emails sent outside the app (MailerLite). Brand banners were added for "the trial-ending emails … those emails go out two days before the trial ends", plus an "ends-soon" banner "for the catch-up campaigns" sent to "trials that end one to four days after the send". — git `14bc5fd`, `d666f3f` (2026-10-06); `frontend/public/images/email/brand/trial-ending.png`, `trial-ending-soon.png`
- A second path, Stripe Checkout (card-first), also exists: `mode: 'subscription'`, `trial_period_days: 30` unless the user is a returning subscriber, card only, `billing_address_collection: 'required'`, `allow_promotion_codes: true`. — `src/services/stripe.ts` L141-176; `src/config/stripe.ts` L87-96
- The "Paid now" metric counts accounts whose current `subscriptionStatus` is `active`. "A cohort younger than the 30-day trial has not matured and should not be judged on this metric." — `docs/MARKETING_DASHBOARD.md` L221-223

### Inferences
- Auto-trials began 2026-10-06, so the first trials on this flow end around **2026-11-05**. Before then the repo's own metrics can say nothing about paid conversion from the no-card trial. A pricing experiment started now would overlap with the first conversion window of the new trial mechanics.
- Because the trial ends by default (cancel, not bill), conversion depends entirely on the user acting (adding a card in the portal) plus lifecycle emails. That conversion path has not been verified in Stripe test mode.

### Gaps
- No trial-to-paid conversion rate, trial count or churn figure is in the repo.
- The content and timing of the trial-ending emails live in MailerLite and aren't in the repo; only the banner images and commit messages are.

---

## 3. `/retirement-calculator` as a funnel

### Takeaway
A free, public, deterministic historical-simulation engine runs on six inputs. Since **2026-10-03** the plan result is **never shown on the page**. Visitors see a blurred, illustrative "locked" card and must give an email address, then choose a password, to see their result as the first decision in an Ask Linc account. Only the "published-rates" mode (when portfolio or spending is left blank) is shown on the page, together with an LLM-written reading.

### Cited Findings
- Status: "landing-page experiment". Hypothesis: "a decision-specific calculation from Ask Linc's own infrastructure converts better than a chat box with no data behind it." There is no chat input on the page. — `docs/RETIREMENT_QUICKPLAN.md` L1-12
- What it computes: `runRetirementQuickPlan` calls `analyzeRetirementPortfolio`, the same engine as authenticated answers, four times: the plan as entered, retiring 2 and 5 years later, and spending 10% less. Inputs: current age, retirement age, investable assets, annual spending, annual contributions, Social Security, plus a claiming age and one of three US-only asset-mix presets. — `docs/RETIREMENT_QUICKPLAN.md` L34-61
- Plan results are held back: "A plan result is not shown on this page. The visitor gives an email address, chooses a password, and sees it as the first decision in their account, with no verification code in between … A `rates` result is shown, because it has no run to save." — `docs/RETIREMENT_QUICKPLAN.md` L111-120
- The page requests an interpretation only when there is no plan result: `useInterpretation(result?.primary ? null : submittedPlan)`. — `frontend/src/components/marketing/RetirementQuickPlan.tsx` L464-473
- The locked card shows illustrative, never personal, figures ("THE MODEL'S ANSWER", "736 of 800") under "Your result is ready. Enter your email below to see it in Ask Linc." — `frontend/src/components/marketing/CalculatorStory.tsx` L96-107
- Run limit: the Calculate button locks after 3 completed runs per browser tab (sessionStorage). It is set by `NEXT_PUBLIC_CALCULATOR_RUN_LIMIT`, which is inlined at build time. "Three answers the question the page asks … past that the page is being used as a free modelling tool rather than as an argument for the product." It is "a nudge, not a control". — `docs/RETIREMENT_QUICKPLAN.md` L122-159
- Email capture flow: `POST /api/retirement-quickplan/email-results` re-runs the model, stores a `RetirementLead` with a random token, and sends a figure-free "Your result is ready in Ask Linc" email via Resend. It stamps `tokenDisclosedAt`, returns the token, and the page goes to `/getstarted?source=retirement-calculator&entry=results_page`. Registration with the token skips the verification code, writes the run as the first decision, and opens `/app`. An existing account goes to `/login?source=retirement-calculator`, and the run is attached after sign-in. A failed lead store returns 503 and the visitor retries. — `docs/RETIREMENT_RESULTS_EMAIL.md` L10-41
- After the response, the address is added to the MailerLite retirement group with `retirement_continue_url` for the follow-up emails. — `docs/RETIREMENT_RESULTS_EMAIL.md` L31-35
- `RetirementLead` stores: email, token, landing/referrer/UTM/gclid/gbraid/wbraid/GA client and session IDs, every plan input, the verdict (survival rate, sequences tested and survived, projected portfolio, first-year withdrawal rate), `emailSent`, `mailerliteSynced`, `continuedAt`, `tokenDisclosedAt`, `expiresAt`. — `prisma/schema.prisma` L930-1010. The token is valid for 90 days (`LEAD_CONTEXT_TTL_DAYS = 90`). — `src/services/lead-token.ts` L33-47
- Closing CTA after a run: "Run this with my actual finances" → `/getstarted?source=retirement-calculator`, with the inputs in sessionStorage for 2 hours. — `docs/RETIREMENT_QUICKPLAN.md` L161-188
- Paid-search variants: `?retirement_age=62` sets the H1 and title to "Can I retire at 62?". There is one Google Ads ad group per retirement age. — `docs/RETIREMENT_QUICKPLAN.md` L190-216
- In-app follow-ups for an account with nothing linked: the `stated_retirement_plan` calculator runs the same engine on the stated figures with a disclosed preset mix. "linking becomes the upgrade rather than the price of an answer." — `docs/SCENARIO_MODELING.md` L103-121
- Known ceiling: the simulations run on the shared event loop; that is "adequate for an experiment and not adequate for a promoted page". A real ad budget would need a worker or queue. — `docs/RETIREMENT_QUICKPLAN.md` L570-582

### Inferences
- The free on-page value of a plan run is now only "your result is ready". All substantive value (verdict, charts, scenarios) sits behind a free account (email plus password, no card). Today the "price" of a calculator result is an email address and a password, not money.

### Gaps
- No run counts, email-capture rate or signup rate per run are in the repo; they live in GA4/BigQuery and in the admin dashboards.

---

## 4. `/coast-fire-calculator` as a funnel

### Takeaway
This page is the "acquisition wedge for the Coast FIRE beachhead experiment". It works the same way as the retirement calculator: the answer is computed in the browser but never rendered, and an email plus a password opens it in Ask Linc. There is no LLM on this page at all.

### Cited Findings
- "The `/coast-fire-calculator` page is the acquisition wedge for the Coast FIRE beachhead experiment. It computes the free question — 'have I reached Coast FIRE?' — in the browser, but answers it in Ask Linc … The goal is that more people experience the value inside the product, not in a calculator outside it. The page never shows the answer itself, in any case." — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L7-15
- Seven inputs: age, retirement age, retirement savings today, annual retirement spending, annual retirement income, expected real return, withdrawal rate. — `frontend/src/components/marketing/CoastFireCalculator.tsx` L359-365
- Flow: (1) compute in the browser and show a locked card; (2) the email capture appears only after a submitted run; (3) `POST /api/coast-fire/email-results` recomputes on the server, stores a `CoastFireLead` and sends a figure-free email via Resend; (4) the token goes to `/app` (signed in), `/login` (existing address) or `/getstarted?source=coast-fire-calculator&entry=results_page`; (5) the address joins the MailerLite Coast FIRE group with `coast_fire_continue_url` (+`entry=drip_email`); (6–8) signup is prefilled, says "Choose a password to see it", and opens `/app` on the seeded decision. — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L17-63
- Capture copy: "YOUR RESULT IS READY / See your Coast FIRE number in Ask Linc / Enter your email to see your result in Ask Linc. New here? Just choose a password, with no code to enter and no credit card." Button: "See my result in Ask Linc". — `frontend/src/components/marketing/CoastFireEmailCapture.tsx` L213-246. The locked card shows an illustrative "$412,380". — `frontend/src/components/marketing/CalculatorStory.tsx` L96-97
- The page's "Stress-test my Coast FIRE plan" button carries no run and goes to generic signup. — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L65-66
- No reading on this page: "the `POST /api/coast-fire/interpretation` endpoint that did so has been removed." — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L153-159
- The same 3-run limit applies. — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L145-151
- The email never states the answer: "Mailing the answer would let the inbox stand in for the account, and the account is the point." — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L258-264
- `CoastFireLead` stores the seven inputs, the result (Coast FIRE number, retirement target, projected savings, `hasReachedCoastFire`) and the same attribution and bookkeeping fields as `RetirementLead`. — `prisma/schema.prisma` L851-928
- In-app follow-up: the `coast_fire` calculator, plus a market-history test on a disclosed preset mix. Worked example: "38, $500,000, retiring at 55 on $80,000 a year … the money lasted in 10 of 517 historical sequences." — `docs/SCENARIO_MODELING.md` L107-115
- Google Ads: "Keep Coast FIRE at $20/day, Maximize Conversions, signup primary." — `docs/admin/PRODUCT_MILESTONES.md` (Rollout step 2)

### Inferences
- Coast FIRE is the funnel with paid traffic behind it ($20/day Google Ads). It is the natural place to measure any pricing change aimed at calculator visitors.

### Gaps
- No Coast FIRE lead volumes or conversion figures are in the repo.

---

## 5. `/cash-flow-forecast` as a funnel, and whether it needs linked accounts

### Takeaway
`/cash-flow-forecast` is a **marketing page with no tool on it**. It shows nothing personal and computes nothing. It has two asks: "Build my forecast", which leads to a no-card trial signup tagged `source=cash-flow-forecast`, and "Email me a sample forecast", which joins a MailerLite group and stores nothing in the app. The forecast itself (`/cash-flow`, beta, signed-in users only) needs linked transaction history, effectively Plaid, to work.

### Cited Findings
- The page was added 2026-10-04 (git `5da55f0`). Signup tagging and sample-forecast capture were added 2026-10-06 (`dca6803`, `1aa8fbb`).
- Page content: H1 "See your future cash. Make better plans."; hero CTA "Build my forecast" → `CASH_FLOW_SIGNUP_HREF` (`/getstarted?source=cash-flow-forecast`); trial microcopy; a teaser demo video; marketing sections; FAQ ("Does AI calculate the forecast? No…"). — `frontend/src/app/cash-flow-forecast/page.tsx` L114-175; `frontend/src/lib/cash-flow-signup.ts`
- Sample capture copy: "NOT READY TO CONNECT AN ACCOUNT? / Get a sample forecast by email / See what a forecast shows, including the low point a budget misses, before you connect anything." Button: "Email me a sample forecast". — `frontend/src/components/marketing/CashFlowSampleCapture.tsx` L92-127
- `POST /api/cash-flow-forecast/sample-request`: "It stores nothing of its own: MailerLite is the list, joining the cash-flow group starts the sequence, and its first email is the sample the visitor asked for." Existing accounts are told to sign in. A failed account lookup, a missing `MAILER_LITE_CASH_FLOW_GROUP_ID` or a failed subscribe each return 503. Rate limit: 5/min (`CASH_FLOW_SAMPLE_RATE_LIMIT`). — `src/routes/cash-flow-forecast.ts` L1-93
- The cash-flow group "is for people who have not registered: its no-trial sequence triggers on joining it, and starting a trial moves them to the trial sequence instead." — `src/services/mailerlite-subscribe.ts` L114-122
- In-app `/cash-flow` is "open to every signed-in user and is labelled Beta". — `docs/CASH_FLOW_FORECAST.md` L3. All `/api/cash-flow` routes use `requireAuth`, and they return 204 if the user has no snapshot. — L268-272
- Data requirement: "A forecast needs at least 28 days of history for any side read from transactions … When both income and spending are overridden, the forecast needs no history at all." — `docs/CASH_FLOW_FORECAST.md` L52. Detecting recurring bills needs about 3 months of history for monthly items and about 6 for quarterly ones. — L315-319
- The engine is "pure and deterministic, with no database or provider access". "Plaid's Recurring Transactions add-on is deliberately not used. It is billed separately." Card APR, minimum and due day come from Plaid Liabilities. — `docs/CASH_FLOW_FORECAST.md` L20, L60, L167

### Inferences
- Unlike the calculators, the cash-flow page has no anonymous, self-serve "aha" moment: an in-app forecast needs signup and then linking at least ~28 days of transactions (or manually overriding both income and spending). Its pre-signup value is a generic sample sent by email. Any paid or one-time "forecast" product would therefore need Plaid linking, with Plaid cost per Item per month (see §7), unlike the calculators, which cost almost nothing.

### Gaps
- The content of the sample forecast email is in MailerLite, not the repo. It's unclear whether it is a static example or personalised (the endpoint sends no inputs, so it can't be personalised).
- No data on how many trial users link accounts or reach a forecast. The cohort "Activation" report exists (§10), but no figures are in the repo.

---

## 6. Follow-up emails and MailerLite groups

### Takeaway
There are two kinds of email. Ask Linc sends one transactional "result ready" email via Resend for each calculator lead. Lifecycle drips run in MailerLite, with a separate group per entry point (Coast FIRE, retirement, cash flow; these are no-trial sequences) and a trial group for new signups. Image assets suggest a 7-email sequence per segment that ends with a trial-ending email.

### Cited Findings
- There are four paths into MailerLite: the nightly `mailerlite-sync` of the whole user table into `MAILER_LITE_GROUP_ID`; the two calculator `email-results` endpoints (calculator group plus a continue URL); registration (`MAILER_LITE_TRIAL_GROUP_ID` plus the entry page's group); and the cash-flow sample request (`MAILER_LITE_CASH_FLOW_GROUP_ID`). — `CLAUDE.md` "Marketing list membership"; `src/services/mailerlite-subscribe.ts` L76-196
- `signupGroupIds(origin)` always adds the trial group, plus the retirement, Coast FIRE or cash-flow group depending on `signupOrigin`. — `src/services/mailerlite-subscribe.ts` L172-196
- The trial group exists "so a welcome sequence can trigger on joining it". — `src/services/mailerlite-subscribe.ts` L99-111
- The transactional email is `email/calculator-ready.ts`: "Your Coast FIRE result is ready in Ask Linc", a link back, what the visitor entered, and no verdict or figure. — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L258-277; files `src/email/calculator-ready.ts`, `src/email/templates.ts`
- Drip links carry `entry=drip_email` and the lead token, so a drip click restores the saved run. — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L38-47; `src/services/mailerlite-subscribe.ts` L124-135
- Drip image assets per segment (`frontend/public/images/email/{cash-flow,coast-fire,retirement}/`): `01-welcome`, `02-connect-accounts`, `03-ask-a-question`, `04-stress-test` (`04-what-if` for cash flow), `05-show-the-math`, `06-privacy`, `07-trial-ending`. Brand banners: `general`, `personal` ("for the founder notes"), `trial-ending`, `trial-ending-soon`. — repo listing; git `14bc5fd`

### Inferences
- Judging from the asset names, the drips push toward connecting accounts, asking a question and stress-testing, then a trial-ending close. The most likely place to add a pricing message or offer to calculator leads is these MailerLite sequences.

### Gaps
- The email copy, delays and sequence logic are configured in MailerLite and aren't visible in the repo. The 7-step structure is inferred from image file names.

---

## 7. Marginal cost per use of each public tool, and of a converted user

### Takeaway
The public tools are nearly free per use. A Coast FIRE run costs $0 in server compute (it runs in the browser). A retirement plan run is pure server CPU (up to 4 historical simulations of a few hundred ms each, cached) with no external API and no LLM. Only the retirement "rates" mode makes one small LLM call (Claude Haiku 4.5), plus cached FRED and Massive calls. Each email capture adds one DB write, one Resend email and one MailerLite API call. The real costs start after signup: every Ask Linc question makes several LLM calls, and every linked bank is billed by Plaid per Item per month.

### Cited Findings
- Coast FIRE: computed in the browser. The server computes only when an email is requested (a pure formula in `src/services/coast-fire.ts`). No LLM: the interpretation endpoint was removed. — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L19-20, L153-159, L240-256
- Retirement plan run: "No provider lookups … A request touches no database and no external API; the historical returns are a checked-in CSV. A request is pure CPU." — `docs/RETIREMENT_QUICKPLAN.md` L48-51. Results are cached in-process (500 entries); variants run in sequence, "Each run is a few hundred milliseconds of straight CPU"; rate limit 20/min per caller. — L536-555, L572-575
- Every retirement run (and every rejection) is written to an analytics table after the response; failures are swallowed. — `src/services/retirement-quickplan-log.ts` L1-15
- Retirement rates mode, the only LLM call on a public page: the `calculatorNarrative` slot, shipped default `claude-haiku-4-5-20251001`, thinking disabled, effort low, `maxOutputTokens` 2000. — `src/openai/model-config.ts` L107-115, L302-316; `src/services/calculator-interpretation.ts` L594. The budget is at most 2 attempts within 25 s (`TOTAL_BUDGET_MS`); the endpoint is rate-limited to 8/min; readings are cached (300 entries). "Every accepted request that misses the cache is a model call we pay for on a page with no account behind it." — `docs/RETIREMENT_QUICKPLAN.md` L347-355, L556-561
- Market data for rates mode: FRED (CPI, Treasury yields) and Massive (Treasury yields, inflation expectations), each with a 2.5 s timeout, cached for 1 hour (1 minute if nothing resolved). No web retrieval. — `src/services/calculator-market-conditions.ts` L33-34, L128-145; `docs/RETIREMENT_QUICKPLAN.md` L299-345
- Email capture on either calculator: one `*Lead` DB insert, one account lookup, one Resend email, and one MailerLite subscribe after the response. The retirement re-run "is still in the quick plan's in-process cache, so the usual path costs nothing". — `docs/RETIREMENT_RESULTS_EMAIL.md` L45-50
- Registration seeding: "no engine run and no model call on the registration path." — `docs/RETIREMENT_QUICKPLAN.md` L497-501
- Cash-flow sample request: one DB account lookup plus one MailerLite API call; nothing stored. — `src/routes/cash-flow-forecast.ts` L46-93
- After signup, each Ask Linc question runs: a context planner (OpenAI `gpt-4o` shipped default), primary analysis plus a tool-based pack audit (Anthropic `claude-sonnet-5`), an OpenAI `gpt-4o` fallback on failure, an optional second review (`gemini-3-flash-preview`, only when validation is enabled), profile extraction (`gpt-4o`), and Brave Search only when the plan selects it. — `src/openai/model-config.ts` L69-124; `CLAUDE.md` Data Flow
- Plaid: "Transactions is billed per connected Item per month, not per call or per day of history." — `src/config/transaction-history.ts` L8-11; `src/plaid.ts` L451. Link requests `Transactions`, with consent for `Investments`, `Liabilities` and `Auth`. — `src/plaid.ts` L440-446
- Nightly refreshes keep costing "Plaid, SnapTrade and RentCast calls every night" for every non-canceled user, which is why canceled users are excluded. — `src/services/subscription-refresh-eligibility.ts` L1-19
- Plaid Balance API calls are cached to once per day per account to cut costs. — `docs/features/BALANCE_API_OPTIMIZATION.md` L5

### Inferences
- A one-time charge to unlock a calculator result would sell something whose marginal cost is close to $0 (Coast FIRE) or a few hundred ms of CPU (retirement). Gross margin per unlock would be almost 100% minus payment fees. The trial and the subscription carry the expensive costs: per-question LLM calls, Plaid per Item per month, and nightly provider refreshes.
- A one-time "cash-flow forecast" product would carry Plaid's per-Item monthly cost for as long as the Item stays linked, unless the Item were removed after the forecast.

### Gaps
- No dollar figures for any provider (Anthropic/OpenAI/Gemini per-token cost, Plaid per-Item price, Resend, MailerLite plan, FRED and Massive plans, Render CPU) are in the repo. Per-question token usage isn't documented as a dollar cost either; `GET /ai/performance` reports latency, not spend (`docs/step-8-measurement.md` L10-28).

---

## 8. Why results are deliberately not shown on the page, and documented goals

### Takeaway
Hiding results was a product decision shipped on **2026-10-03**. The idea is that the calculator is "an argument for the product", so the value should first be experienced inside the account, with friction cut everywhere else (no card, no verification code, no second sign-in). The docs call it "a nudge, not a control". It is four days old, so the repo has no data on its effect.

### Cited Findings
- `CLAUDE.md`: "Neither calculator shows its answer on the page. The goal is for visitors to experience the value inside Ask Linc, not in a calculator outside it … This is a nudge, not a control: the figures reach the browser either way."
- "The goal is that more people experience the value inside the product, not in a calculator outside it." — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L11-13
- "**It is a nudge, not a control** … Anyone who opens devtools can read the answer." — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L86-89
- On not mailing the answer: "Mailing the answer would let the inbox stand in for the account, and the account is the point." — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L262-264
- On skipping the verification code: "A code between the password and the answer is where the visitor leaves, and the calculators exist to get them in front of that answer in Ask Linc." — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L167-171
- On the 3-run limit: "past that the page is being used as a free modelling tool rather than as an argument for the product." — `docs/RETIREMENT_QUICKPLAN.md` L124-128
- Shipping history: "Open calculator results in Ask Linc instead of on the page" (2026-10-03, `47427ff`), which made "the full results email … now only the fallback when the lead did not store". "Open every calculator result in Ask Linc, never on the page" (2026-10-03, `415305a`) removed even that fallback. Before 2026-10-03, results were shown on the page and/or emailed in full.
- The beachhead thesis the Coast FIRE scorecard tests, in order: "1. explicit Coast FIRE positioning attracts qualified visits; 2. a calculator result creates demand for a plan using actual finances; 3. that intent survives the complete no-card signup path; and 4. new accounts connect financial data, ask a planning question, and pay." — `docs/MARKETING_DASHBOARD.md` L102-107
- Conversion goals: signup is the Google Ads primary and bidding goal. The two successful results-email events are forwarded to Google Ads lead conversion actions. Four product-quality milestones (first result viewed, first meaningful answer, first account linked, returned engaged within 7 days) are Secondary, $0 actions that must not be used for bidding. — `docs/MARKETING_DASHBOARD.md` L231-238; `docs/admin/PRODUCT_MILESTONES.md` L3-5, L44-78
- On the in-app answer for unlinked users: "linking becomes the upgrade rather than the price of an answer." — `docs/SCENARIO_MODELING.md` L105

### Inferences
- Charging for a calculator result would contradict the documented strategy. That strategy treats the result as a free hook into an account and a trial; the planned monetisation is the subscription after linking.
- A "pay to see the result" variant would also clash with the "nudge, not a control" design: the result is already computed in the browser (Coast FIRE) or returned to it (retirement). A paid unlock would need the result computed and withheld on the server.

### Gaps
- No funnel numbers (run → email → signup → link → paid) are documented. The dashboards read them live from GA4/BigQuery and Postgres. Saved-results tracking only became reliable from 2026-09-12 (`docs/MARKETING_DASHBOARD.md` L80-85).

---

## 9. Payment infrastructure a one-time charge could reuse

### Takeaway
Stripe is fully wired for **subscriptions only**: Checkout `mode: 'subscription'`, the Customer Portal, webhooks for subscription and invoice events, GA4 purchase reporting, and live price lookup. Nothing handles one-time payments: no `mode: 'payment'`, no `checkout.session.completed` or `payment_intent.*` handlers, and no entitlement table. A one-time charge could reuse the Stripe client, customer reuse, webhook verification and event logging, and the `/subscribe`-style forwarding page, but would need a new session type, a webhook handler and somewhere to store the purchase.

### Cited Findings
- Stripe client: lazily initialised, `apiVersion: '2025-08-27.basil'`; responses are reported to provider monitoring. — `src/config/stripe.ts` L10-42
- Checkout session creation is hard-coded to `mode: 'subscription'`, `payment_method_types: ['card']`, one line item (the default price), metadata `{tier, source: 'web_checkout'}` on both session and subscription, `billing_address_collection: 'required'`, `allow_promotion_codes: true`. It reuses an existing Stripe customer when verified. — `src/services/stripe.ts` L114-181
- `POST /api/stripe/create-checkout-session` requires `tier`, `successUrl` and `cancelUrl`, always charges `getDefaultPrice().priceId`, takes identity from the session (not the body), sets `skipTrial` for returning subscribers, and refuses 409 `ALREADY_SUBSCRIBED` when a working subscription exists. — `src/routes/stripe.ts` L257-336, L322
- Other routes: `GET /payment-success`, `POST /webhooks`, `POST /create-portal-session`, `GET /price`, `GET /plans`, `GET /subscription-status`, `POST /check-feature-access`, `GET /config`. — `src/routes/stripe.ts` L17, L257, L357, L469, L515, L537, L562, L608, L640
- Webhook events handled: `customer.subscription.created/updated/deleted/paused`, `invoice.payment_succeeded/failed/payment_action_required`, `customer.subscription.trial_will_end`; anything else is logged as "Unhandled". — `src/services/stripe.ts` L505-532; `src/types/stripe.ts` L55-64. Signature verification uses `STRIPE_WEBHOOK_SECRET`; in development it is bypassed. — `src/routes/stripe.ts` L357-400
- Events are persisted as `SubscriptionEvent` rows with `stripeEventId` (used by cohort "Paid" clocks, which read `invoice.payment_succeeded`/`invoice.paid`). — `src/types/stripe.ts` L81-88; `docs/admin/COHORT_REPORTS.md` "Who is in a cohort"
- GA4 revenue: `reportPaidConversionToGa4` sends a Measurement Protocol `purchase` on the first invoice with `amount_paid > 0`, deduplicated on the checkout session ID and marked `ga_purchase_reported` in subscription metadata. — `src/services/stripe.ts` L1042-1075; `src/services/ga4-measurement-protocol.ts` L60-131
- Forwarding pages: `/subscribe` (Checkout) and `/billing` (Portal) mint the Stripe session when the page loads, in a new tab, to avoid popup blockers; both refuse to forward to an unexpected host. — `CLAUDE.md` Tier System; `frontend/src/app/subscribe/page.tsx`, `frontend/src/app/billing/page.tsx`
- Risk if a one-time price were added naively: `getTierFromPriceId` maps any `price_…` ID to `'premium'`. — `src/config/stripe.ts` L112-132. `autoSyncSubscriptionTier` rewrites the tier and metadata from the price on webhooks. — `docs/admin/ADMIN_TRIALS.md` L60-68
- Lead tables already link an anonymous visitor's run to an email, a token and acquisition data (§3, §4). `Conversation.calculatorLeadToken` (unique with `userId`) attaches a run to an account idempotently. — `prisma/schema.prisma` L209-235

### Inferences
- The cheapest one-time charge to build: a second Checkout path in `mode: 'payment'`, carrying the lead token in `metadata` or `client_reference_id`; a `checkout.session.completed` handler that marks the `CoastFireLead`/`RetirementLead` row as paid (new column) or grants an entitlement; and a GA4 purchase sent the same way. Customer reuse, signature verification and the forwarding-page pattern carry over directly.
- `allow_promotion_codes: true` on today's Checkout means Stripe coupons and promotion codes can already be used to test discounts on the subscription without code changes, though codes must be distributed (for example via MailerLite).

### Gaps
- Stripe dashboard configuration (products, other prices, coupons, portal settings) can't be seen from the repo.

---

## 10. Analytics, attribution and experiment infrastructure for measuring a pricing test

### Takeaway
Measurement is detailed. First-touch landing attribution is kept for 90 days in localStorage. Immutable `UserAcquisition` rows store UTMs, click IDs and GA IDs. Lead tables carry the same attribution plus lifecycle timestamps. Allow-listed `signupOrigin` and `signup_entry` values tag every route. GA4, GTM, BigQuery and Contentsquare record events; admin funnel, cohort (Signups/Trials/Paid) and product-milestone reports exist; and the first paid invoice is reported to GA4. There is **no A/B testing framework**, so randomised variant assignment would have to be built. Today "experiments" are env vars, build-time constants and separate pages or campaigns.

### Cited Findings
- First-touch landing attribution: `frontend/src/lib/landing-attribution.ts` remembers the first campaign-tagged landing (else the first outside referrer) for 90 days (`LANDING_ATTRIBUTION_TTL_MS`). It captures utm_source/medium/campaign/term/content, gclid, gbraid and wbraid. — L1-40
- `UserAcquisition` model: "Immutable signup attribution. No email, financial inputs, or question text." Fields: `source`, `flowVersion` (default `calculator_in_app_v1`), landingPage, referrer, utm*, gclid/gbraid/wbraid, gaClientId, gaSessionId. — `prisma/schema.prisma` L52-74. Written at signup; "The original server-resolved calculator lead outranks later signup-page parameters." — `src/auth/routes.ts` L333-349; `docs/admin/COHORT_REPORTS.md` L76-93
- Signup origins (allowlisted): `retirement_calculator`, `coast_fire_calculator`, `cash_flow_forecast`. — `src/services/mailerlite-subscribe.ts` L150-170. Signup entries: `results_email`, `results_page`, `calculator_cta`, `direct`, plus `drip_email`. — `docs/TRIAL_SIGNUP_FUNNEL_TRACKING.md` L35-47; `docs/MARKETING_DASHBOARD.md` L118-123
- Lead-table lifecycle fields: `emailSent`, `mailerliteSynced`, `continuedAt` (first successful token exchange), `tokenDisclosedAt`, `createdAt`, `expiresAt`. — `prisma/schema.prisma` L851-1010
- GA4 property `519498279` (`G-0QBF34C7VK`), GTM `GTM-PL362L36`, BigQuery daily export (`analytics_519498279`), one-day reporting lag. — `docs/MARKETING_DASHBOARD.md` L229-286; `docs/ANALYTICS_REPORTING_HANDOFF.md` L1-14
- Key dataLayer events: `retirement_model_run`, `coast_fire_calculated`, `coast_fire_results_emailed`, `retirement_results_emailed` (with `survival_band`), `calculator_results_email_cta_opened`, `calculator_results_page_cta_opened`, `start_free_click` (`cta_location`), `trial_signup_viewed`, `sign_up` (`signup_flow=free_trial`), `trial_signup_completed` (`completion_method`), and a cash-flow sample-request push (`pushCashFlowSampleRequested`). — `docs/MARKETING_DASHBOARD.md` L135-170; `docs/TRIAL_SIGNUP_FUNNEL_TRACKING.md` L3-33; `docs/RETIREMENT_RESULTS_EMAIL.md` L88-103; `frontend/src/components/marketing/CashFlowSampleCapture.tsx` L5, L53
- Admin reports: `/admin/marketing` and `/admin/retirement-calculator` ("Where do people stop?" path funnels by device, calculator health, Save results → account branch, repeat-run report). — `docs/MARKETING_DASHBOARD.md` L1-131; `docs/CALCULATOR_REPEAT_USAGE.md`. Cohort Engagement and Activation reports with a Signups / Trials / Paid toggle. "Paid" is clocked from the first charge above $0; filters by signup source, channel and `utm_campaign`. — `docs/admin/COHORT_REPORTS.md` L1-99
- Product milestones (first result viewed, first meaningful answer, first account linked, returned engaged within 7 days) are stored first-party with a unique `(userId, kind, definitionVersion)` and sent to Google Ads as Secondary $0 actions (shipped 2026-10-06). — `docs/admin/PRODUCT_MILESTONES.md` L1-59
- GA4 purchase on the first paid invoice, via the server-side Measurement Protocol. — `src/services/stripe.ts` L1042-1075
- Feature flags are env-only: `ENABLE_USER_AUTH`, `ENABLE_TIER_ENFORCEMENT`, `ENABLE_PLAID_ENRICH`. — `src/config/features.ts` L1-11. Build-time `NEXT_PUBLIC_CALCULATOR_RUN_LIMIT`. — `docs/COAST_FIRE_EMAIL_CAPTURE.md` L289. Constant `COAST_FIRE_EXPERIMENT.live`, which only switches the scorecard between pre-launch and live. — `src/marketing-analytics/beachhead-scorecard.ts` L24; `docs/MARKETING_DASHBOARD.md` L144-183
- No A/B or feature-flag SDK (GrowthBook, PostHog, Optimizely, LaunchDarkly, Statsig, Vercel Flags) and no variant-assignment code was found by grep across `src/` and `frontend/src/`. Frontend `NEXT_PUBLIC_*` vars are only the API URL, the run limit, the Stripe portal URL, the GA ID and the Ads milestone overrides.
- Known measurement gaps the docs record: downstream metrics "cannot honestly be attributed to Coast FIRE until original marketing attribution is persisted with the first-party user"; "paid conversion matures after the 30-day trial, so the initial 4–6 week test needs cohort-age context"; Search Console and Google Ads spend are not connected. — `docs/MARKETING_DASHBOARD.md` L225-227, L296-307. This conflicts with `docs/admin/PRODUCT_MILESTONES.md` "Acquisition and privacy" and `COHORT_REPORTS.md` L76-93, which say signup attribution is now persisted (`UserAcquisition`). The first gap appears to be closed for new signups, and `MARKETING_DASHBOARD.md` is likely stale on this point.

### Inferences
- A pricing test could be measured with what exists, by segmenting on `utm_campaign`, `signupOrigin` and `signup_entry`, or by giving each arm its own landing URL or source tag. `UserAcquisition` joined to `Subscription`/`SubscriptionEvent` gives first-party trial→paid by campaign, and Google Ads, GA4 and the MP purchase event give channel-level revenue. Splitting visitors randomly on one URL would need new assignment code and a new attribution field, for example `flowVersion` (which already exists and could carry a variant label) or a new column.
- Any test of subscription conversion needs at least about 30 days of trial maturity plus the observation window. The cohort reports already handle immature periods ("Not yet measurable", `*`).

### Gaps
- No baseline metrics (sessions, runs, leads, signups, link rate, paid rate, ARPU, churn) are recorded in the repo.
- Google Ads spend isn't connected to the dashboards (`docs/MARKETING_DASHBOARD.md` L305-307), so CAC per funnel can't be computed from the repo alone.
