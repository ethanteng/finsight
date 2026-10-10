# Retirement contributions

The holdings-based projection counts what the user adds to their investments each year until withdrawals begin. Before this, the projection always assumed nothing more went in, whatever the user had said or saved. A saver years from retirement read a projection of the portfolio they have, not the one they are building. The stated plan and Coast FIRE already read a contribution, so the holdings path was the odd one out.

## How the figure resolves

The order is the same as every other planning input (`src/openai/retirement-contributions.ts`):

1. **This decision.** The planner extracts `retirementInputs.annualContributionAmount`: what the user adds a year until they retire, in today's dollars, with an employer match included when they say so. A stated zero ("I've stopped saving") wins over everything below.
2. **Your numbers.** The saved `annualContribution`, disclosed with the date it was saved.
3. **Linked investment accounts.** The typical month's contributions less withdrawals, times twelve (below).
4. **None.** The answer says it counted none and asks for the figure.

Once withdrawals have begun, nothing is counted, whatever was saved: there are no years left to add it in. The projection's assumption line then says nothing about contributions.

## From linked accounts

Plaid and SnapTrade investment activity is already fetched for about two years and stored on the snapshot (`FinancialSummarySnapshot.activities`). A retirement question loads it. The context service reduces it to one small figure on `snapshot.investments.linkedContributions`, so the activity rows never travel with the snapshot.

**What counts as money in or out.** The provider's own activity type decides, never the amount's sign: the two providers sign cash in opposite ways, and normalization signs it a third.

| Provider | In | Out | Ignored |
| --- | --- | --- | --- |
| Plaid | subtype `contribution` or `deposit`, whatever the type (a buy made with a contribution counts) | subtype `withdrawal` | transfers between institutions (a rollover, an account moved over) and `distribution`, which can be a fund's payout as easily as a withdrawal |
| SnapTrade | `CONTRIBUTION`, `DEPOSIT` | `WITHDRAWAL` | `TRANSFER` |

Only accounts that hold the projection's holdings count.

**Accounts whose activity did not come through.** Activity can be missing for an account: a provider error on this refresh, or an institution that reports none. Read naively, that account would look like it saves nothing, and the figure would be understated without saying so. Instead:

- An account the snapshot's quality ledger records an error for (`provider:error:<account id>`) is left out, even if it has some rows. Advisories are not errors: their data arrived.
- An account with no activity on record is not read.
- When the figure reads fewer accounts than hold the investments, the disclosure says how many of how many, and that the others may add more. The fact pack publishes both counts.

A Plaid error naming a token rather than an account cannot be placed on one, so it is covered by that count alone.

**The typical month.** The figure is the median of each complete month's net (in less out) over the last 12 complete months, never below zero, times twelve. A sum would treat a one-off transfer in, such as an inheritance or savings moved over, as yearly saving until retirement; the median barely moves for it, or for a one-off withdrawal. The cost is that a deposit made once a year, like an IRA contribution, is missed, and a biweekly paycheck reads slightly low. Understating future saving is the safer mistake, and the disclosure says a once-a-year deposit is not part of a typical month.

**When the history cannot say.** No linked figure is produced:

- with fewer than 3 complete months of history;
- with no contribution or withdrawal at all. Some institutions report contributions only as purchases, so silence is not evidence of saving nothing.

The month in progress never counts. Neither do months before the first activity on record for those accounts, because months before the connected history begins are unknown, not empty. Manual balances are not in the account set: they have no activity stream.

## In the projection

- **Engine.** The contribution is invested monthly at the portfolio's target allocation, in today's dollars rising with each historical sequence's CPI, until the withdrawal start age (`withdrawal-simulator.ts`).
- **Cache.** It is stored with the analysis as `annualContributionAmount`, and a cached run is reused only when its contribution matches.
- **Disclosure.** The assumption line names the amount and where it came from: the user's figure, Your numbers with its save date, or the linked months and method. With none counted, it says so and asks.
- **Facts.** The fact pack publishes the contribution, labelled with its origin. For a linked figure it also publishes the months read, the typical month, and the totals in and out, because the answer may not add or net facts itself.
- **What-ifs.** A what-if inherits the baseline's contribution. One that begins withdrawals now drops it rather than failing, unless it states a contribution of its own.
- **Planner boundary.** The planner keeps a stated contribution in the baseline unless it equals a what-if's: "I save $20,000 a year; what if I saved $30,000?" keeps $20,000 as the plan. The claiming age works the same way (`docs/RETIREMENT_INCOME.md`).

## Not yet

- **Employer match, separately.** Nothing on file holds a salary, so no default match can be computed. A match is counted when the provider reports it as a contribution, or when the user includes it in their figure.
- **Other calculators.** The stated plan and Coast FIRE read stated and saved contributions, not linked ones. Coast FIRE's market-history test assumes none by design, since coasting means none.
- **Contribution changes over time.** A raise, a catch-up contribution at 50, or saving that stops before retirement.
- **Planner fallback.** When the context planner request fails, the fallback plan extracts only the core inputs (ages, spending), so a contribution stated in words is not read, as with Social Security and a pension on that path. The disclosure still says which source it used.
