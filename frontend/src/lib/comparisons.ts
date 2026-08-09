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
    title: 'Ask Linc vs Origin | AI Financial Assistant Comparison',
    description:
      'Compare Ask Linc and Origin on price, reasoning vs dashboards, and privacy. Ask Linc is $9/month for decisions-ready answers — not another tracker.',
    headline: 'Ask Linc vs Origin',
    summary:
      'Origin is a broad money app with tracking and AI Q&A. Ask Linc is narrower on purpose: financial reasoning for households planning retirement — decisions-ready answers with show-the-math, not another dashboard.',
    rows: [
      {
        dimension: 'Price',
        askLinc: '$9/month flat for full access. Cancel anytime.',
        competitor:
          'Origin has historically used promotional / low entry pricing; check Origin for current plans. Ask Linc stays a simple flat $9.',
      },
      {
        dimension: 'Reasoning vs dashboards',
        askLinc:
          'Built for questions like “Can we retire at 60 if rates stay higher for longer?” with numbers, recommendations, and Show the math.',
        competitor:
          'Strong on tracking everything and asking across accounts. More breadth; less focused on retirement reasoning and deterministic math transparency.',
      },
      {
        dimension: 'Privacy',
        askLinc:
          'Plaid read-only connections, data anonymized before AI analysis, never used to train models. You can export or delete anytime.',
        competitor:
          'Uses bank connections for a full money app. Review Origin’s privacy policy for how data is stored and used with AI features.',
      },
    ],
    faqs: [
      {
        question: 'Is Ask Linc an Origin alternative?',
        answer:
          'Yes, if you want reasoning over tracking. If you mainly need a budget/net-worth dashboard with AI on top, Origin may fit better. If you want decisions-ready retirement and what-if answers with inspectable math, Ask Linc is the closer match.',
      },
      {
        question: 'Why is Ask Linc $9?',
        answer:
          '$9/month flat is meant to undercut percent-of-wealth advisory fees (often 1–2% per year) while staying simpler than multi-tier money apps.',
      },
    ],
  },
  {
    slug: 'portfoliopilot',
    competitorName: 'PortfolioPilot',
    title: 'Ask Linc vs PortfolioPilot | AI Portfolio & Retirement Comparison',
    description:
      'Compare Ask Linc and PortfolioPilot on price, stress-testing vs conversational reasoning, and privacy. Ask Linc is $9/month with show-the-math answers.',
    headline: 'Ask Linc vs PortfolioPilot',
    summary:
      'PortfolioPilot is a portfolio-analytics product with scenario tools and strong third-party validation. Ask Linc is a conversational financial reasoning assistant for household decisions — retirement, home buying, and what-ifs — at a flat $9/month.',
    rows: [
      {
        dimension: 'Price',
        askLinc: '$9/month flat. Full access. Cancel anytime.',
        competitor:
          'PortfolioPilot pricing is typically higher / tiered for portfolio tools — confirm on their site. Ask Linc keeps one low flat rate.',
      },
      {
        dimension: 'Reasoning vs dashboards',
        askLinc:
          'Conversational reasoning over your full household picture (cash, investments, debt, home, goals) with live market context and Show the math.',
        competitor:
          'Deep portfolio analytics and stress-testing. Excellent if your job is portfolio scenarios; less of a plain-English household decision coach.',
      },
      {
        dimension: 'Privacy',
        askLinc:
          'Read-only connections, anonymization before AI, no training on your data, full delete controls.',
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
    title: 'Ask Linc vs Monarch Money | Tracking vs Financial Reasoning',
    description:
      'Compare Ask Linc and Monarch on price, dashboards vs reasoning, and privacy. Ask Linc focuses on decisions-ready answers for $9/month.',
    headline: 'Ask Linc vs Monarch',
    summary:
      'Monarch is a modern budgeting and net-worth tracker. Ask Linc is not a budget app — it reasons about your connected finances and live markets so you can decide on retirement, housing, and risk.',
    rows: [
      {
        dimension: 'Price',
        askLinc: '$9/month flat for unlimited questions and accounts.',
        competitor:
          'Monarch is typically a higher monthly subscription for household budgeting/tracking — check Monarch for current pricing.',
      },
      {
        dimension: 'Reasoning vs dashboards',
        askLinc:
          'Ask questions and get recommendations with numbers and sources. Built for “what should we do?” not “where did spending go?”',
        competitor:
          'Excellent shared budgets, categories, and net-worth tracking. Light AI assist may exist, but the core job is organization and visibility.',
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
          'Only if you outgrew tracking and need decision support. Keep Monarch if budgeting and shared household tracking is the main job. Choose Ask Linc when the pain is “tell me what to do” with retirement and market context.',
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
