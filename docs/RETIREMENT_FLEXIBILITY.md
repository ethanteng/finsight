# Spending flexibility

A plan that spends the same amount every year has to survive its worst sequences on that amount. Most people would cut back in a bad market, and that willingness is one of the largest levers on how much a portfolio can sustain. Every retirement calculator that runs the historical engine now models it, from one figure the user gives: how much of their spending they could cut.

## The rule

At the start of each withdrawal year after the first, the engine looks at the portfolio in today's dollars. If it is more than 20% below its inflation-adjusted value when withdrawals began (`SPENDING_CUT_TRIGGER`), that year's spending is cut by the user's share. Otherwise spending is full. There is one cut, it never stacks, and spending never rises above the plan (`src/retirement-analytics/engine/withdrawal-simulator.ts`).

- The cut applies to what the household spends, before income: Social Security and a pension still pay what they pay, so the portfolio draw falls by the whole cut.
- It composes with the withdrawal policy and with a survivor's spending.
- The first year is never cut, so the first-year withdrawal figures are the plan's own.
- The trigger is fixed and disclosed. It is not the user's to set.

Each run reports what the cut did (`SpendingFlexibilityOutcome`): the share of sequences that lasted, how many sequences cut at least one year, and the median and most years cut among them.

### What it costs

The survival a cut buys comes from cutting often and for a long time, and the answer says so. On the real engine, $1,000,000 at 65 on the balanced preset, spending $48,000 a year through 95 with no other income, lasts in 83% of sequences on fixed spending. With a 20% cut under this rule it lasts in 97%, but spending is cut in 56% of the sequences, for a median of 13 years and at most 29. An ordinary spend-down drifts more than 20% below its starting value in the second half of retirement, and a portfolio that falls well behind tends to stay behind.

The alternatives were measured on the same plan and rejected:

| Trigger | Lasts | Sequences cut | Median years cut |
| --- | --- | --- | --- |
| None (fixed spending) | 83% | — | — |
| Balance 20% below its real start (chosen) | 97% | 56% | 13 |
| Balance 30% below | 95% | 47% | 14 |
| Balance 40% below | 94% | 39% | 15 |
| 20% behind the typical historical path | 98% | 62% | 14 |
| Investments down 20% after inflation since retirement (ignores withdrawals) | 84% | 18% | 2 |

The returns-only trigger cuts only in genuinely bad markets, and buys almost nothing: failures come from long mediocre stretches under steady withdrawals, which it never sees. Deeper balance triggers cut less often, but once a cut starts it lasts as long, for less survival. The chosen rule buys the most and reports its cost.

## Where the cut comes from

`resolveSpendingFlexibility` (`src/services/spending-flexibility.ts`):

1. **This decision.** The planner reads it once, in its retirement inputs, in the form the user used: `spendingCutPercent` ("we could cut 20%"), `spendingCutAnnual` ("$12,000 less") or `essentialAnnualSpending` ("essentials are $48,000"). Each becomes a share of the plan's spending. `snapshot.statedSpendingCut` carries it to every calculator.
2. **Your numbers.** `spendingCutPercent`, a whole percent from 0 to 75.
3. **Otherwise, the comparison.** Nothing is assumed: the plan keeps fixed spending and a 20% cut runs beside it (`COMPARISON_SPENDING_CUT`).

A stated or saved zero, or an essential floor at or above the plan's spending, means no cut and no comparison. A cut of more than 75% of spending is a misreading: it is dropped and the next source applies. A plan with no spending level (the stated plan's `rates` mode) has nothing to cut.

## Each calculator

- **Holdings-based projection** (`src/openai/context-service.ts`). The run takes the user's cut, or the comparison. Both are part of the stored input and the seven-day cache match, and the analysis version is 12, so a run cached before this change recomputes. The resolution rides on the analysis as `_spendingFlexibility`.
  - **What-ifs** (`src/scenarios/retirement-scenario.ts`) keep the user's cut and never run the comparison.
- **Stated plan** (`src/scenarios/stated-retirement-plan-scenario.ts`, `src/services/retirement-quickplan.ts`). The quick plan takes the cut as an optional third argument. The user's cut runs in every case and alternative; the comparison runs beside the main case only. The public calculator never sends one.
- **Coast FIRE** does not model it: its number is a straight line, and its market-history test runs fixed spending.

## In the answer

The wording is shared (`src/openai/spending-flexibility-evidence.ts`):

- **A cut the user gave** joins the plan's assumptions ("cutting spending 20% ($12,000 a year) in any year that starts with your portfolio more than 20% below its inflation-adjusted value when withdrawals began, and spending in full again once it recovers"), naming a floor or a saved figure, and is followed by how often it was in force.
- **The comparison** is its own sentence after the assumptions: what the plan would last in with a 20% cut against fixed spending, how often and how long it would have cut, and an invitation to give their own number. It is left out when fixed spending already lasts in every sequence.
- **No cut** is stated as such.

The facts publish the cut and what it did, `spending_cut_*` for the user's and `flexible_comparison_*` for the comparison, each with the calculator's prefix. The comparison's survival rate is its own fact, labelled as a comparison the user has not chosen, so it is never mistaken for the plan's.

"Use these next time?" offers a cut the user stated, as a whole percent.

## Not yet

- **Raises.** Guardrail methods that also raise spending in good markets (Guyton-Klinger) are not modeled.
- **Essential and discretionary spending** as separate lines. The cut is one share of the total.
- **A what-if on the cut itself** ("what if we could cut 30%?") has no override field. The newest figure the user gives is the plan's.
- **The sustainable-spending range** (the quick plan's `sustainableSpending`, the holdings `historicalWithdrawalRates`) is solved on fixed spending.
- **Coast FIRE**, above.
