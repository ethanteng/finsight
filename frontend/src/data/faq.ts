import { FALLBACK_PRICING, type Pricing } from "@/config/pricing";

export type FaqItem = {
  question: string;
  answer: string;
};

/**
 * FAQ copy quotes the subscription price, so it is built from the resolved
 * price rather than baked in at module load.
 */
export function buildFaqItems(pricing: Pricing = FALLBACK_PRICING): FaqItem[] {
  return [
    { question: "Is this another budgeting app?", answer: "Ask Linc helps you work through what to do next: buying a home, taking time off, growing a family, or planning retirement. Connect your finances, ask a question, and explore the analysis." },
    { question: "Can I try it before connecting my accounts?", answer: `Yes. Try Ask Linc free for 30 days, with no credit card required. You can start with manual details, then connect accounts when you are ready. Continue for ${pricing.label} after the trial. Cancel anytime.` },
    { question: "How do I know the AI isn’t confidently wrong?", answer: "Ask Linc uses purpose-built calculations for supported scenarios and shows the inputs, assumptions, math, and sources. AI can still make mistakes, so inspect the work before making a major decision." },
    { question: "Does Ask Linc give financial advice?", answer: "Ask Linc helps you explore options and understand the tradeoffs. It does not manage your money or replace personal investment, tax, or legal advice." },
    { question: "What account data can Linc access?", answer: "Account connections are read-only. Plaid and SnapTrade supply supported balances, transactions, and holdings. Bank credentials are handled by connection providers; Ask Linc cannot move your money." },
    { question: "Is my data used to train AI models?", answer: "No. Sensitive identifying labels are removed before AI analysis, and your financial data is never used to train AI models." },
    { question: "What market information does Linc use?", answer: "Relevant interest rates, yields, inflation readings, market conditions, and financial news are brought into the answer when they affect your decision. You can inspect the sources." },
    { question: "Can I delete everything?", answer: "You can disconnect accounts immediately and request deletion at any time. Deletion is completed within 30 days, except for minimal records that may be required for security, fraud prevention, or legal compliance." },
    { question: `What does ${pricing.label} include?`, answer: `Your first 30 days are free. After that, ${pricing.label} includes connected accounts, unlimited questions and follow-ups, what-if scenarios, relevant market context, and Show the Math. Cancel anytime.` },
  ];
}

export function buildFaqPageSchema(items: FaqItem[] = buildFaqItems()) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildProductOfferSchema(pricing: Pricing = FALLBACK_PRICING) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Ask Linc",
    description:
      "Ask Linc helps people plan big financial decisions—buying a home, growing a family, changing careers, and retirement—using their real accounts.",
    brand: {
      "@type": "Brand",
      name: "Ask Linc",
    },
    url: "https://asklinc.com",
    image: "https://asklinc.com/og-image.jpg",
    offers: {
      "@type": "Offer",
      price: pricing.schemaPrice,
      priceCurrency: pricing.currency.toUpperCase(),
      availability: "https://schema.org/InStock",
      url: "https://asklinc.com/pricing",
      priceValidUntil: "2027-12-31",
      description: `Free for 1 month, then ${pricing.label} for unlimited questions, connected accounts, what-if scenarios, and math you can check.`,
    },
  };
}
