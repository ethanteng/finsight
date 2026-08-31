import { FALLBACK_PRICING, type Pricing } from '@/config/pricing';

export type ComparisonPage = {
  slug: string;
  competitorName: string;
  title: string;
  description: string;
  headline: string;
  summary: string;
  rows: Array<{ dimension: string; askLinc: string; competitor: string }>;
  faqs: Array<{ question: string; answer: string }>;
  relatedLinks?: Array<{ href: string; label: string }>;
  honestTake?: string;
};

/** Slugs are price-independent, so routing and static params need no lookup. */
export const COMPARISON_SLUGS = [
  'chatgpt',
  'origin',
  'portfoliopilot',
  'monarch',
  'boldin',
] as const;

/**
 * Comparison copy quotes the subscription price, so it is built from the
 * resolved price rather than baked in at module load.
 */
export function buildComparisons(pricing: Pricing = FALLBACK_PRICING): ComparisonPage[] {
  return [
    {
      slug: 'chatgpt',
      competitorName: 'ChatGPT',
      title: 'Ask Linc vs ChatGPT | Your Financial Accounts vs General AI',
      description:
        'Compare Ask Linc and ChatGPT for money questions, connected accounts, privacy, price, and seeing the math behind an answer.',
      headline: 'Ask Linc vs ChatGPT',
      summary:
        'ChatGPT can help with almost anything. Ask Linc is built for money questions that need your real accounts and math you can check.',
      rows: [
        {
          dimension: 'Show the Math',
          askLinc: 'See the numbers used, what Linc assumed, the math, the checks, and the sources.',
          competitor: 'Can explain an answer and cite web sources, but does not show Ask Linc’s full financial work.',
        },
        {
          dimension: 'Never used for training',
          askLinc: 'Financial data is never used to train models.',
          competitor: 'Training use varies by product, plan, and data controls.',
        },
        {
          dimension: 'Best for',
          askLinc: 'Answers a money question using your connected accounts and goals.',
          competitor: 'A general assistant for writing, research, coding, images, and more.',
        },
        {
          dimension: 'How the math works',
          askLinc: 'Dedicated tools do important math; AI explains the result.',
          competitor: 'Math can happen inside the conversation instead of through dedicated financial tools.',
        },
        {
          dimension: 'Price',
          askLinc: `${pricing.trialLine} Full product.`,
          competitor: 'Broader subscriptions at roughly $20–$100 per month.',
        },
        {
          dimension: 'Connected financial information',
          askLinc: 'Can use connected bank and investment accounts, property values, rates, and market information.',
          competitor: 'Connects accounts through Plaid, with the partner set expanding.',
        },
      ],
      relatedLinks: [
        {
          href: '/blog/show-the-math-how-ask-linc-makes-ai-financial-analysis-transparent',
          label: 'See how Show the Math works',
        },
        {
          href: '/blog/why-ai-apps-should-stop-using-a-single-model',
          label: 'Why Ask Linc uses multiple models',
        },
      ],
      honestTake:
        'Keep ChatGPT for general work. Use Ask Linc when a money answer needs your connected accounts and math you can check.',
      faqs: [
        {
          question: 'Is Ask Linc better than ChatGPT for personal finance?',
          answer:
            'Use ChatGPT for breadth. Use Ask Linc for answers based on your connected accounts, current information, and math you can check.',
        },
        {
          question: 'Why does Ask Linc use multiple AI models?',
          answer:
            'Different AI models can help with different jobs. Ask Linc keeps your numbers and important math separate so one chatbot is not doing everything.',
        },
        {
          question: 'What does Show the Math reveal?',
          answer:
            'It shows the numbers Linc used, what it assumed, the math, the checks, and the sources behind an answer.',
        },
        {
          question: 'Does Ask Linc use my financial data to train AI models?',
          answer: 'No. Financial data is never used to train AI models.',
        },
        {
          question: 'Can I use Ask Linc and ChatGPT together?',
          answer: 'Yes. Keep ChatGPT for general work and use Ask Linc when a money answer needs your accounts and math you can check.',
        },
        {
          question: 'How do Ask Linc and ChatGPT prices compare?',
          answer:
            `Ask Linc is free for the first month, then ${pricing.label}. Check ChatGPT for current plans.`,
        },
      ],
    },
    {
      slug: 'origin',
      competitorName: 'Origin',
      title: 'Ask Linc vs Origin | Big Decisions vs Broad Money Management',
      description:
        'Compare Ask Linc and Origin by the job each product is built to do, along with price and privacy.',
      headline: 'Ask Linc vs Origin',
      summary:
        'Origin is an all-in-one money app. Ask Linc is narrower: it helps you try a specific what-if—such as buying a home, taking leave, changing jobs, or retiring—and see what else it changes.',
      rows: [
        {
          dimension: 'Price',
          askLinc: pricing.trialLine,
          competitor:
            `Check Origin for its current plans and feature limits. Ask Linc starts with 1 month free, then costs ${pricing.label} on its single plan.`,
        },
        {
          dimension: 'Best for',
          askLinc:
            'Built for questions like “Can we afford this home without pausing retirement savings?” with a clear answer and the math shown.',
          competitor:
            'Tracking spending, investments, net worth, and goals in one place, with forecasting and AI guidance.',
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
          question: `Why is Ask Linc ${pricing.dollars}?`,
          answer:
            `The first month is free, then ${pricing.label} includes unlimited questions, connected accounts, what-if scenarios, and Show the Math.`,
        },
      ],
    },
    {
      slug: 'portfoliopilot',
      competitorName: 'PortfolioPilot',
      title: 'Ask Linc vs PortfolioPilot | Life Decisions vs Investment Advice',
      description:
        'Compare Ask Linc and PortfolioPilot by the job each product is built to do, along with price and privacy.',
      headline: 'Ask Linc vs PortfolioPilot',
      summary:
        'PortfolioPilot focuses on investing advice and portfolio what-ifs. Ask Linc focuses on household decisions that connect cash, debt, housing, family costs, investments, and retirement.',
      rows: [
        {
          dimension: 'Price',
          askLinc: pricing.trialLine,
          competitor:
            `Check PortfolioPilot for its current plans and feature limits. Ask Linc starts with 1 month free, then costs ${pricing.label} on its single plan.`,
        },
        {
          dimension: 'Best for',
          askLinc:
            'Money questions across cash, investments, debt, housing, family costs, and goals, with the math shown.',
          competitor:
            'Investment recommendations, portfolio risk, taxes, retirement planning, and investment what-ifs.',
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
            'If you want investment recommendations and detailed portfolio tools, PortfolioPilot is built for that. If you want to ask a household money question and see the math behind the answer, start with Ask Linc.',
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
        'Monarch helps you track spending, budget, and see all your money in one place. Ask Linc helps you try a specific what-if using your cash, debt, investments, and retirement goals.',
      rows: [
        {
          dimension: 'Price',
          askLinc: `${pricing.trialLine} Unlimited questions and accounts.`,
          competitor:
            'Check Monarch for its current pricing and promotions.',
        },
        {
          dimension: 'Best for',
          askLinc:
            'Ask questions and get recommendations with numbers and sources. Built for “what should we do?” not “where did spending go?”',
          competitor:
            'Tracking spending, budgeting together, setting goals, and seeing where your money stands.',
        },
        {
          dimension: 'Privacy',
          askLinc:
            'Read-only connections, personal details removed before AI, and financial data never used to train AI models.',
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
            'Yes. You can track your money in Monarch and use Ask Linc when you want to try a big what-if and see the math.',
        },
      ],
    },
    {
      slug: 'boldin',
      competitorName: 'Boldin',
      title: 'Ask Linc vs Boldin | Connected Decisions vs Retirement Planning',
      description:
        'Compare Ask Linc and Boldin for retirement planning, scenario modeling, pricing, AI guidance, and the financial job each product is built to do.',
      headline: 'Ask Linc vs Boldin',
      summary:
        'Boldin is a detailed retirement planner with tools for taxes, withdrawals, and comparing plans. Ask Linc starts with a question and connects retirement to cash, debt, housing, family costs, investments, and other decisions.',
      rows: [
        {
          dimension: 'Price',
          askLinc: pricing.trialLine,
          competitor:
            'Boldin offers free and paid planner options. Check Boldin for current pricing and feature limits.',
        },
        {
          dimension: 'Planning experience',
          askLinc:
            'Start with a question and get a clear answer with the numbers and math shown across your connected finances.',
          competitor:
            'Build and maintain a detailed retirement plan with many settings, side-by-side what-ifs, reports, and probability estimates.',
        },
        {
          dimension: 'Scope',
          askLinc:
            'Connect retirement to home buying, family costs, career changes, debt, cash flow, and portfolio decisions in one conversation.',
          competitor:
            'Specialized retirement planning with tools for taxes, Roth conversions, Social Security, healthcare, withdrawals, and future spending.',
        },
        {
          dimension: 'AI and privacy',
          askLinc:
            'Read-only connections, sensitive labels replaced before AI analysis, and financial data not used for model training.',
          competitor:
            'Boldin says it is SOC 2 Type II compliant, encrypts data in transit and at rest, does not sell data, and does not use AI conversations to train public models.',
        },
      ],
      faqs: [
        {
          question: 'Is Ask Linc a Boldin alternative?',
          answer:
            'It can be when you want retirement considered alongside another household decision. Boldin is the stronger fit when your priority is building and maintaining a highly detailed retirement model.',
        },
        {
          question: 'Which is better for detailed retirement planning?',
          answer:
            'Boldin is built for detailed retirement planning, including side-by-side what-ifs, taxes, withdrawals, and probability estimates. Ask Linc is built for asking a connected money question and seeing the answer and math.',
        },
        {
          question: 'Can I use Ask Linc and Boldin together?',
          answer:
            'Yes. You can use Boldin to maintain a detailed retirement plan and Ask Linc to reason through a specific decision that affects retirement and the rest of your household finances.',
        },
        {
          question: 'How do Ask Linc and Boldin prices compare?',
          answer:
            `Ask Linc includes a free first month and then costs ${pricing.label}. Check Boldin for current pricing and feature limits.`,
        },
      ],
    },
  ];
}

export function getComparison(
  slug: string,
  pricing: Pricing = FALLBACK_PRICING
): ComparisonPage | undefined {
  return buildComparisons(pricing).find((c) => c.slug === slug);
}
