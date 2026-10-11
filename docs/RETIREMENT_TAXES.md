# Fees, taxes and health premiums

A retirement plan pays for more than what the household spends: fund fees come out of returns, income tax comes out of every withdrawal from a pre-tax account, and until Medicare a household buys its own health insurance. Every retirement calculator that runs the historical engine now counts all three, with every rule and figure in application code and every input disclosed.

On the real engine, $1,000,000 at 60 on the balanced preset, retiring at 62 on $60,000 a year with $30,000 of Social Security from 67, lasts through 95 in 100% of historical sequences untaxed. Counted as a single filer with everything pre-tax, it lasts in 98%: the first year draws $65,705 to spend $60,000 after $5,705 of federal tax. Add a marketplace plan before Medicare and it lasts in 85%: the first year draws $87,218, because the income needed to pay tax and premiums takes the household past 400% of the poverty line, where the premium tax credit stops, and a 62-year-old's benchmark premium is $16,860. The same plan held 30% taxable, 50% pre-tax and 20% Roth stays under that line: no federal tax, $2,900 of premiums after a $13,961 credit, and it lasts in 96%. A 5% state tax on top of the all-pre-tax case brings it to 79%.

## Fund fees

`annualFeeRate` (`src/retirement-analytics/engine/withdrawal-simulator.ts`) takes the holdings' weighted expense ratio out of each month's return, so a year of it is exactly the annual rate. It comes from the funds whose expense ratio is known; the rest of the portfolio is counted as costing nothing, and the answer says what share that is ("fund fees of 0.12% a year taken out of returns, from the expense ratios of 85% of your holdings; the other 15% is counted as costing nothing"). It applies to the projection and to the sustainable-rate solver alike. The quick plan's preset mixes have no tickers, so the stated plan and Coast FIRE carry no fee and say fund fees are not modeled. Analysis version 13.

## The engine

`src/retirement-analytics/engine/taxes.ts` and `engine/healthcare.ts` hold the rules, each figure sourced and dated; refresh them every year with the new revenue procedure and premium notices.

- **Federal income tax, 2026** (Rev. Proc. 2025-32): the brackets, the standard deduction ($16,100 single, $32,200 joint) and the extra deduction from 65 ($2,050 single, $1,650 each joint). Pre-tax withdrawals and a pension are ordinary income. Gains realized in a taxable account are taxed at 0%, 15% and 20% on top of ordinary income, with the 3.8% net investment income tax above $200,000 / $250,000. Social Security is counted by its own provisional-income formula: none, up to half, then up to 85%. Roth withdrawals are tax-free.
- **Held level in today's dollars.** The brackets, deduction and gain bands are indexed, so in today's dollars the 2026 figures serve every simulated year. Social Security's base amounts and the NIIT threshold are written into law in nominal dollars and never indexed; the engine shrinks them by each year's price level, which is how more of a benefit becomes taxable over a long retirement. The temporary $6,000 senior deduction (2025 to 2028) is not counted.
- **Required minimum distributions** from 73 (born 1951 to 1959) or 75 (born 1960 or later), on the Uniform Lifetime Table, from the pre-tax account whatever the year needs. What the year does not need is reinvested in the taxable account after tax. The owner is the user while alive, then the survivor.
- **Health premiums** (`engine/healthcare.ts`), per person, from the first withdrawal. From 65, Medicare Part B ($202.90 a month) and Part D's base premium ($38.99), 2026. Before 65:
  - **Marketplace**: the national average benchmark (second-lowest-cost silver) premium, $625 a month at 40 (KFF, 2026), on the federal default age curve, less the **premium tax credit** that year's income earns: the benchmark less an applicable percentage of income, 2.10% to 9.96% by income as a multiple of the poverty line, and nothing above 400% now the enhanced credits have ended (Rev. Proc. 2025-25; 2025 poverty guidelines).
  - **COBRA**: the average employer premium for single coverage, $9,325 a year (KFF 2025) plus the 2% COBRA allows, for 18 months, then the marketplace.
  - **Retiree coverage from an employer** and **a spouse's employer plan**: no premium unless the user says what it costs.
  - A premium the user states replaces the computed one.
  Premiums only: deductibles, copays, Medigap, long-term care and Medicare's income-related surcharges are not counted, and premiums are held level in today's dollars though they have tended to rise faster than prices.

### A year of cash

`src/retirement-analytics/engine/retirement-cash-plan.ts` plans each withdrawal year at its start, in today's dollars. Taxable money is drawn first, then pre-tax, then Roth; a required distribution comes out of pre-tax money whatever the order would take. Tax and the premium credit depend on the draw, so the draw is solved: the smallest draw whose cash, after tax and premiums, covers the year's spending (bisection to a hundredth of a cent). Where losing the credit at 400% of the poverty line costs more than a dollar, the search settles past the cliff, which is what a household in that position would pay. An unmarried couple files two single returns, each on half the household's income.

The simulator (`withdrawal-simulator.ts`) pays the planned year monthly in each month's dollars, falling back to the next account when one runs dry, and a year the accounts cannot cover depletes the portfolio. The three accounts hold the same mix and grow with the portfolio; contributions are added pro rata. Without taxes or premiums the simulator runs exactly as before, and the cost is about 10% more time per run.

Each run reports the first withdrawal year's federal tax, state tax, premiums and premium credit, each the median across sequences (`firstYearCosts`). The sustainable withdrawal rates (`historicalWithdrawalRates`, the quick plan's `sustainableSpending`) are solved on withdrawals alone and stay before tax and premiums; their facts and the stated plan's `rates` answer say so.

## Where the inputs come from

`src/services/retirement-taxes.ts` and `src/services/retirement-healthcare.ts`, the same in every calculator:

- **How the savings are held.** For linked holdings, each account's own type (`accountTaxTreatment`): a 401(k), 403(b), 457, traditional or rollover IRA, TSP or pension is pre-tax; a Roth IRA or Roth 401(k), an HSA, a TFSA or an ISA is Roth; a brokerage, trust, custodial, stock-plan or 529 account is taxable. A generic subtype falls back to the account's name, and a Roth filed under `ira` (as SnapTrade accounts were until it got its own subtype) is still a Roth. Cost basis comes from the holdings; a taxable holding with none on record counts as all gain. Money whose account does not say, and a plan with nothing linked, take the split the user stated in this decision (`pretaxSavings`, `rothSavings`, `taxableSavings`, or the same as percents, read against the plan's total), then Your numbers (`rothSavingsPercent`, `taxableSavingsPercent`; pre-tax is the rest), then **all pre-tax**: the common case for retirement savings and the most heavily taxed, so an unknown split errs toward more tax, never less. Anything the user did not place is counted as pre-tax and the answer says how much.
- **Filing.** Married (`services/household.ts`, which never assumes it) files jointly; an unmarried couple, and a couple whose marriage nobody has stated, files two single returns. Whoever outlives the other files single.
- **State.** A rate the user stated (`stateIncomeTaxPercent`, up to 15%), then Your numbers; none in the nine states without an income tax on wages or retirement income (Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas, Washington, Wyoming), read from the state Linc remembers; otherwise not counted, disclosed, and asked. State tax applies to pre-tax withdrawals, pensions and gains at one flat rate; Social Security is exempt.
- **Coverage.** The planner's `preMedicareCoverage` (`marketplace`, `cobra`, `employer_retiree`, `spouse_plan`) and `preMedicareAnnualPremium`, then Your numbers, then the marketplace, assumed and asked. Coverage is only asked about when someone in the plan starts withdrawals before 65.
- **Whether spending already includes it.** `healthcareInSpending`: yes means no premium line at all, so nothing is counted twice; otherwise premiums are added on top, assumed and asked when unsaid.

`snapshot.statedAccountSplit`, `statedStateTaxPercent` and `statedHealthcare` carry the planner's reading to every calculator; `investments.accountTaxMix` carries the linked holdings' split.

## Each calculator

- **Holdings-based projection** (`src/openai/context-service.ts`). The run takes `taxes`, `healthcare` and, with a partner, `people` (each person's age and planning age). All three are in the stored input and the seven-day cache match, compared field by field because a jsonb column returns keys in its own order. The resolutions ride on the analysis as `_taxes` and `_healthcare`.
  - **What-ifs** (`src/scenarios/retirement-scenario.ts`) inherit the baseline's taxes and premiums, so a variant is never credited with the difference between a taxed baseline and an untaxed run; a what-if that moves a planning age moves `people` with it.
- **Stated plan** (`src/scenarios/stated-retirement-plan-scenario.ts`, `src/services/retirement-quickplan.ts`). The quick plan's third argument (`QuickPlanOptions`) takes `taxes` and `healthcare` beside the spending cut, the same in every case; they are in its cache key and the case's id. The public calculator never sends them, and its page keeps saying taxes are not modeled.
- **Coast FIRE** (`src/scenarios/coast-fire-scenario.ts`). The market-history test counts both; the straight-line number counts neither, and the answer says so.

## In the answer

The wording is shared (`src/openai/tax-healthcare-evidence.ts`):

- The assumptions list names the rules, the filing status, the split and where it came from, the state's rate or why there is none, the coverage before 65 and Medicare's premiums, marking each assumed input "(assumed)".
- A sentence reports the first withdrawal year's federal and state tax and premiums after any credit, medians in today's dollars. Coast FIRE says it once for every case's test.
- A closing sentence asks for whatever was assumed: the split, the state's rate, the coverage, whether spending includes premiums.
- **A form** (`taxAndHealthcareInputRequest`) asks the same, every field optional, after a run that stood without them: the holdings projection, the stated plan and Coast FIRE each carry it when they have no partner to ask about first. A stated plan waiting on the user's own figures adds these fields to its form, as defaults. The client shows a form of optional fields open rather than behind "More assumptions".
- **Facts** publish the split, the state rate, Medicare's premium, a stated premium, and the first year's tax, premiums and credit, each with the calculator's prefix (`retirement_tax_*`, `history_tax_*` in Coast FIRE). A fact the model may quote is a number it may write, so every tax figure in an answer is one of these.
- **Your numbers** has a "Taxes and health coverage" section for all six figures, and "Use these next time?" offers what the user stated: the split only when they placed all of it.

## Not yet

- Roth conversions, tax-loss harvesting, withdrawal-order optimization, and qualified charitable distributions.
- State rules beyond one flat rate: brackets, retirement-income exclusions, and the states that tax Social Security.
- Medicare's income-related surcharges (IRMAA), Medigap, deductibles, out-of-pocket costs and long-term care.
- Healthcare costs rising faster than prices.
- A taxable account's dividends and interest each year; only sales are taxed.
- The public calculator's runs, and a calculator lead's first decision written from them, are untaxed. A follow-up in Ask Linc runs taxed, so its figures can differ from the first answer's.
