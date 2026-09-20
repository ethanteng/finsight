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
  sources: Array<{ href: string; label: string }>;
};

const SHOW_THE_MATH_FAQ = {
  question: 'What can I inspect with Show the Math?',
  answer: 'It shows your inputs, assumptions, calculations, checks, and sources, so you can see how Linc reached its answer.',
};

export const COMPARISON_SLUGS = ['chatgpt', 'origin', 'portfoliopilot', 'monarch', 'boldin'] as const;

export function buildComparisons(pricing: Pricing = FALLBACK_PRICING): ComparisonPage[] {
  return [
    {
      slug: 'chatgpt',
      competitorName: 'ChatGPT',
      title: 'Ask Linc vs ChatGPT | Financial Planning Comparison',
      description: "Compare Ask Linc vs ChatGPT for financial planning. See how Show the Math keeps inputs, assumptions, calculations, checks, and sources with your answer.",
      headline: 'Ask Linc vs ChatGPT',
      summary: "ChatGPT is a broad assistant. Ask Linc is built around your financial decisions: connect your accounts, ask a question, and explore the plan.",
      rows: [
        { dimension: 'Best for', askLinc: 'Questions like “Can we afford this house without setting retirement back?”', competitor: 'A broad assistant for research, writing, coding, planning, and many other tasks.' },
        { dimension: 'Starting point', askLinc: 'The financial decision in front of you.', competitor: 'A general conversation or task.' },
        { dimension: 'Financial context', askLinc: 'Builds the model from the parts of your financial life that could change the decision.', competitor: 'Finances can connect accounts, show a financial dashboard, and use saved financial context in finance conversations.' },
        { dimension: 'Important calculations', askLinc: 'Dedicated calculators run supported scenarios. AI reads your question and explains the results.', competitor: 'A general AI environment whose calculation method and tools depend on the task and ChatGPT feature you use.' },
        { dimension: 'Price', askLinc: `${pricing.trialThenPriceLine} Full product.`, competitor: 'Check ChatGPT for current plans and feature availability.' },
      ],
      relatedLinks: [
        { href: '/blog/ai-financial-calculator', label: 'See what an AI financial calculator should do' },
        { href: '/trust', label: 'See how Ask Linc checks an answer' },
        { href: '/use-cases', label: 'See the decisions Ask Linc is built for' },
      ],
      honestTake: "Keep ChatGPT for broad work and everyday finance questions. Choose Ask Linc for a financial plan you can question, change, and check.",
      faqs: [
        SHOW_THE_MATH_FAQ,
        { question: 'Is Ask Linc better than ChatGPT for personal finance?', answer: 'They are built for different jobs. ChatGPT combines connected finance features with a broad assistant. Ask Linc is built for financial planning, with dedicated calculators for supported scenarios and assumptions you can inspect.' },
        { question: 'Can ChatGPT connect to financial accounts?', answer: 'Yes. ChatGPT Finances can connect financial accounts and answer questions using that context. Ask Linc focuses on building a plan around your question and showing the work in Show the Math.' },
        { question: 'Does Ask Linc use my financial data to train AI models?', answer: 'No. Financial data is never used to train AI models.' },
        { question: 'Can I use Ask Linc and ChatGPT together?', answer: 'Yes. Use ChatGPT for general work and Ask Linc when you want to test a financial decision against the rest of your financial life.' },
      ],
      sources: [
        { href: "https://help.openai.com/en/articles/20001222", label: "ChatGPT Finances" },
      ],
    },
    {
      slug: 'origin',
      competitorName: 'Origin',
      title: 'Ask Linc vs Origin | Focused vs All-in-One Planning',
      description: "Compare Ask Linc vs Origin. See how each helps you plan, test different scenarios, and check the calculations behind an answer.",
      headline: 'Ask Linc vs Origin',
      summary: "Origin combines money management with proactive guidance. Ask Linc focuses on the financial decision in front of you and the what-ifs around it.",
      rows: [
        { dimension: 'Best for', askLinc: 'Working through a specific decision such as a home purchase, career break, growing family, investment change, or retirement date.', competitor: 'A broader financial home for tracking, planning, investing, and AI guidance.' },
        { dimension: 'Starting point', askLinc: 'A question: “Can I take a year off without setting retirement back?”', competitor: 'An overview of your finances, with suggested actions and answers to your questions.' },
        { dimension: 'Planning style', askLinc: 'Build a plan for your question, then change assumptions by asking follow-ups.', competitor: 'Maintain a broader financial picture and use budgeting, forecasting, scenario, and AI features across the platform.' },
        { dimension: 'Price', askLinc: pricing.trialThenPriceLine, competitor: 'Check Origin for current plans and feature limits.' },
      ],
      honestTake: "Choose Origin for an all-in-one financial platform. Choose Ask Linc to work through a specific decision and inspect the answer.",
      faqs: [
        SHOW_THE_MATH_FAQ,
        { question: 'Is Ask Linc an Origin alternative?', answer: 'It can be if you want help working through a specific financial decision. Origin is the broader choice when you want an all-in-one financial platform and ongoing AI advisor experience.' },
        { question: 'Does Origin also use AI and financial modeling?', answer: 'Yes. Both products use AI and financial calculations. Ask Linc starts with your question and lets you inspect the work behind its answer.' },
        { question: `What does Ask Linc cost?`, answer: `The first month is free, then ${pricing.label} includes unlimited questions, connected accounts, what-if scenarios, and Show the Math.` },
      ],
      sources: [
        { href: "https://support.useorigin.com/hc/en-us/articles/39419419459085-What-is-the-AI-Advisor", label: "Origin AI Advisor" },
        { href: "https://useorigin.com/resources/blog/how-we-built-the-first-finance-app-that-actually-tells-you-what-to-do----a-proactive-ai-financial-advisor", label: "Origin’s calculation approach" },
      ],
    },
    {
      slug: 'portfoliopilot',
      competitorName: 'PortfolioPilot',
      title: 'Ask Linc vs PortfolioPilot | Planning vs Investing',
      description: "Compare Ask Linc vs PortfolioPilot: financial decisions with Show the Math alongside investment analysis, portfolio insights, and recommendations.",
      headline: 'Ask Linc vs PortfolioPilot',
      summary: "PortfolioPilot focuses on your investments. Ask Linc connects them to decisions about your home, work, family, and retirement.",
      rows: [
        { dimension: 'Best for', askLinc: 'Household decisions that can involve cash, debt, housing, work, family costs, investments, and retirement at the same time.', competitor: 'Investment analysis, portfolio recommendations, risk, taxes, and investor-focused planning.' },
        { dimension: 'Starting point', askLinc: '“What are we trying to decide?”', competitor: '“How should this portfolio be managed or improved?”' },
        { dimension: 'Scope', askLinc: 'The whole financial picture needed for the decision.', competitor: 'Investment-first, with broader planning capabilities around the portfolio.' },
        { dimension: 'Output', askLinc: 'A recommendation, the tradeoffs, what could change the answer, and the math behind it.', competitor: 'Portfolio analysis, investment guidance, and investor-oriented recommendations.' },
        { dimension: 'Price', askLinc: pricing.trialThenPriceLine, competitor: 'Check PortfolioPilot for current plans and feature limits.' },
      ],
      honestTake: "Choose PortfolioPilot for portfolio analysis. Choose Ask Linc when your investments are part of a bigger household decision.",
      faqs: [
        SHOW_THE_MATH_FAQ,
        { question: 'Is Ask Linc a PortfolioPilot alternative?', answer: 'If you want investment recommendations and detailed portfolio tools, PortfolioPilot is built for that. If your investment question is part of a decision about your home, work, or retirement, Ask Linc helps you see how they affect each other.' },
        { question: 'Does Ask Linc replace a human advisor?', answer: 'No. Ask Linc is decision-support software. It does not manage your money or replace personal investment, tax, or legal advice.' },
      ],
      sources: [
        { href: "https://portfoliopilot.com/", label: "PortfolioPilot features and methodology" },
      ],
    },
    {
      slug: 'monarch',
      competitorName: 'Monarch',
      title: 'Ask Linc vs Monarch Money | Decisions vs Money Management',
      description: "Compare Ask Linc vs Monarch Money. See how Show the Math explains financial decisions alongside Monarch’s budgeting, tracking, and household tools.",
      headline: 'Ask Linc vs Monarch',
      summary: "Monarch helps you track and budget. Ask Linc helps you work out what comes next: the house, the career change, or the earlier retirement.",
      rows: [
        { dimension: 'Best for', askLinc: 'A specific financial decision and the tradeoffs around it.', competitor: 'Ongoing budgeting, spending, net worth, goals, and household money management.' },
        { dimension: 'Starting point', askLinc: '“Can we afford this house without becoming house poor?”', competitor: '“Where does our money stand and where is it going?”' },
        { dimension: 'Connected accounts', askLinc: 'Used as inputs to the decision.', competitor: 'Used to organize and manage the household financial picture.' },
        { dimension: 'Output', askLinc: 'What looks workable, what is tight, what could break the plan, and what Linc would change.', competitor: 'Budgets, spending trends, goals, net worth, and a shared view of household finances.' },
        { dimension: 'Price', askLinc: `${pricing.trialThenPriceLine} Unlimited questions and accounts.`, competitor: 'Check Monarch for current pricing and promotions.' },
      ],
      honestTake: "Use Monarch for everyday budgeting and tracking. Use Ask Linc to explore your next financial decision.",
      faqs: [
        SHOW_THE_MATH_FAQ,
        { question: 'Is Ask Linc a Monarch alternative?', answer: 'It depends on what you need. Monarch focuses on ongoing money management. Ask Linc helps you work through a specific financial decision.' },
        { question: 'Can I use both?', answer: 'Yes. You can manage your financial life in Monarch and use Ask Linc when you want to test a financial decision against your numbers.' },
      ],
      sources: [
        { href: "https://www.monarch.com/", label: "Monarch tracking and reporting" },
      ],
    },
    {
      slug: 'boldin',
      competitorName: 'Boldin',
      title: 'Ask Linc vs Boldin | Self-Directed Planning Comparison',
      description: "Compare Ask Linc vs Boldin for financial planning. Explore Show the Math, visible assumptions and calculations, retirement modeling, and scenario analysis.",
      headline: 'Ask Linc vs Boldin',
      summary: "Boldin offers detailed retirement planning. Ask Linc starts with the question you’re weighing and connects it to the rest of your financial life.",
      rows: [
        { dimension: 'Best for', askLinc: 'A home, career change, family decision, investment choice, or retirement question that can affect several parts of your financial life at once.', competitor: 'Building and maintaining a detailed retirement plan with taxes, withdrawals, Social Security, healthcare, and many retirement scenarios.' },
        { dimension: 'Starting point', askLinc: 'Ask the question first; Linc builds only the model that decision needs.', competitor: 'Start a detailed retirement plan or ask Boldin AI a plain-English question grounded in that plan.' },
        { dimension: 'Retirement', askLinc: 'Retirement stays connected to decisions happening before and around it.', competitor: 'Retirement is the central planning model and product focus.' },
        { dimension: 'Math and scenarios', askLinc: 'Try different scenarios and use Show the Math to check the calculations.', competitor: 'A retirement modeling engine supports Monte Carlo, tax-aware scenarios, side-by-side comparisons, and conversational AI guidance.' },
        { dimension: 'Price', askLinc: pricing.trialThenPriceLine, competitor: 'Boldin offers free and paid planner options. Check Boldin for current pricing and feature limits.' },
      ],
      honestTake: "Choose Boldin for a detailed retirement plan. Choose Ask Linc for a specific question that connects retirement with the rest of your life.",
      faqs: [
        SHOW_THE_MATH_FAQ,
        { question: 'Is Ask Linc a Boldin alternative?', answer: 'It can be when you want a plan for a question that connects retirement with work, housing, family, or investments. Boldin is the stronger fit when your priority is building and maintaining a highly detailed retirement plan.' },
        { question: 'Does Boldin also support plain-English questions and real financial modeling?', answer: 'Yes. Boldin AI can answer questions using your retirement plan and calculate different scenarios. Boldin focuses on a detailed retirement plan. Ask Linc also helps with decisions about your home, work, family, and investments.' },
        { question: 'Can I use Ask Linc and Boldin together?', answer: 'Yes. Use Boldin for a detailed retirement plan and Ask Linc when you want to work through a specific decision that affects retirement and the rest of your financial life.' },
      ],
      sources: [
        { href: "https://www.boldin.com/retirement/features-ai-planner-assistant/", label: "Boldin AI and its modeling engine" },
      ],
    },
  ];
}

export function getComparison(slug: string, pricing: Pricing = FALLBACK_PRICING): ComparisonPage | undefined {
  return buildComparisons(pricing).find((c) => c.slug === slug);
}
