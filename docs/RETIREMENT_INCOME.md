# Retirement income

Every retirement calculator in Ask Linc counts Social Security and a pension the same way: as separate incomes, each with its own start age and its own inflation treatment. Before this, each calculator read one income and a different one: the stated retirement plan read Social Security, Coast FIRE read the pension, and the holdings-based projection read neither. Every saved figure still reached the model as a fact, so an answer could quote a Social Security estimate above a projection that assumed none.

## The engine

`RetirementAnalysisInput.incomeStreams` (`src/retirement-analytics/types.ts`) is a list. Each stream has an annual amount, a start age, an optional end age, and `inflationAdjusted`:

- **Rises with inflation** (the default for a stream, and always for Social Security): the amount is in today's dollars and rises with each historical sequence's own CPI, like the spending it offsets.
- **Fixed**: the amount is the dollars it pays, exactly as a pension statement quotes it, and it never changes. Each sequence's inflation erodes it, including in the years before it starts.

Income reduces that month's portfolio withdrawal while it is paid. Income above that month's spending is not reinvested, and income paid before withdrawals begin is not banked. The engine also reports `firstYearPortfolioWithdrawal`, the median spending the portfolio itself covered in the first twelve months of withdrawals. It is measured in the simulation, because a fixed pension is worth whatever each sequence's inflation left of it. Analysis version 11 introduced both.

## How each income resolves

Every calculator uses the same order: what the user said in the current decision, then what they saved in Your numbers, then a named default. A term is only defaulted for an income the user actually has.

| Term | Default | Why |
| --- | --- | --- |
| Social Security start age | 67 | Full retirement age for anyone born after 1959 |
| Pension start age | The retirement age | Most pensions start when work stops |
| Pension inflation | Fixed | Most private pensions are fixed, and overstating future income is the costlier mistake |

Every defaulted term is named in the answer, with what to say to change it. A stated zero ("I won't get a pension") wins over a saved figure.

Your numbers stores the pension as `retirementIncome`, `retirementIncomeStartAge` and `retirementIncomeInflation` (`fixed` or `rises_with_inflation`). Social Security is `socialSecurityAnnual` and `socialSecurityStartAge`, always in today's dollars.

## Each calculator

- **Stated retirement plan and the public quick plan** (`src/services/retirement-quickplan.ts`). The quick plan request takes `pensionAnnual`, `pensionStartAge` and `pensionInflationAdjusted` beside Social Security. The public page does not ask for a pension, so its runs carry none. The stated plan's disclosure names each income and, for every income that starts after retirement, the years the portfolio covers that income's share on its own.
- **Coast FIRE** (`src/scenarios/coast-fire-income.ts`). The public page's formula is unchanged, since it is pinned to a browser copy. Ask Linc's answer builds on it:
  - **Steady state.** The retirement target is the spending left once every income has started, divided by the withdrawal rate.
  - **Bridge reserve.** On top of that, the target adds what the portfolio pays before later incomes begin, valued at the same real return. This reserve is reported on its own.
  - **Fixed pension.** It is counted at the level amount, in today's dollars, that has the same value over the retirement it is paid in. The calculation assumes prices rise 2.5% a year and the answer says so. The market-history test beside the number uses each sequence's actual inflation instead.
- **Holdings-based projection** (`src/openai/retirement-income.ts`). The context planner extracts Social Security and a pension from the decision. The projection resolves them as above, runs the engine with them, and stores them with the analysis, so a cached run is reused only when its incomes match.
  - **What-ifs.** A what-if inherits the baseline's incomes. When the pension's start was only ever "when you retire", it moves with a what-if's retirement age.
  - **Disclosure and facts.** The disclosure names each income and its origin, or says that none is counted. The fact pack publishes each income and the first-year portfolio withdrawal.

## Claiming age

A Social Security benefit belongs to an age: claimed earlier it pays less, claimed later it pays more. Without that rule, "what if I claim at 70?" kept the amount and only started it later, so claiming later always looked worse. Every calculator now moves a benefit to the age it is claimed at by Social Security's own rules (`src/services/social-security-claiming.ts`). The application does the arithmetic; the model still never estimates a number.

**The rules.**

- **Full retirement age** comes from the birth year the user's current age implies: 66 for 1943–1954, rising two months a year to 67 for 1960 and later. Around a birthday that birth year can be a year off. That only matters for someone born 1955–1960, and only by two months.
- **Claiming early** costs 5/9 of 1% a month for the first 36 months before full retirement age and 5/12 of 1% a month beyond that, back to 62.
- **Claiming late** earns 2/3 of 1% a month after full retirement age, up to 70.
- **Not modeled.** Spousal benefits follow other rules. A couple's survivor keeps the larger of their two benefits (`docs/RETIREMENT_HOUSEHOLD.md`).

At a full retirement age of 67, $30,000 a year becomes $21,000 at 62 and $37,200 at 70.

**The age a figure is for.** A Social Security figure is for, in order:

1. the age the user names for it, such as "my statement shows $2,500 a month at 67". The planner records that as `socialSecurityAmountAge`, and only when the user says it;
2. for a comparison that only moves the claiming age, the age the main case's figure was for, so "what if I claim at 70?" moves the same benefit;
3. for a figure from Your numbers, the start age saved beside it, or 67 when none was saved;
4. otherwise the age it is claimed at, which leaves it as stated.

A comparison that states its own amount, or the age its figure is for, is taken as stated.

**When nothing moves.** The benefit is left as it is when the claiming age is already in the past, when either age is before 62 (that is a disability or survivor benefit, not a retirement benefit), or when both ages are at or past 70. A holdings what-if also refuses to move a benefit whose plan start age is already at or before today (already being paid). The age a figure is for may be in the past — a statement's reference age is not proof that payments have begun — so a 68-year-old whose statement quotes a benefit at 67 still earns delayed credits by claiming at 70.

**In the answer.** When a benefit moves, the disclosure names both amounts, both ages and the full retirement age it used. The fact pack publishes the moved amount, the change in percent, and the figure as given, relabelled with the age it is for. Variant labels read "Claiming Social Security at 70".

**Saving.** Your numbers keeps a benefit beside the age it starts. The save offer for a moved benefit is therefore the amount at the claiming age, together with that age. Saving the figure as given beside the new age would later read as the benefit at that age.

**Each calculator.**

- **Stated plan and Coast FIRE.** Both read `socialSecurityAmountAge` and move the benefit, in the straight line and in the market-history test.
- **Holdings-based projection.** The baseline moves a figure the user gave for another age. A what-if can set `socialSecurityStartAge`, and the baseline's benefit moves from its own start age to that one. The what-if is reported as unavailable, not run as no change, when the plan has no Social Security, when the benefit is already being paid, or when the claiming age is already past.
- **Planner boundary.** The planner's retirement inputs withhold a claiming age only when it equals a what-if's. "I get $30,000 at 62; what if I wait until 70?" keeps 62 as the plan. Withholding it would leave the benefit on the default 67 before the what-if moved it.

## Not yet

- **Spousal benefits.** A partner's own Social Security and pension are counted, with the joint horizon and the survivor years (`docs/RETIREMENT_HOUSEHOLD.md`). A spousal benefit, paid on the other's record, is not.
- **Earnings history.** The benefit is what the user states, or what they saved. Nothing estimates it from earnings.
- **Other holdings what-ifs on income.** A holdings-based what-if can move the claiming age. It cannot change a benefit's amount or the pension.
