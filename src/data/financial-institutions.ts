/**
 * Financial Institutions Data
 * 
 * Comprehensive curated list of major US financial institutions for anonymization.
 * This list includes banks, credit unions, digital banks, and investment platforms
 * that are commonly accessed via Plaid.
 * 
 * Organized by category for easier maintenance.
 */

// Major National Banks
const MAJOR_BANKS = [
  'Bank of America',
  'Capital One',
  'Chase',
  'Citibank',
  'JPMorgan Chase',
  'PNC',
  'Truist',
  'US Bank',
  'Wells Fargo',
];

// Regional Banks
const REGIONAL_BANKS = [
  'BB&T',
  'BMO Harris',
  'Citizens Bank',
  'Comerica',
  'Fifth Third',
  'First National Bank',
  'First Republic Bank',
  'Huntington',
  'KeyBank',
  'M&T Bank',
  'Regions Bank',
  'SunTrust',
  'TD Bank',
  'Zions Bank',
];

// Credit Unions
const CREDIT_UNIONS = [
  'Alliant',
  'America First',
  'BECU',
  'First Tech Federal',
  'Golden 1',
  'Navy Federal',
  'PenFed',
  'State Employees',
  'USAA',
];

// Digital Banks & Fintech
const DIGITAL_BANKS = [
  'Ally Bank',
  'Chime',
  'Current',
  'Discover Bank',
  'Marcus',
  'Novo',
  'SoFi',
  'Upstart',
  'Varo',
];

// Online Banks
const ONLINE_BANKS = [
  'American Express',
  'Axos Bank',
  'CIT Bank',
  'Synchrony',
  'TIAA Bank',
];

// Investment Platforms (accessible via Plaid)
const INVESTMENT_PLATFORMS = [
  'Acorns',
  'Betterment',
  'Fidelity',
  'Robinhood',
  'Schwab',
  'Stash',
  'TD Ameritrade',
  'Vanguard',
  'Wealthfront',
];

// Smaller/Regional Institutions
const REGIONAL_INSTITUTIONS = [
  'Bread Savings',
  'CFG Bank',
  'Popular Direct',
  'UFB Direct',
];

// Combine all categories
export const FINANCIAL_INSTITUTIONS: readonly string[] = [
  ...MAJOR_BANKS,
  ...REGIONAL_BANKS,
  ...CREDIT_UNIONS,
  ...DIGITAL_BANKS,
  ...ONLINE_BANKS,
  ...INVESTMENT_PLATFORMS,
  ...REGIONAL_INSTITUTIONS,
] as const;

