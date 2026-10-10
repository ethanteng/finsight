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

## Not yet

- **Claiming age.** Social Security is the amount the user states for the age they state. A what-if that changes the claiming age keeps the amount, so claiming later looks worse than it is. Rescaling the benefit by SSA's rules is the next change.
- **Couples.** A spouse's benefit and survivor benefits are not modeled.
- **Holdings what-ifs.** A holdings-based what-if cannot change the income itself, only inherit it.
