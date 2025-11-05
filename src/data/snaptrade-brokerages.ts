/**
 * SnapTrade Brokerages Data
 * 
 * Comprehensive list of brokerages and investment platforms supported by SnapTrade.
 * This list is used for anonymization of brokerage names in user profiles.
 * 
 * Organized by category for easier maintenance.
 */

// Full-Service Brokers
const FULL_SERVICE_BROKERS = [
  'Charles Schwab',
  'E*TRADE',
  'Fidelity',
  'Merrill Edge',
  'TD Ameritrade',
  'Vanguard',
];

// Discount Brokers
const DISCOUNT_BROKERS = [
  'Ally Invest',
  'Interactive Brokers',
  'TradeStation',
  'Webull',
];

// Robo-Advisors
const ROBO_ADVISORS = [
  'Acorns',
  'Betterment',
  'Stash',
  'Wealthfront',
];

// Crypto Platforms
const CRYPTO_PLATFORMS = [
  'Coinbase',
  'Kraken',
];

// Other Investment Platforms
const OTHER_PLATFORMS = [
  'Robinhood',
  'SnapTrade',
];

// Combine all categories
export const SNAPTRADE_BROKERAGES: readonly string[] = [
  ...FULL_SERVICE_BROKERS,
  ...DISCOUNT_BROKERS,
  ...ROBO_ADVISORS,
  ...CRYPTO_PLATFORMS,
  ...OTHER_PLATFORMS,
] as const;

