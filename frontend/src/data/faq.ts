export type FaqItem = {
  question: string;
  answer: string;
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is this just another budget tracking app?",
    answer:
      "No. Budget tracking apps show you what already happened. Ask Linc helps you work through what to do next—such as buying a home, taking parental leave, changing jobs, or planning retirement.",
  },
  {
    question: "Is there a free plan or trial?",
    answer:
      "Yes. Start with a free 1-month trial, then Ask Linc is $9/month for full access with your own accounts. Cancel anytime.",
  },
  {
    question: "I don't want to give AI companies all my financial data...",
    answer:
      "You don't give AI providers your bank logins. We use Plaid to securely connect accounts in read-only mode. Your credentials are never shared with us, and your financial data is not used to train AI models. You're always in control and can disconnect accounts at any time.",
  },
  {
    question: "How do you know what's going on in the market?",
    answer:
      "When a rate, inflation reading, price, or news event affects your question, Ask Linc includes it in the answer and shows the source date.",
  },
  {
    question: "How do I know the AI isn't confidently wrong?",
    answer:
      "The numbers aren't improvised. Ask Linc runs fixed calculations on your connected data, shows the inputs and assumptions, and cites dated market sources when it uses them.",
  },
  {
    question: "What if I want to delete everything?",
    answer:
      "You can disconnect accounts immediately and request deletion at any time. Deletion is completed within 30 days, except for minimal records required for security, fraud prevention, or legal compliance.",
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
    "Ask Linc helps people plan big financial decisions—buying a home, growing a family, changing careers, and retirement—using their real accounts.",
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
    description: "$9/month for unlimited questions, connected accounts, what-if scenarios, and calculations you can inspect.",
  },
};
