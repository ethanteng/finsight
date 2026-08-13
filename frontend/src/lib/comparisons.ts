export type ComparisonPage = {
  slug: string;
  competitorName: string;
  title: string;
  description: string;
  headline: string;
  summary: string;
  rows: Array<{ dimension: string; askLinc: string; competitor: string }>;
  faqs: Array<{ question: string; answer: string }>;
};

export const COMPARISONS: ComparisonPage[] = [
  {
    slug: 'origin',
    competitorName: 'Origin',
    title: 'Ask Linc vs Origin | Big Decisions vs Broad Money Management',
    description:
      'Compare Ask Linc and Origin by the job each product is built to do, along with price and privacy.',
    headline: 'Ask Linc vs Origin',
    summary:
      'Origin is a broad money-management app. Ask Linc is narrower: it helps you test a specific life decision—such as a home, parental leave, a career change, or retirement—against the rest of your plan.',
    rows: [
      {
        dimension: 'Price',
        askLinc: '1 month free, then $9/month flat for full access. Cancel anytime.',
        competitor:
          'Check Origin for its current plans and feature limits. Ask Linc starts with 1 month free, then costs $9/month on its single plan.',
      },
      {
        dimension: 'Reasoning vs dashboards',
        askLinc:
          'Built for questions like “Can we afford this home without pausing retirement savings?” with assumptions, a recommendation, and the math.',
        competitor:
          'Broader money management and account tracking. Check Origin’s current product pages for its latest planning and calculation features.',
      },
      {
        dimension: 'Privacy',
        askLinc:
          'Read-only connections, sensitive labels replaced before AI analysis, and financial data not used for model training. Accounts can be disconnected anytime.',
        competitor:
          'Uses bank connections for a full money app. Review Origin’s privacy policy for how data is stored and used with AI features.',
      },
    ],
    faqs: [
      {
        question: 'Is Ask Linc an Origin alternative?',
        answer:
          'It can be if your main need is planning a specific decision. If you want broader money management and tracking, Origin may fit better.',
      },
      {
        question: 'Why is Ask Linc $9?',
        answer:
          'The first month is free, then $9/month includes unlimited questions, connected accounts, what-if scenarios, and inspectable calculations.',
      },
    ],
  },
  {
    slug: 'portfoliopilot',
    competitorName: 'PortfolioPilot',
    title: 'Ask Linc vs PortfolioPilot | Life Decisions vs Portfolio Analytics',
    description:
      'Compare Ask Linc and PortfolioPilot by the job each product is built to do, along with price and privacy.',
    headline: 'Ask Linc vs PortfolioPilot',
    summary:
      'PortfolioPilot focuses on portfolio analytics and investment scenarios. Ask Linc focuses on household decisions that connect cash, debt, housing, family costs, investments, and retirement.',
    rows: [
      {
        dimension: 'Price',
        askLinc: '1 month free, then $9/month flat. Full access. Cancel anytime.',
        competitor:
          'Check PortfolioPilot for its current plans and feature limits. Ask Linc starts with 1 month free, then costs $9/month on its single plan.',
      },
      {
        dimension: 'Reasoning vs dashboards',
        askLinc:
          'Plain-language questions across cash, investments, debt, housing, family costs, and goals, with assumptions and calculations attached.',
        competitor:
          'Focused on portfolio analysis and investment scenarios. Check its current product pages for the latest household-planning features.',
      },
      {
        dimension: 'Privacy',
        askLinc:
          'Read-only connections, sensitive labels replaced before AI analysis, and financial data not used for model training.',
        competitor:
          'SEC-registered RIA positioning and institutional trust signals. Review their disclosures for advisory vs software boundaries.',
      },
    ],
    faqs: [
      {
        question: 'Is Ask Linc a PortfolioPilot alternative?',
        answer:
          'If you want portfolio stress tests and advisory-style analytics, PortfolioPilot is purpose-built for that. If you want to ask household money questions in plain English and see the math behind the answer, start with Ask Linc.',
      },
      {
        question: 'Does Ask Linc replace a human advisor?',
        answer:
          'No. Ask Linc is software for reasoning about your numbers. It is not investment advice from a human advisor and does not manage your money.',
      },
    ],
  },
  {
    slug: 'monarch',
    competitorName: 'Monarch',
    title: 'Ask Linc vs Monarch Money | Big Decisions vs Tracking',
    description:
      'Compare Ask Linc and Monarch by the job each product is built to do, along with price and privacy.',
    headline: 'Ask Linc vs Monarch',
    summary:
      'Monarch focuses on budgeting and net-worth tracking. Ask Linc focuses on testing a specific decision against cash flow, savings, debt, investments, and retirement.',
    rows: [
      {
        dimension: 'Price',
        askLinc: '1 month free, then $9/month flat for unlimited questions and accounts.',
        competitor:
          'Monarch is typically a higher monthly subscription for household budgeting/tracking — check Monarch for current pricing.',
      },
      {
        dimension: 'Reasoning vs dashboards',
        askLinc:
          'Ask questions and get recommendations with numbers and sources. Built for “what should we do?” not “where did spending go?”',
        competitor:
          'Focused on shared budgets, categories, and net-worth tracking. Check Monarch’s current product pages for its latest planning features.',
      },
      {
        dimension: 'Privacy',
        askLinc:
          'Privacy-first architecture: anonymize before AI, read-only links, no model training on your data.',
        competitor:
          'Bank aggregation for budgeting. Review Monarch’s privacy documentation for data retention and sharing practices.',
      },
    ],
    faqs: [
      {
        question: 'Is Ask Linc a Monarch alternative?',
        answer:
          'Only if planning a specific decision is now the main need. Keep Monarch if budgeting and shared household tracking are the priority.',
      },
      {
        question: 'Can I use both?',
        answer:
          'Yes. Some people track in Monarch and use Ask Linc when they need a reasoned answer about a big decision.',
      },
    ],
  },
];

export function getComparison(slug: string): ComparisonPage | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
