# Your numbers

Ask Linc answers from linked accounts first. What no linked account says, the user can tell it, and Your numbers is where those figures are kept between decisions, so someone with nothing linked does not state their retirement plan again every time they start a new decision.

## What it holds, and where each part lives

| Figure | Stored in | Read by |
| --- | --- | --- |
| Age | Remembered personal context (`src/profile/`) | Every calculator that needs an age |
| Balances (what is invested, cash, debts) | Manual accounts (`ManualAccount`), counted as entered balances in `linkedData.entered` | The snapshot totals, with "entered by the user" labels (see `docs/ANSWER_FIRST.md`) |
| Take-home pay and spending a month | The Finances overrides (`User.monthlyIncomeOverride` / `monthlyExpenseOverride`) | The expected month, and everything that plans with it |
| Retirement plan | `StatedFigures` (`src/services/stated-figures.ts`) | Coast FIRE, the stated retirement plan, the holdings-based projection, and the fact pack |

Only the retirement plan is new storage. The page gathers the rest from where it already lived, so there is one copy of each figure.

The plan's figures are `retirementAge`, `annualRetirementSpending`, `annualContribution`, `retirementIncome` (a pension or other income from the retirement date), `socialSecurityAnnual`, `socialSecurityStartAge`, `planThroughAge` and `allocation` (a preset mix). Each is stored with the date it was saved and whether it came from the page or from an answer. Bounds are where both calculators that read a figure accept it, so a saved value never reaches one only to be dropped there. Every read re-validates the JSON and drops a figure that no longer holds together, and a write that names one bad figure changes nothing. They are stored as plain JSON, like the balances and overrides beside them.

## Saved only by the user

A decision holds both the user's plan and their what-ifs ("what if I retire at 58?"), and the application cannot always tell them apart. So nothing is saved without the user's action:

- **The page** (`/your-numbers`) edits every figure above. It highlights what most decisions need and no account covers: the age, what is invested (nothing linked or entered), what retirement will cost, and monthly spending (no transactions to read it from). Coverage comes from the snapshot through `linkedDataFromSnapshot`, so the page never asks for what a linked account already gives.
- **"Use these next time?"** under an answer (`src/openai/save-offer.ts`). When Coast FIRE or the stated retirement plan ran on figures the user stated in this decision, the answer offers the ones not already saved: only the main case, never a comparison's changed values. Each figure is ticked and can be left out. The invested balance is offered as a manual account, and only when nothing investment-like is linked or entered, since a second copy beside a linked brokerage would count the same money twice. The offer goes out with the live answer only; a stored answer does not repeat it.

Age is not offered: remembered personal context already keeps an age the user states.

## How answers use it

Saved figures sit after anything the user says in the current decision and before linked data, the current-spending fallback and named defaults:

1. the current message and earlier messages in the decision;
2. Your numbers;
3. linked or entered data (an investment total, current spending);
4. named defaults (65, 95, the Balanced mix), or an ask.

A saved retirement age the user has already reached is no plan for the future and is skipped, as is a saved plan-through age the retirement would already run past. Each calculator's disclosure names what it took and when it was saved ("From Your numbers: retiring at 58 and spending $70,000 a year in retirement, saved Sep 14, 2026."). The missing-figures form (`input_request`) shows a saved figure filled in as "From Your numbers". The holdings-based projection takes a saved retirement age where a remembered one would go, and saved spending where an earlier figure would (disclosed as one). The fact pack publishes each saved number as a `user_input` fact labelled with its save date, and the reviewer is shown the same figures.

## Relevant files

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma` (`StatedFigures`) | One row per user, `figures` JSON |
| `src/services/stated-figures.ts` | Keys, bounds, reading, the all-or-nothing update, and disclosure wording |
| `src/auth/stated-figures-routes.ts` | `GET` / `PUT /api/stated-figures`, with coverage |
| `src/openai/save-offer.ts` | "Use these next time?" |
| `src/scenarios/coast-fire-scenario.ts`, `stated-retirement-plan-scenario.ts` | Reading saved figures, disclosure, and `savableFigures` |
| `frontend/src/app/your-numbers/` | The page |
| `frontend/src/components/SaveOfferCard.tsx` | The offer under an answer |
