import { addDays, addMonths, type CalendarDate } from '../../../cash-flow/calendar';

/** Snapshot-shaped accounts: two everyday accounts plus two that must stay out of scope. */
export const ACCOUNTS = [
  { account_id: 'checking', name: 'Everyday Checking', type: 'depository', subtype: 'checking', balance: { current: 5200 }, institution: 'First Bank', mask: '1234' },
  { account_id: 'card', name: 'Rewards Card', type: 'credit', subtype: 'credit card', balance: { current: 1800 }, institution: 'Card Co' },
  { account_id: 'brokerage', name: 'Brokerage', type: 'investment', subtype: 'brokerage', balance: { current: 90000 } },
  { account_id: 'mortgage', name: 'Mortgage', type: 'loan', subtype: 'mortgage', balance: { current: 300000 } },
];

export const CARD_PAYMENT_CATEGORY = { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' };
export const INTEREST_CHARGE_CATEGORY = { primary: 'BANK_FEES', detailed: 'BANK_FEES_INTEREST_CHARGE' };

let sequence = 0;

export function tx(
  accountId: string,
  date: CalendarDate,
  type: string,
  amount: number,
  name: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  sequence += 1;
  return {
    transaction_id: `${name.replace(/\W+/g, '-').toLowerCase()}-${date}-${sequence}`,
    account_id: accountId,
    date,
    amount,
    transaction_type: type,
    name,
    iso_currency_code: 'USD',
    ...extra,
  };
}

/**
 * A household with:
 * - a biweekly $2,500 paycheck every other Friday,
 * - $2,000 rent on the 1st,
 * - a $15.49 streaming charge on the 12th,
 * - groceries every one to six days at varying amounts and stores,
 * - one $2,400 airline purchase,
 * - card payments and a savings transfer, which are neither income nor spending.
 */
export function householdTransactions(from: CalendarDate, through: CalendarDate): Array<Record<string, unknown>> {
  const transactions: Array<Record<string, unknown>> = [];
  for (let pay = '2025-01-03'; pay <= through; pay = addDays(pay, 14)) {
    if (pay >= from) transactions.push(tx('checking', pay, 'income', 2500, 'GUSTO DES:PAYROLL ID:88231 INDN:SMITH'));
  }
  for (let month = '2025-01-01'; month <= through; month = addMonths(month, 1, 1)) {
    if (month >= from) transactions.push(tx('checking', month, 'expense', 2000, 'Oak Street Apartments', { merchant_name: 'Oak Street Apartments' }));
    const streaming = addMonths(month, 0, 12);
    if (streaming >= from && streaming <= through) {
      transactions.push(tx('card', streaming, 'expense', 15.49, 'NETFLIX.COM', { merchant_name: 'Netflix' }));
    }
  }
  // Shopping is irregular: a seeded sequence picks the store, the gap and the
  // amount, so no store settles into a schedule and the data stays deterministic.
  const stores = ['Trader Joes', 'Safeway', 'Corner Market', 'Whole Foods'];
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let day = from; day <= through; day = addDays(day, 1 + Math.floor(random() * 6))) {
    const store = stores[Math.floor(random() * stores.length)];
    transactions.push(tx('card', day, 'expense', Math.round((25 + random() * 140) * 100) / 100, store, { merchant_name: store }));
  }
  const flight = addDays(through, -20);
  if (flight >= from) transactions.push(tx('card', flight, 'expense', 2400, 'UNITED AIRLINES', { merchant_name: 'United Airlines' }));
  // A card payment has two legs, as Plaid reports them: money leaving checking
  // (a positive provider amount) and money reaching the card (a negative one).
  for (let month = '2025-01-20'; month <= through; month = addMonths(month, 1)) {
    if (month >= from) {
      transactions.push(tx('checking', month, 'transfer_out', 1500, 'CARD CO AUTOPAY', { personal_finance_category: CARD_PAYMENT_CATEGORY }));
      transactions.push(tx('card', month, 'transfer_out', -1500, 'PAYMENT THANK YOU', { personal_finance_category: CARD_PAYMENT_CATEGORY }));
    }
  }
  return transactions;
}

/** Provider terms for the rewards card: 24% purchase APR, $80 minimum, due on the 20th. */
export const CARD_TERMS = {
  kind: 'credit',
  aprs: [{ type: 'purchase_apr', percentage: 24 }],
  minimumPaymentAmount: 80,
  nextPaymentDueDate: '2026-10-20',
};

/** The household's accounts, with the rewards card owing `balance` under real terms. */
export function accountsWithCardTerms(balance = 4000): Array<Record<string, unknown>> {
  return ACCOUNTS.map(account => account.account_id === 'card'
    ? { ...account, balance: { current: balance }, liabilityDetails: [CARD_TERMS] }
    : account);
}

/** The interest a card carrying a balance charges, on the 28th of each month. */
export function interestCharges(from: CalendarDate, through: CalendarDate, amount = 60): Array<Record<string, unknown>> {
  const charges: Array<Record<string, unknown>> = [];
  for (let month = '2025-01-28'; month <= through; month = addMonths(month, 1, 28)) {
    if (month >= from) {
      charges.push(tx('card', month, 'fee', amount, 'INTEREST CHARGE ON PURCHASES', { personal_finance_category: INTEREST_CHARGE_CATEGORY }));
    }
  }
  return charges;
}

