# A partner in the plan

Every retirement calculator used to plan for one person: one age, one horizon, one Social Security benefit. A couple's plan differs in four ways that change the answer, and `src/services/household.ts` decides each of them once for all three calculators:

- **Their incomes.** The partner's Social Security, moved by the same claiming rules as the user's, and their pension, each starting at the partner's own age.
- **The joint horizon.** Each partner plans through their own age. The plan runs until the later of the two, so with a younger partner it runs past the user's own planning age.
- **The survivor years.** When the first of them reaches their planning age, their own Social Security and pension stop. Spending stays what the couple spent unless the user says what one of them would spend alone.
- **What Social Security pays a married couple.** The lower earner can be paid a spousal benefit on the other's record, and the survivor a survivor benefit on the record of the first to die. Neither is paid to a couple who are not married, so neither is counted until Linc knows they are (see "Spousal and survivor benefits" below).

Savings, contributions and spending are the household's as the user states them. Nothing splits them between the two.

## Where the partner comes from

The context planner extracts the partner once, in its retirement inputs (`partnerAge`, `partnerSocialSecurityAnnual`, `partnerSocialSecurityStartAge`, `partnerSocialSecurityAmountAge`, `partnerPensionAnnual`, `partnerPensionStartAge`, `partnerPensionInflation`, `partnerPlanThroughAge`, `survivorAnnualSpending`, `partnerMarried`). Every partner age is the partner's own. The calculators' own override fields never carry a partner's figure, except the age they claim Social Security as a what-if (below). `snapshot.statedPartner` carries the extraction to all three calculators, and `retirementInputsForBaseline` never withholds it for a what-if on the user's plan.

Each figure resolves the way the user's own do: the current decision, then Your numbers, then a named default, and a term is only defaulted for an income the partner has.

| Term | Default | Why |
| --- | --- | --- |
| Partner's Social Security start age | 67, their age | Full retirement age for anyone born after 1959. Resolved even with no benefit of their own, for when a spousal benefit would start |
| Partner's pension start age | The household's retirement: the user's retirement age, at the partner's age then | Most pensions start when work stops |
| Partner's pension inflation | Fixed | Overstating future income is the costlier mistake |
| Each partner's planning age | 95 | The same convention as the user's |
| Spending after the first death | Unchanged | Nothing says it falls, and assuming it does would flatter the plan |

A partner's age is never assumed. When anything that would change the plan is known about a partner (an income, their planning age, what one of them would spend alone) but their age is not, the calculators run the user's own plan and the answer asks for the age, in words and with a one-field form (`partnerAgeInputRequest`). That form is the stated plan's, Coast FIRE's or, for the holdings-based projection, the pipeline's. A form that is still waiting on the user's own figures adds the partner's age to its fields as optional (`withPartnerAgeField`), so one reply can supply both.

A partner's Social Security figure is moved to the age they claim it by the same rules as the user's (`src/services/social-security-claiming.ts`), on the full retirement age the partner's own age implies. See "Claiming age" in `docs/RETIREMENT_INCOME.md`.

## The timeline

The engines run on the user's age, so everything is converted to it: a partner three years younger who claims at 67 is income from the user's 70 (`householdTimeline`).

- **Horizon.** The later of the two planning ages, on the user's age.
- **First death.** The earlier of the two. When both reach their planning age in the same year, nothing changes before the plan ends.
- **The first death** (`householdIncomes`). Each one's own Social Security stops when they reach their planning age, and so does a pension. A married couple's spousal benefit stops then too, and the survivor's benefit begins. An income that would stop before it starts is never paid, and is left out.
- **Survivor spending.** When the user says what one of them would spend alone, the engine spends that from the first death (`RetirementAnalysisInput.survivorSpending`). The simulator scales whatever the withdrawal policy has made the couple's spending by then by the same ratio, so it composes with every policy.

## Spousal and survivor benefits

Social Security pays a married couple more than two single people (`householdSocialSecurity`), and only a married couple: an unmarried partner has no claim on the other's record.

**Whether they are married** (`resolveMarriage`) comes from what the user says in the decision (the planner's `partnerMarried`: yes when they say they are married or call their partner their husband, wife or spouse; no when they say they are not, including a boyfriend, girlfriend or fiancé; otherwise unspecified, because "partner" alone does not say), then Your numbers (`partnerMarried`), then the household status Linc remembers (`married` is married, `partnered` is not). When none says and being married would pay more, every calculator counts neither benefit, says so in the answer, and carries a one-field form asking (`partnerMarriageInputRequest`). Marriage is never assumed.

Each benefit is worked out from a **full-retirement-age benefit** (the primary insurance amount), not the amount a claiming age made of it: a benefit claimed at another age is divided by its claiming factor on its holder's own birth year (`primaryInsuranceAmount`).

- **Spousal benefit.** The lower earner is paid half the other's full benefit, less their own full benefit. It starts once both have claimed (applying for one benefit is applying for both) and never before 62. Started before the lower earner's full retirement age it is reduced 25/36 of 1% a month for the first 36 months and 5/12 of 1% beyond; it earns nothing for waiting past it (`spousalFactor`). It stops at the first death. When nobody has said what the lower earner's own benefit is, it is counted as none and the spousal benefit is disclosed as the least they would be paid: with any benefit of their own, they would be paid at least as much.
- **Survivor benefit.** From the first death the survivor is paid what the deceased was paid, or would have been: their full benefit if they died before claiming, with any delayed credits earned by then. Taken before the survivor's own full retirement age for survivors (`survivorFullRetirementAgeMonths`, a table two years behind the retirement one), it is reduced in proportion, to 71.5% at 60 (`survivorFactor`); it cannot start before 60. If the deceased claimed early, it is worked out from their full benefit, then capped at the larger of what they were paid and 82.5% of their full benefit. The survivor is paid the larger of this and their own benefit, so the engine counts the part above their own, and the whole survivor benefit until their own starts if it starts later.

The survivor is assumed to claim the survivor benefit as soon as they can. The summary of what was counted rides beside the incomes as `socialSecurity` (`HouseholdSocialSecurity`): each one's full benefit, the spousal and survivor benefits, and whether the marriage was unknown.

## Each calculator

- **Holdings-based projection** (`src/openai/context-service.ts`). The run's `lifeExpectancy` is the household horizon. The user's own planning age is stored beside it as `userPlanThroughAge`, and that is what a later run reads back, or the horizon would grow with every run. A cached run is reused only when its incomes, horizon and survivor spending match. The resolved partner and timeline ride on the analysis as `_household`.
  - **What-ifs** (`src/scenarios/retirement-scenario.ts`). Every what-if works the couple's Social Security out afresh from the user's own streams (`rebuildHouseholdStreams`): claiming later changes when a spousal benefit starts and what a survivor is paid, and a planning-age what-if moves the first death. A partner's pension that only ever started at the household's retirement moves with a what-if's retirement age.
- **Stated plan and the quick plan** (`src/scenarios/stated-retirement-plan-scenario.ts`, `src/services/retirement-quickplan.ts`). `runRetirementQuickPlan` takes an optional household: the partner, where their figures came from, the marriage, and when the user claims. The public calculator plans for one person and never sends one. With a household, the run spends to the joint horizon on every income, spousal and survivor benefits included, with survivor spending. Its "spend 10% less" lever lowers the survivor's spending by the same share, and a `rates` run, which has no spending level, counts none. The result's `household` carries the timeline, every income it counted, and what Social Security pays the couple.
- **Coast FIRE** (`src/scenarios/coast-fire-scenario.ts`, `coast-fire-income.ts`). The partner's incomes join the user's in the straight line, valued through the joint horizon:
  - an income that stops before the plan ends is counted at the level amount with the same value as the years it pays;
  - a survivor benefit is counted at the level amount with its value over the whole retirement, not as a late income with a reserve to bridge to it: it replaces a benefit that stops;
  - a survivor's lower spending is counted as the level spending with the same value over retirement, and the answer names both figures;
  - the market-history test runs the quick plan with the household.

## What-ifs on the partner

"What if my partner claims at 70?" runs in every retirement calculator from one override, `partnerSocialSecurityStartAge`, at the partner's own age. It is a comparison field, never the plan: the planner's retirement inputs keep the age the partner plans to claim, and are told never to carry one the user only asks about as a what-if. When the planner reads the what-if into both anyway, the holdings pipeline withholds the partner's claiming age from the baseline only when it equals a variant's, as it does the user's own (`retirementInputsForBaseline`).

`partnerClaimingAt` (`src/services/household.ts`) moves the partner the way the user's own benefit moves: their own benefit from the figure as given, at the age it is for, by Social Security's claiming rules on the partner's birth year; with none of their own, only the age a spousal benefit would start. The couple's spousal and survivor benefits are then worked out afresh, so claiming later also raises what a survivor is paid on the partner's record.

- **Holdings what-if** (`src/scenarios/retirement-scenario.ts`). A variant sets it alongside any other override. The result carries `partnerClaiming` (both amounts and ages), its facts (`_partner_social_security_at_claiming_age`, `_before_claiming_change`, `_claiming_change`), and the disclosure names it.
- **Stated plan and Coast FIRE.** The comparison sets it; the main case keeps the partner as the decision and Your numbers say. The case is labelled "Your partner claiming Social Security at 70", its household carries the moved benefit into its facts, and the market-history test runs it with that household.

The answer states the move with both amounts: "If your partner claims at 70 instead of 67, their Social Security of $24,000 a year becomes $29,760 by Social Security's own rules (a credit for each month after full retirement age, which I took as 67 from their age)." The move is measured from the age and amount the main case plans on (`claimingChange`), not from the figure as given: a partner whose $24,000 is for 67 but who plans to claim at 62 is moved from $16,800 at 62, and a what-if back to 67 is a move too. A what-if with no partner to plan for says it needs their age; one whose partner has no benefit of their own and is not known to be married says it would change nothing and asks for the benefit. Like the user's own, a benefit the plan already has the partner being paid, or a claiming age already behind them, is not moved. The holdings what-if reports these as unavailable, and the stated plan and Coast FIRE as a comparison they could not run, keeping the main case; when the what-if lands on the main case itself, they refuse it the way the holdings what-if does. A what-if's claiming age is never offered for Your numbers.

## In the answer

Each partner income is named at both ages ("from their 67 (your 70)"), with when it stops, any claiming rule, and which terms were assumed or saved. A spousal benefit is named with whose record it is on, when it starts, whether it was reduced, and whether it is only the least they would be paid. The disclosure also gives the timeline: the partner's age, how Linc knows they are married when that came from Your numbers or memory, who reaches their planning age first, and what changes then: the survivor's Social Security becoming the survivor benefit (with any reduction or early-claim cap), or, for a couple not known to be married, each benefit stopping with its holder. The wording is shared (`src/openai/household-evidence.ts`), so a couple's plan reads the same whichever calculator answered.

The fact pack publishes each of the partner's incomes, with its start age at both ages, and the end age of any income that stops. For a married couple it also publishes each one's full-retirement-age benefit, the spousal benefit and the user's age it starts at, and the survivor benefit and the user's age it starts at (`householdSocialSecurityFactRows`). It also publishes the partner's age and planning age, the user's age when the plan ends, the user's age at the first death, and the survivor's spending. Every age a value is on is named in its label. Holdings facts are prefixed `retirement_`, and each scenario's facts carry the scenario's prefix.

## Your numbers

The page has a "Your partner" section: `partnerAge`, `partnerMarried` (`married` or `not_married`), `partnerSocialSecurityAnnual`, `partnerSocialSecurityStartAge`, `partnerRetirementIncome`, `partnerRetirementIncomeStartAge`, `partnerRetirementIncomeInflation`, `partnerPlanThroughAge` and `survivorAnnualSpending`. A saved partner's age is not advanced with time, like the user's remembered age, so the gap between them stays as it was saved.

"Use these next time?" offers the partner's figures the user stated in this decision, from the stated plan or Coast FIRE (`partnerSavableFigures`), and whether they are married when the user said. A benefit moved to another claiming age is offered as paid there, with that age.

## Not yet

- **A pension's survivor share.** A joint-and-survivor pension keeps paying part of itself to the survivor. A pension stops with its holder here.
- **Other what-ifs on the partner.** Their claiming age has a what-if (above). Their pension, planning age and benefit amount do not: those are the plan's, the same in every case.
- **When a survivor claims.** The survivor benefit starts as soon as it can. Waiting to the survivor's full retirement age, or taking one benefit early and switching to the other later, is not compared.
- **Divorced and caregiving spouses.** A divorced spouse married ten years can claim on an ex-spouse's record, and a survivor caring for a young child can claim before 60. Neither is modeled.
- **Exact birth dates.** Full retirement age is read from the birth year an age implies, as the claiming rules are.
