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

export const COMPARISON_SLUGS = ['chatgpt', 'origin', 'portfoliopilot', 'monarch', 'boldin'] as const;

export function buildComparisons(pricing: Pricing = FALLBACK_PRICING): ComparisonPage[] {
  return [
    {
      slug: 'chatgpt',
      competitorName: 'ChatGPT',
      title: 'Ask Linc vs ChatGPT | Financial Decisions vs General AI',
      description: 'Compare Ask Linc and ChatGPT by the job each is built to do: broad AI help versus financial planning around a specific decision.',
      headline: 'Ask Linc vs ChatGPT',
      summary: 'ChatGPT can help with almost anything. Ask Linc is built for big money decisions that need your financial picture, purpose-built calculations, and work you can inspect.',
      rows: [
        { dimension: 'Best for', askLinc: 'Questions like “Can we afford this house without setting retirement back?”', competitor: 'A broad assistant for research, writing, coding, planning, and many other tasks.' },
        { dimension: 'Starting point', askLinc: 'The financial decision in front of you.', competitor: 'A general conversation or task.' },
        { dimension: 'Financial context', askLinc: 'Connects the parts of your financial life that could change the decision.', competitor: 'Can use connected financial data, but financial planning is one of many jobs the product supports.' },
        { dimension: 'How the answer is checked', askLinc: 'Show the Math keeps your numbers, assumptions, calculations, checks, and sources attached to the answer.', competitor: 'Can explain reasoning and cite sources, but is not organized around Ask Linc’s financial decision record.' },
        { dimension: 'Important calculations', askLinc: 'Purpose-built financial tools calculate supported scenarios; AI helps understand and explain them.', competitor: 'A general AI environment with tools that vary by task and product surface.' },
        { dimension: 'Price', askLinc: `${pricing.trialLine} Full product.`, competitor: 'Check ChatGPT for current plans and feature availability.' },
      ],
      relatedLinks: [
        { href: '/trust', label: 'See how Ask Linc checks an answer' },
        { href: '/use-cases', label: 'See the decisions Ask Linc is built for' },
      ],
      honestTake: 'Keep ChatGPT for general work. Use Ask Linc when the question is a consequential financial decision and you want the rest of your financial life—and the math—kept in the answer.',
      faqs: [
        { question: 'Is Ask Linc better than ChatGPT for personal finance?', answer: 'They are built for different jobs. ChatGPT is a general assistant. Ask Linc is purpose-built for working through a financial decision using your financial picture and calculations you can inspect.' },
        { question: 'Can ChatGPT connect to financial accounts?', answer: 'Yes, connected financial experiences exist in ChatGPT. Ask Linc’s distinction is not simply account connectivity; it is the decision-first planning workflow and Show the Math record attached to the answer.' },
        { question: 'What does Show the Math reveal?', answer: 'It shows the numbers Linc used, what it assumed, the calculations, the checks, and the sources behind an answer.' },
        { question: 'Does Ask Linc use my financial data to train AI models?', answer: 'No. Financial data is never used to train AI models.' },
        { question: 'Can I use Ask Linc and ChatGPT together?', answer: 'Yes. Use ChatGPT for general work and Ask Linc when you want to test a financial decision against the rest of your financial life.' },
      ],
    },
    {
      slug: 'origin',
      competitorName: 'Origin',
      title: 'Ask Linc vs Origin | Focused vs All-in-One Planning',
      description: 'Compare Ask Linc and Origin by the job each product is built to do: focused financial decisions versus a broad financial platform and AI advisor.',
      headline: 'Ask Linc vs Origin',
      summary: 'Origin is a broad financial platform with tracking, planning, investing, and AI guidance. Ask Linc is narrower on purpose: start with the decision in front of you and test it against the rest of your financial life.',
      rows: [
        { dimension: 'Best for', askLinc: 'Working through a specific decision such as a home purchase, career break, growing family, investment change, or retirement date.', competitor: 'A broader financial home for tracking, planning, investing, and AI guidance.' },
        { dimension: 'Starting point', askLinc: 'A question: “Can I take a year off without setting retirement back?”', competitor: 'A full financial platform and ongoing advisory experience.' },
        { dimension: 'Planning style', askLinc: 'Pull in only the parts of your financial life that could change the answer, then compare the tradeoffs.', competitor: 'Maintain a broader financial picture and use planning and AI features across the platform.' },
        { dimension: 'Trust model', askLinc: 'Show the numbers, assumptions, calculations, checks, and sources so you can inspect the work.', competitor: 'Purpose-built financial AI with its own computation, advisor, and compliance approach.' },
        { dimension: 'Price', askLinc: pricing.trialLine, competitor: 'Check Origin for current plans and feature limits.' },
      ],
      honestTake: 'Choose Origin if you want a broad financial platform. Choose Ask Linc if you want a focused place to answer the consequential question in front of you without first building or maintaining a full financial model.',
      faqs: [
        { question: 'Is Ask Linc an Origin alternative?', answer: 'It can be if your main job is working through a specific financial decision. Origin is the broader choice when you want an all-in-one financial platform and ongoing AI advisor experience.' },
        { question: 'Does Origin also use AI and financial modeling?', answer: 'Yes. The distinction is not “AI versus real math.” Both products are purpose-built for finance. Ask Linc is positioned around a question-first decision workflow and inspectable work.' },
        { question: `What does Ask Linc cost?`, answer: `The first month is free, then ${pricing.label} includes unlimited questions, connected accounts, what-if scenarios, and Show the Math.` },
      ],
    },
    {
      slug: 'portfoliopilot',
      competitorName: 'PortfolioPilot',
      title: 'Ask Linc vs PortfolioPilot | Planning vs Investing',
      description: 'Compare Ask Linc and PortfolioPilot by the job each is built to do: cross-household financial decisions versus investment-first analysis and advice.',
      headline: 'Ask Linc vs PortfolioPilot',
      summary: 'PortfolioPilot starts with your investments. Ask Linc starts with the decision—and brings investments into the answer when they matter.',
      rows: [
        { dimension: 'Best for', askLinc: 'Household decisions that can involve cash, debt, housing, work, family costs, investments, and retirement at the same time.', competitor: 'Investment analysis, portfolio recommendations, risk, taxes, and investor-focused planning.' },
        { dimension: 'Starting point', askLinc: '“What are we trying to decide?”', competitor: '“How should this portfolio be managed or improved?”' },
        { dimension: 'Scope', askLinc: 'The whole financial picture needed for the decision.', competitor: 'Investment-first, with broader planning capabilities around the portfolio.' },
        { dimension: 'Output', askLinc: 'A recommendation, the tradeoffs, what could change the answer, and the math behind it.', competitor: 'Portfolio analysis, investment guidance, and investor-oriented recommendations.' },
        { dimension: 'Price', askLinc: pricing.trialLine, competitor: 'Check PortfolioPilot for current plans and feature limits.' },
      ],
      honestTake: 'Choose PortfolioPilot when the portfolio itself is the job. Choose Ask Linc when the investment question is one part of a bigger household decision.',
      faqs: [
        { question: 'Is Ask Linc a PortfolioPilot alternative?', answer: 'If you want investment recommendations and detailed portfolio tools, PortfolioPilot is built for that. If your investment question is part of a broader household decision, Ask Linc is built around that job.' },
        { question: 'Does Ask Linc replace a human advisor?', answer: 'No. Ask Linc is decision-support software. It does not manage your money or replace personal investment, tax, or legal advice.' },
      ],
    },
    {
      slug: 'monarch',
      competitorName: 'Monarch',
      title: 'Ask Linc vs Monarch Money | Decisions vs Money Management',
      description: 'Compare Ask Linc and Monarch by the job each product is built to do: deciding what to do next versus tracking, budgeting, and managing money.',
      headline: 'Ask Linc vs Monarch',
      summary: 'Monarch helps you manage your money. Ask Linc helps you decide what to do next.',
      rows: [
        { dimension: 'Best for', askLinc: 'A specific financial decision and the tradeoffs around it.', competitor: 'Ongoing budgeting, spending, net worth, goals, and household money management.' },
        { dimension: 'Starting point', askLinc: '“Can we afford this house without becoming house poor?”', competitor: '“Where does our money stand and where is it going?”' },
        { dimension: 'Connected accounts', askLinc: 'Used as inputs to the decision.', competitor: 'Used to organize and manage the household financial picture.' },
        { dimension: 'Output', askLinc: 'What looks workable, what is tight, what could break the plan, and what Linc would change.', competitor: 'Budgets, spending trends, goals, net worth, and a shared view of household finances.' },
        { dimension: 'Price', askLinc: `${pricing.trialLine} Unlimited questions and accounts.`, competitor: 'Check Monarch for current pricing and promotions.' },
      ],
      honestTake: 'Keep Monarch if tracking and budgeting are the main job. Use Ask Linc when the question changes from “where did the money go?” to “what should we do next?”',
      faqs: [
        { question: 'Is Ask Linc a Monarch alternative?', answer: 'Only if the job you need done has changed. Monarch is built for ongoing money management. Ask Linc is built for working through a specific decision.' },
        { question: 'Can I use both?', answer: 'Yes. You can manage your financial life in Monarch and use Ask Linc when you want to test a consequential decision against your numbers.' },
      ],
    },
    {
      slug: 'boldin',
      competitorName: 'Boldin',
      title: 'Ask Linc vs Boldin | Life Decisions vs Deep Retirement Planning',
      description: 'Compare Ask Linc and Boldin by the job each is built to do: cross-life financial decisions versus detailed retirement planning.',
      headline: 'Ask Linc vs Boldin',
      summary: 'Boldin builds a deep retirement plan. Ask Linc starts with the decision in front of you and connects retirement to the rest of your financial life.',
      rows: [
        { dimension: 'Best for', askLinc: 'A home, career change, family decision, investment choice, or retirement question that can affect several parts of your financial life at once.', competitor: 'Building and maintaining a detailed retirement plan with taxes, withdrawals, Social Security, healthcare, and many retirement scenarios.' },
        { dimension: 'Starting point', askLinc: 'Ask the question first; Linc gathers the relevant context around it.', competitor: 'Build a detailed retirement plan, then explore and compare scenarios within it.' },
        { dimension: 'Retirement', askLinc: 'Retirement stays connected to decisions happening before and around it.', competitor: 'Retirement is the central planning model and product focus.' },
        { dimension: 'Math and scenarios', askLinc: 'Purpose-built calculations and Show the Math make supported scenarios inspectable.', competitor: 'A financial modeling engine supports retirement scenarios and conversational AI guidance.' },
        { dimension: 'Price', askLinc: pricing.trialLine, competitor: 'Boldin offers free and paid planner options. Check Boldin for current pricing and feature limits.' },
      ],
      honestTake: 'Choose Boldin when you want the deepest retirement-planning workspace. Choose Ask Linc when retirement is one consequence of a broader life decision you are trying to make now.',
      faqs: [
        { question: 'Is Ask Linc a Boldin alternative?', answer: 'It can be when you want retirement considered alongside another household decision. Boldin is the stronger fit when your priority is building and maintaining a highly detailed retirement model.' },
        { question: 'Does Boldin also use a modeling engine instead of asking AI to do all the math?', answer: 'Yes. That is not a meaningful point of differentiation anymore. The clearer distinction is the job: Boldin is retirement-first; Ask Linc is decision-first across the household.' },
        { question: 'Can I use Ask Linc and Boldin together?', answer: 'Yes. Use Boldin for a detailed retirement plan and Ask Linc when you want to work through a specific decision that affects retirement and the rest of your financial life.' },
      ],
    },
  ];
}

export function getComparison(slug: string, pricing: Pricing = FALLBACK_PRICING): ComparisonPage | undefined {
  return buildComparisons(pricing).find((c) => c.slug === slug);
}
