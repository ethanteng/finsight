/**
 * Transaction category taxonomy.
 *
 * Plaid's personal finance category values are what the ingestion pipeline already
 * writes into `transaction.category` (`[primary, detailed]`), so a user-chosen
 * category has to come from the same vocabulary — otherwise the AI context layer
 * and the spending-by-category rollups would see a value they cannot compare with
 * anything Plaid produced.
 */

import { resolveCanonicalTransactionType } from './canonical-transaction-adapter';
import type { CanonicalTransactionType } from '../domain/financial-truth';

export const TRANSACTION_CATEGORY_TAXONOMY: Record<string, string[]> = {
  INCOME: [
    'INCOME_DIVIDENDS',
    'INCOME_INTEREST_EARNED',
    'INCOME_RETIREMENT_PENSION',
    'INCOME_TAX_REFUND',
    'INCOME_UNEMPLOYMENT',
    'INCOME_WAGES',
    'INCOME_OTHER_INCOME',
  ],
  TRANSFER_IN: [
    'TRANSFER_IN_CASH_ADVANCES_AND_LOANS',
    'TRANSFER_IN_DEPOSIT',
    'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS',
    'TRANSFER_IN_SAVINGS',
    'TRANSFER_IN_ACCOUNT_TRANSFER',
    'TRANSFER_IN_OTHER_TRANSFER_IN',
  ],
  TRANSFER_OUT: [
    'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS',
    'TRANSFER_OUT_SAVINGS',
    'TRANSFER_OUT_WITHDRAWAL',
    'TRANSFER_OUT_ACCOUNT_TRANSFER',
    'TRANSFER_OUT_OTHER_TRANSFER_OUT',
  ],
  LOAN_PAYMENTS: [
    'LOAN_PAYMENTS_CAR_PAYMENT',
    'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
    'LOAN_PAYMENTS_MORTGAGE_PAYMENT',
    'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT',
    'LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT',
    'LOAN_PAYMENTS_OTHER_PAYMENT',
  ],
  BANK_FEES: [
    'BANK_FEES_ATM_FEES',
    'BANK_FEES_FOREIGN_TRANSACTION_FEES',
    'BANK_FEES_INSUFFICIENT_FUNDS',
    'BANK_FEES_INTEREST_CHARGE',
    'BANK_FEES_OVERDRAFT_FEES',
    'BANK_FEES_OTHER_BANK_FEES',
  ],
  ENTERTAINMENT: [
    'ENTERTAINMENT_CASINOS_AND_GAMBLING',
    'ENTERTAINMENT_MUSIC_AND_AUDIO',
    'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS',
    'ENTERTAINMENT_TV_AND_MOVIES',
    'ENTERTAINMENT_VIDEO_GAMES',
    'ENTERTAINMENT_OTHER_ENTERTAINMENT',
  ],
  FOOD_AND_DRINK: [
    'FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR',
    'FOOD_AND_DRINK_COFFEE',
    'FOOD_AND_DRINK_FAST_FOOD',
    'FOOD_AND_DRINK_GROCERIES',
    'FOOD_AND_DRINK_RESTAURANT',
    'FOOD_AND_DRINK_VENDING_MACHINES',
    'FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK',
  ],
  GENERAL_MERCHANDISE: [
    'GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS',
    'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES',
    'GENERAL_MERCHANDISE_CONVENIENCE_STORES',
    'GENERAL_MERCHANDISE_DEPARTMENT_STORES',
    'GENERAL_MERCHANDISE_DISCOUNT_STORES',
    'GENERAL_MERCHANDISE_ELECTRONICS',
    'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES',
    'GENERAL_MERCHANDISE_OFFICE_SUPPLIES',
    'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',
    'GENERAL_MERCHANDISE_PET_SUPPLIES',
    'GENERAL_MERCHANDISE_SPORTING_GOODS',
    'GENERAL_MERCHANDISE_SUPERSTORES',
    'GENERAL_MERCHANDISE_TOBACCO_AND_VAPE',
    'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
  ],
  HOME_IMPROVEMENT: [
    'HOME_IMPROVEMENT_FURNITURE',
    'HOME_IMPROVEMENT_HARDWARE',
    'HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE',
    'HOME_IMPROVEMENT_SECURITY',
    'HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT',
  ],
  MEDICAL: [
    'MEDICAL_DENTAL_CARE',
    'MEDICAL_EYE_CARE',
    'MEDICAL_NURSING_CARE',
    'MEDICAL_PHARMACIES_AND_SUPPLEMENTS',
    'MEDICAL_PRIMARY_CARE',
    'MEDICAL_VETERINARY_SERVICES',
    'MEDICAL_OTHER_MEDICAL',
  ],
  PERSONAL_CARE: [
    'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS',
    'PERSONAL_CARE_HAIR_AND_BEAUTY',
    'PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING',
    'PERSONAL_CARE_OTHER_PERSONAL_CARE',
  ],
  GENERAL_SERVICES: [
    'GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING',
    'GENERAL_SERVICES_AUTOMOTIVE',
    'GENERAL_SERVICES_CHILDCARE',
    'GENERAL_SERVICES_CONSULTING_AND_LEGAL',
    'GENERAL_SERVICES_EDUCATION',
    'GENERAL_SERVICES_INSURANCE',
    'GENERAL_SERVICES_POSTAGE_AND_SHIPPING',
    'GENERAL_SERVICES_STORAGE',
    'GENERAL_SERVICES_OTHER_GENERAL_SERVICES',
  ],
  GOVERNMENT_AND_NON_PROFIT: [
    'GOVERNMENT_AND_NON_PROFIT_DONATIONS',
    'GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES',
    'GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT',
    'GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT',
  ],
  TRANSPORTATION: [
    'TRANSPORTATION_BIKES_AND_SCOOTERS',
    'TRANSPORTATION_GAS',
    'TRANSPORTATION_PARKING',
    'TRANSPORTATION_PUBLIC_TRANSIT',
    'TRANSPORTATION_TAXIS_AND_RIDE_SHARES',
    'TRANSPORTATION_TOLLS',
    'TRANSPORTATION_OTHER_TRANSPORTATION',
  ],
  TRAVEL: [
    'TRAVEL_FLIGHTS',
    'TRAVEL_LODGING',
    'TRAVEL_RENTAL_CARS',
    'TRAVEL_OTHER_TRAVEL',
  ],
  RENT_AND_UTILITIES: [
    'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY',
    'RENT_AND_UTILITIES_INTERNET_AND_CABLE',
    'RENT_AND_UTILITIES_RENT',
    'RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT',
    'RENT_AND_UTILITIES_TELEPHONE',
    'RENT_AND_UTILITIES_WATER',
    'RENT_AND_UTILITIES_OTHER_UTILITIES',
  ],
  OTHER: ['OTHER_OTHER'],
};

export interface TransactionCategoryOption {
  primary: string;
  label: string;
  detailed: { value: string; label: string }[];
}

/** `FOOD_AND_DRINK_COFFEE` -> `Food And Drink Coffee`, matching how the UI renders chips. */
export function humanizeCategory(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

/** Menu the category modal renders. Derived from the taxonomy so both stay in step. */
export function listTransactionCategoryOptions(): TransactionCategoryOption[] {
  return Object.entries(TRANSACTION_CATEGORY_TAXONOMY).map(([primary, detailed]) => ({
    primary,
    label: humanizeCategory(primary),
    detailed: detailed.map(value => ({ value, label: humanizeCategory(value) })),
  }));
}

/**
 * Canonical cash-flow type implied by a chosen category.
 *
 * `resolveCanonicalTransactionType` never looks at `transaction.category` — it reads
 * `aiCategory`/`transaction_type`/`personal_finance_category` — so a category edit that
 * only rewrote the chip would leave a corrected transfer still excluded from spending.
 * The shared resolver is asked first, so special cases it already encodes (a credit-card
 * payment is a transfer, not an expense) keep applying; the table below only covers
 * bare primaries, which the resolver leaves unclassified because a provider payload
 * always carries a detailed value alongside them.
 */
const PRIMARY_CANONICAL_TYPES: Record<string, CanonicalTransactionType> = {
  INCOME: 'income',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  BANK_FEES: 'fee',
  LOAN_PAYMENTS: 'expense',
  ENTERTAINMENT: 'expense',
  FOOD_AND_DRINK: 'expense',
  GENERAL_MERCHANDISE: 'expense',
  HOME_IMPROVEMENT: 'expense',
  MEDICAL: 'expense',
  PERSONAL_CARE: 'expense',
  GENERAL_SERVICES: 'expense',
  GOVERNMENT_AND_NON_PROFIT: 'expense',
  TRANSPORTATION: 'expense',
  TRAVEL: 'expense',
  RENT_AND_UTILITIES: 'expense',
};

/**
 * Returns null for a selection with no deterministic cash-flow meaning (`OTHER`), which
 * callers treat as "leave the existing classification alone" rather than as unclassified.
 */
export function canonicalTypeForCategory(category: string[]): CanonicalTransactionType | null {
  const primary = (category[0] || '').toUpperCase();
  if (!primary) return null;
  const detailed = (category[1] || '').toUpperCase();

  const resolved = resolveCanonicalTransactionType({
    personal_finance_category: { primary, detailed },
  });
  return resolved ?? PRIMARY_CANONICAL_TYPES[primary] ?? null;
}

export interface CategorySelection {
  primary: string;
  detailed?: string | null;
}

/**
 * Validates a user selection and returns the `[primary, detailed]` array that is
 * written onto the transaction. Returns null when the selection is not part of
 * the taxonomy, which callers turn into a 400.
 */
export function resolveCategorySelection(selection: CategorySelection): string[] | null {
  const primary = typeof selection.primary === 'string' ? selection.primary.trim().toUpperCase() : '';
  if (!primary || !TRANSACTION_CATEGORY_TAXONOMY[primary]) return null;

  const rawDetailed = selection.detailed;
  if (rawDetailed === undefined || rawDetailed === null || rawDetailed === '') {
    return [primary];
  }

  const detailed = String(rawDetailed).trim().toUpperCase();
  if (!TRANSACTION_CATEGORY_TAXONOMY[primary].includes(detailed)) return null;
  return [primary, detailed];
}
