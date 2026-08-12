export type FaqItem = {
  question: string;
  answer: string;
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is this just another budget tracking app?",
    answer:
      "No. Budget tracking apps show you what already happened. Ask Linc helps you reason about what's happening now—and what it means for your specific situation—by combining your accounts with market context and plain-English explanations.",
  },
  {
    question: "Is there a free plan or trial?",
    answer:
      "No. Ask Linc is $9/month for full access with your own accounts. Cancel anytime.",
  },
  {
    question: "I don't want to give AI companies all my financial data...",
    answer:
      "You don't give AI providers your bank logins. We use Plaid to securely connect accounts in read-only mode. Your credentials are never shared with us, and your financial data is not used to train AI models. You're always in control and can disconnect accounts at any time.",
  },
  {
    question: "How do you know what's going on in the market?",
    answer:
      "Ask Linc pulls in current market context—interest rates, bond yields, inflation data, and relevant news—and uses it to ground answers in what's happening right now, not generic advice.",
  },
  {
    question: "How do I know the AI isn't confidently wrong?",
    answer:
      "The numbers aren't improvised. Ask Linc runs deterministic calculations on your connected data, shows the math behind answers, and cites live market sources. You can inspect the work — not just trust a black box.",
  },
  {
    question: "What if I want to delete everything?",
    answer:
      "You can view, export, or delete your data at any time. Deleting your data permanently removes it from our systems.",
  },
];

export function buildFaqPageSchema(items: FaqItem[] = FAQ_ITEMS) {
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

export const PRODUCT_OFFER_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Ask Linc",
  description:
    "AI financial reasoning assistant for households planning retirement — decisions-ready answers grounded in your accounts and live market conditions, not charts.",
  brand: {
    "@type": "Brand",
    name: "Ask Linc",
  },
  url: "https://asklinc.com",
  image: "https://asklinc.com/og-image.jpg",
  offers: {
    "@type": "Offer",
    price: "9.00",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    url: "https://asklinc.com/pricing",
    priceValidUntil: "2027-12-31",
    description: "$9/month flat — vs the 1-2% of your wealth a human advisor charges every year.",
  },
};
