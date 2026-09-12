import type { Metadata } from "next";
import StructuredData from "@/components/StructuredData";
import { CoastFireCalculator } from "@/components/marketing/CoastFireCalculator";
import { CoastFireCalculatorSeoContent } from "@/components/marketing/CoastFireCalculatorSeoContent";
import { COAST_FIRE_FAQ } from "@/lib/coast-fire";
import "@/components/marketing/coast-fire.css";

const canonical = "https://asklinc.com/coast-fire-calculator";

// Kept under ~155 characters: past that a search result truncates the sentence
// mid-claim, and the claim is the reason to click.
const description =
  "Free Coast FIRE calculator. Find what you need invested today to retire without adding another dollar, and see every assumption behind the answer.";

// The longer version, for the schema description, which is not snippet-length.
const applicationDescription =
  "Enter seven numbers and get your Coast FIRE number in today's dollars, your retirement target, what your savings reach with no further contributions, and every assumption behind the answer.";

export const metadata: Metadata = {
  title: "Free Coast FIRE Calculator | Ask Linc",
  description,
  keywords: [
    "Coast FIRE calculator",
    "Coast FIRE number",
    "Coast FIRE by age",
    "Coast FIRE with Social Security",
    "financial independence calculator",
    "when can I stop contributing to retirement",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Have I Reached Coast FIRE? | Ask Linc",
    description,
    type: "website",
    url: canonical,
    siteName: "Ask Linc",
    images: [
      {
        url: "https://asklinc.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Ask Linc Coast FIRE calculator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Have I Reached Coast FIRE?",
    description,
    images: ["https://asklinc.com/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const applicationSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Ask Linc Coast FIRE Calculator",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  url: canonical,
  description: applicationDescription,
  isAccessibleForFree: true,
  provider: { "@type": "Organization", name: "Ask Linc", url: "https://asklinc.com" },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Coast FIRE number in today's dollars",
    "Retirement target and no-contribution projection",
    "Real-return sensitivity comparison",
    "Visible calculation assumptions",
  ],
};

// Generated from the same array the page renders: Google drops FAQ rich results
// when the marked-up answer is not the answer on the page, and a second copy of
// the text is exactly how that drift happens.
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: COAST_FIRE_FAQ.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Ask Linc", item: "https://asklinc.com" },
    { "@type": "ListItem", position: 2, name: "Retirement", item: "https://asklinc.com/retirement-answers" },
    { "@type": "ListItem", position: 3, name: "Coast FIRE calculator", item: canonical },
  ],
};

export default function CoastFireCalculatorPage() {
  return (
    <>
      <StructuredData data={applicationSchema} />
      <StructuredData data={faqSchema} />
      <StructuredData data={breadcrumbSchema} />
      <CoastFireCalculator>
        <CoastFireCalculatorSeoContent />
      </CoastFireCalculator>
    </>
  );
}
