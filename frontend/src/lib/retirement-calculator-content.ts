/**
 * Evergreen copy for /retirement-calculator.
 *
 * The page's crawlable body is otherwise a headline and a form: the results,
 * limitations and methodology only exist after a visitor runs the model, so a
 * crawler never sees them. This is the content that is always in the HTML.
 *
 * The FAQ lives here rather than in the component because the FAQPage
 * structured data on the page is generated from this same array. Rich results
 * require the answer in the markup to match the answer in the schema, and a
 * second copy of the text is how that stops being true.
 *
 * Every claim below is a claim the engine actually makes — see
 * `src/services/retirement-quickplan.ts` for the assumptions and limitations
 * the model reports for itself.
 */

export type RetirementCalculatorFaq = {
  question: string;
  answer: string;
};

export const RETIREMENT_CALCULATOR_FAQ: RetirementCalculatorFaq[] = [
  {
    question: 'How much do I need to retire?',
    answer:
      'There is no single number. It depends on what you spend, when you stop working, what other income arrives and when, and how markets behave in the first decade after you retire. This calculator works the question backwards: you give it your spending, investments, contributions and Social Security estimate, and it reports how many historical retirements that plan survived and what level of spending the same history was willing to fund.',
  },
  {
    question: 'Is the 4% rule still a safe withdrawal rate?',
    answer:
      'The 4% rule came from US historical data and a 30-year retirement, so it is a starting point rather than a guarantee. This model does not apply a fixed rate. It withdraws the spending you entered, adjusts it for inflation every year, and reports both the share of historical retirements the portfolio survived and the sustainable spending that history supports for the asset mix you picked.',
  },
  {
    question: 'What is sequence-of-returns risk?',
    answer:
      'Two retirements with the same average return can end very differently depending on when the bad years arrive. Withdrawals taken during a decline sell more shares and leave less invested to recover, so an early crash does lasting damage that a late one does not. That is why this calculator replays overlapping windows of real market history from 1926 onward instead of applying one average return. Every window has to cover your whole plan with complete data, so how far forward the start dates reach depends on your horizon, and the result names the first and last it tested.',
  },
  {
    question: 'Is this a Monte Carlo retirement simulation?',
    answer:
      'No. Monte Carlo draws random returns from an assumed distribution. This model replays actual month-by-month US market history across every overlapping retirement window the record is long enough to cover, so each result is a sequence markets really produced. Those windows share most of their history, which means they are not independent trials, and the page says so with the result.',
  },
  {
    question: 'Does the calculator include Social Security?',
    answer:
      'Yes. You enter the annual benefit from your ssa.gov statement and the age you plan to claim it. The model treats that benefit as inflation-indexed income starting at that age and uses it to reduce the withdrawal from your portfolio. Any years between retiring and claiming are funded by the portfolio alone.',
  },
  {
    question: 'What does this retirement calculator not model?',
    answer:
      'Taxes, account types, required minimum distributions and Roth conversions are not modeled. Neither are fund fees, health insurance before Medicare, one-off expenses, changes in spending through retirement, home equity, or pensions other than the income you enter. Your asset mix is one of three presets rather than your real holdings. Every result lists these gaps rather than hiding them.',
  },
  {
    question: 'Is it free, and do I need an account?',
    answer:
      'It is free and there is no sign-up. Nothing you type is saved; the six numbers are used for that one calculation. Connecting your real accounts to Ask Linc is what replaces the estimates with your actual holdings, spending, debts and income.',
  },
];
