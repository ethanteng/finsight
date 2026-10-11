# A partner in the plan

Every retirement calculator used to plan for one person: one age, one horizon, one Social Security benefit. A couple's plan differs in three ways that change the answer, and `src/services/household.ts` decides each of them once for all three calculators:

- **Their incomes.** The partner's Social Security, moved by the same claiming rules as the user's, and their pension, each starting at the partner's own age.
- **The joint horizon.** Each partner plans through their own age. The plan runs until the later of the two, so with a younger partner it runs past the user's own planning age.
- **The survivor years.** When the first of them reaches their planning age, the smaller Social Security benefit stops and the survivor keeps the larger, as Social Security's survivor rule pays. A pension stops with the person it belongs to. Spending stays what the couple spent unless the user says what one of them would spend alone.

Savings, contributions and spending are the household's as the user states them. Nothing splits them between the two.

## Where the partner comes from

The context planner extracts the partner once, in its retirement inputs (`partnerAge`, `partnerSocialSecurityAnnual`, `partnerSocialSecurityStartAge`, `partnerSocialSecurityAmountAge`, `partnerPensionAnnual`, `partnerPensionStartAge`, `partnerPensionInflation`, `partnerPlanThroughAge`, `survivorAnnualSpending`). Every partner age is the partner's own. The calculators' own override fields never carry a partner's figure. `snapshot.statedPartner` carries the extraction to all three calculators, and `retirementInputsForBaseline` never withholds it for a what-if on the user's plan.

Each figure resolves the way the user's own do: the current decision, then Your numbers, then a named default, and a term is only defaulted for an income the partner has.

| Term | Default | Why |
| --- | --- | --- |
| Partner's Social Security start age | 67, their age | Full retirement age for anyone born after 1959 |
| Partner's pension start age | The household's retirement: the user's retirement age, at the partner's age then | Most pensions start when work stops |
| Partner's pension inflation | Fixed | Overstating future income is the costlier mistake |
| Each partner's planning age | 95 | The same convention as the user's |
| Spending after the first death | Unchanged | Nothing says it falls, and assuming it does would flatter the plan |

A partner's age is never assumed. When anything that would change the plan is known about a partner (an income, their planning age, what one of them would spend alone) but their age is not, the calculators run the user's own plan and the answer asks for the age.

A partner's Social Security figure is moved to the age they claim it by the same rules as the user's (`src/services/social-security-claiming.ts`), on the full retirement age the partner's own age implies. See "Claiming age" in `docs/RETIREMENT_INCOME.md`.

## The timeline

The engines run on the user's age, so everything is converted to it: a partner three years younger who claims at 67 is income from the user's 70 (`householdTimeline`).

- **Horizon.** The later of the two planning ages, on the user's age.
- **First death.** The earlier of the two. When both reach their planning age in the same year, nothing changes before the plan ends.
- **Survivor rule** (`applySurvivorRule`). At the first death the smaller of the two Social Security benefits stops. A pension stops when its holder reaches their planning age. An income that would stop before it starts is never paid, and is left out.
- **Survivor spending.** When the user says what one of them would spend alone, the engine spends that from the first death (`RetirementAnalysisInput.survivorSpending`). The simulator scales whatever the withdrawal policy has made the couple's spending by then by the same ratio, so it composes with every policy.

## Each calculator

- **Holdings-based projection** (`src/openai/context-service.ts`). The run's `lifeExpectancy` is the household horizon. The user's own planning age is stored beside it as `userPlanThroughAge`, and that is what a later run reads back, or the horizon would grow with every run. A cached run is reused only when its incomes, horizon and survivor spending match. The resolved partner and timeline ride on the analysis as `_household`.
  - **What-ifs** (`src/scenarios/retirement-scenario.ts`). A claiming-age what-if re-applies the survivor rule, because claiming later can make the user's benefit the larger one. A planning-age what-if moves the user's own age, and the horizon follows from it. A partner's pension that only ever started at the household's retirement moves with a what-if's retirement age.
- **Stated plan and the quick plan** (`src/scenarios/stated-retirement-plan-scenario.ts`, `src/services/retirement-quickplan.ts`). `runRetirementQuickPlan` takes an optional household. The public calculator plans for one person and never sends one. With a household, the run spends to the joint horizon on every income, with the survivor rule and survivor spending. Its "spend 10% less" lever lowers the survivor's spending by the same share, and a `rates` run, which has no spending level, counts none. The result's `household` carries the timeline and every income it counted.
- **Coast FIRE** (`src/scenarios/coast-fire-scenario.ts`, `coast-fire-income.ts`). The partner's incomes join the user's in the straight line, valued through the joint horizon:
  - an income that stops before the plan ends is counted at the level amount with the same value as the years it pays;
  - a survivor's lower spending is counted as the level spending with the same value over retirement, and the answer names both figures;
  - the market-history test runs the quick plan with the household.

## In the answer

Each partner income is named at both ages ("from their 67 (your 70)"), with when it stops, any claiming rule, and which terms were assumed or saved. The disclosure also gives the timeline: the partner's age, who reaches their planning age first, and what changes then. The wording is shared (`src/openai/household-evidence.ts`), so a couple's plan reads the same whichever calculator answered.

The fact pack publishes each of the partner's incomes, with its start age at both ages, and the end age of any income that stops. It also publishes the partner's age and planning age, the user's age when the plan ends, the user's age at the first death, and the survivor's spending. Every age a value is on is named in its label. Holdings facts are prefixed `retirement_`, and each scenario's facts carry the scenario's prefix.

## Your numbers

The page has a "Your partner" section: `partnerAge`, `partnerSocialSecurityAnnual`, `partnerSocialSecurityStartAge`, `partnerRetirementIncome`, `partnerRetirementIncomeStartAge`, `partnerRetirementIncomeInflation`, `partnerPlanThroughAge` and `survivorAnnualSpending`. A saved partner's age is not advanced with time, like the user's remembered age, so the gap between them stays as it was saved.

"Use these next time?" offers the partner's figures the user stated in this decision, from the stated plan or Coast FIRE (`partnerSavableFigures`). A benefit moved to another claiming age is offered as paid there, with that age.

## Not yet

- **Spousal benefits.** A partner with a small benefit of their own can be paid up to half of the other's at full retirement age. Not modeled yet.
- **A pension's survivor share.** A joint-and-survivor pension keeps paying part of itself to the survivor. A pension stops with its holder here.
- **What-ifs on the partner.** "What if my partner claims at 70?" has no override field of its own yet. The partner's figures are the plan's, the same in every case.
- **A survivor benefit claimed early.** A survivor who claims a survivor benefit before their own full retirement age is paid less. The rule here keeps the larger benefit as it was.
