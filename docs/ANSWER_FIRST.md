# Answer first

Ask Linc always gives the most useful answer it can with what it has: the user's linked data, the figures they have stated anywhere in the decision, and named, disclosed assumptions. A missing link or input changes what an answer is based on, never whether there is one. Each answer closes on what one specific link would change about it.

This holds for every user: linked or not, partly linked, arriving from a calculator or not.

## The rules

1. **Not linked is not zero.** A total for a kind of account nobody linked describes an empty connection, not the user. It is never quoted as their balance, income or spending, and no calculator reads it as one.
2. **Lead with the answer.** The model answers from the facts, the user's own figures and sound general principles. It never opens with what it cannot see and never replies only that something is missing. A figure that would sharpen the answer is named briefly, after it.
3. **Assume out loud.** Where an input is missing and something real can stand in for it, the application fills it and says so in the answer. The model never estimates a figure itself: every number still comes from a fact.
4. **Close on the upgrade.** The application appends one note naming the account to link and what it would change, specific to what the question needed. The model does not write its own "link your accounts" line.

## How each rule is enforced

### Linked data (`src/openai/linked-data.ts`)

`gatherContextSnapshot` always reads the account list (it is small) and records counts by kind in `snapshot.linkedData`: cash, credit, loans, investments, itemized holdings, and months of transaction history. Account details still reach the answer only when the plan asks for them.

- **Fact pack.** With nothing linked, no balance totals are published. With some kinds unlinked, a zero total for an unlinked kind is dropped, and net worth is labelled "across linked accounts only (no … linked)". A nonzero total is real money from somewhere and always stays.
- **Cash flow.** Income is read only from cash accounts, since a paycheck never lands on a card. Spending is read from cash accounts or cards. With nothing to read a side from, the observed average and the forecast's expected month are null, never zero. A figure the user set themselves is kept either way. The side also comes out of the monthly history (net with it, since net needs both sides) and, for spending, the category totals. With no cash account, the forecast publishes no income or net: its spending, cards and the user's own plans stay.
- **Prompt.** A short "What the User Has Linked" block says what is not linked, and the reviewer gets the same statement. The reviewer's overview shows the same totals as the fact pack (`linkedOverview`), so it is never told both that a zero is not the user's and that it is.
- **Uncertain snapshots.** A snapshot that carries data but no account list keeps the behavior that predates the record. The record only claims "nothing linked" when that is plainly true.

### Balances the user entered

A balance entered by hand on the Finances page (a manual account) is not linked. It is the user's own figure, so a total built on it describes the user, but nothing reports transactions or holdings behind it. `describeLinkedData` counts these accounts under `linkedData.entered`, by kind, and leaves them out of the linked counts. It recognizes them the same way snapshot persistence does: `source: 'manual'`, a `manual-` account id, or the institution "Manual".

- **Fact pack and reviewer.** A total of a kind that is linked or entered is shown, so a user with only entered balances still sees their totals. Where an entered balance is part of a total, the label says so: "Total investments (entered by the user, not linked)", or "(linked accounts plus balances the user entered)". Net worth names what it is built from and what it leaves out ("Net worth from balances the user entered, with nothing linked (no cash accounts entered)").
- **Prompt.** The "What the User Has Linked" block says which balances the user entered, and tells the model to call them that and never a linked or connected account.
- **Cash flow.** An entered cash balance has no paycheck behind it, so it never makes income readable, even beside a linked card.
- **Calculators.** Coast FIRE and the stated retirement plan still fall back to the investment total when the user does not state their savings, and record whether it came from linked accounts, entered balances or both (`basis` on the assumption). The disclosure then says "the $500,000 of investments you entered" rather than "your connected investment total". A monthly spending figure the user set on the Finances page is described as theirs, not as what linked accounts show. Home affordability reads entered cash as available purchase cash and names its source as "Cash balances the user entered".
- **Closing note.** An entered balance does not stop the note: linking is still the upgrade. Where one was used, the note says linking replaces it ("in place of the balance you entered", "instead of the balances you entered"), and the no-holdings retirement note does not ask again for an amount the user already entered.

### The answer prompt (`src/openai/financial-reasoning-prompt.ts`)

An "Answer first" section replaces the old instruction to "explain what is missing instead of estimating it". Grounding is unchanged: the model still may not estimate, compute, or cite a number that is not a fact.

### The user's own figures

Numbers in the user's earlier messages in the same decision are `user_input` facts, alongside the current message's. Only the user's own messages count, never a prior answer. A balance stated in the first message can be repeated in the third.

### Assumptions in place of asks

| Path | Missing input | What stands in | How it is disclosed |
| --- | --- | --- | --- |
| Holdings-based retirement projection | Retirement age | 65, or now for someone past it | "a conventional age I assumed because you did not name one" |
| Holdings-based retirement projection | Retirement spending | The user's earlier figure, then current spending from cash flow | "the figure you gave me before" / "which is what you spend now (I assumed retirement costs the same)" |
| Stated retirement plan | Retirement age | 65, or now | "You did not name a retirement age, so I used 65." |
| Stated retirement plan | Spending | Current spending from cash flow; otherwise what the mix sustained, instead of a verdict | Named in the plan's disclosure |
| Coast FIRE | Retirement age | 65, while still ahead of the user | Named in the disclosure |
| Coast FIRE | Spending | Current spending from cash flow | Named in the disclosure |
| Home affordability | Cash, income, spending | Stated take-home pay, spending and cash; an unlinked zero is unknown, never a shortfall | Assumption ledger and disclosure |

Current age, how much someone has invested, and (for Coast FIRE) spending with nothing to read it from are still asked for. Nothing the application holds can stand in for them.

An assumed retirement input is persisted with the analysis under `assumedInputs`. It is stripped before the next resolution, so an assumed 65 or last month's spending is never read back as the user's plan. A withdrawal start age that followed an assumed retirement age goes with it; one the user named apart from it stays. A figure the user gave in an earlier conversation is theirs and is not listed there. Fact labels mark assumed inputs ("assumed: equal to the user's current annual spending"), so the model cannot present them as something the user said.

### The closing note (`src/openai/missing-inputs.ts`)

At most one note, the most specific that applies:

- A spending or cash-flow question with no checking account or card linked. With only a card linked, the note asks for the income side.
- An investment question with no brokerage or retirement account linked.
- A retirement question with no holdings: the notes in `docs/SCENARIO_MODELING.md` ("Before anything is linked"), which name the preset the calculators used.
- Otherwise, a question about the user's own money with nothing linked at all.

Every case needs the context planner's `personalDataQuestion` flag. "What is my net worth?" selects no optional pack, because the totals are always present, so packs alone cannot tell it from "What is a Roth IRA?". The planner decides from meaning; a plan without the flag reads as personal. When the planner fails, the fallback plan selects every pack and knows nothing about meaning, so it sets the flag false and the answer closes on no note rather than a wrong one.

Debt is never raised. No linked card or loan is as likely to mean no debt as unlinked debt. Nothing is said for an account that is linked but has not reported yet, since the user cannot act on that.

## Measuring it

The deterministic Ask Linc eval (`npm run eval:llm`) covers:

- a user with nothing linked getting an answer from their own figures, no $0 facts, and the closing note;
- retirement inputs filled from current spending and the conventional age and marked as assumptions;
- no spending level invented when there is nothing to read it from;
- the Coast FIRE calculator follow-up with nothing linked.
