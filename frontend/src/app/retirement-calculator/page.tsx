import type { Metadata } from "next";
import StructuredData from "@/components/StructuredData";
import { RetirementQuickPlan } from "@/components/marketing/RetirementQuickPlan";
import { RetirementCalculatorSeoContent } from "@/components/marketing/RetirementCalculatorSeoContent";
import { RETIREMENT_CALCULATOR_FAQ } from "@/lib/retirement-calculator-content";
import "@/components/marketing/retirement-quickplan.css";
import {
  readRetirementAge,
  retirementHeadline,
  type RetirementLandingParams,
} from "@/lib/retirement-landing";

const canonical = "https://asklinc.com/retirement-calculator";
// Kept under ~155 characters: past that a search result truncates the sentence
// mid-claim, and the claim is the reason to click.
const description =
  "Free retirement calculator. Six numbers, tested against a century of real US market history, inflation and sequence-of-returns risk. No chat, no guesswork.";

// The longer version, for the schema description, which is not snippet-length.
const applicationDescription =
  "Answer six questions and run them through Ask Linc's deterministic retirement engine: a century of month-by-month market history, real inflation, and real sequence risk. No chat, no guesswork.";

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<RetirementLandingParams> }
): Promise<Metadata> {
  const age = readRetirementAge(await searchParams);
  // The page ranks for "retirement calculator" and its age variants, so the
  // term belongs in the title even when an ad bought the question form.
  const title = `${retirementHeadline(age)} Retirement Calculator | Ask Linc`;
  const socialTitle = `${retirementHeadline(age)} Run the Real Model`;

  return {
    title,
    description,
    keywords: [
      "retirement calculator",
      "free retirement calculator",
      age === null ? "when can I retire" : `can I retire at ${age}`,
      "safe withdrawal rate calculator",
      "sequence of returns risk",
      "historical retirement simulation",
      "retirement stress test",
    ],
    // Every ad variant is the same page with a different question on it, so
    // they all point at the bare URL rather than splitting its ranking.
    alternates: { canonical },
    openGraph: {
      title: socialTitle,
      description,
      type: "website",
      url: canonical,
      siteName: "Ask Linc",
      images: [
        {
          url: "https://asklinc.com/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "Ask Linc retirement model",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
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
}

const applicationSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Ask Linc Retirement Model",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  url: canonical,
  description: applicationDescription,
  isAccessibleForFree: true,
  provider: { "@type": "Organization", name: "Ask Linc", url: "https://asklinc.com" },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Historical sequence-of-returns stress test over a century of US market data",
    "Inflation-adjusted withdrawals with pre-retirement contributions",
    "Social Security modeled as a COLA-indexed income from your claiming age",
    "Sustainable spending distribution for the chosen asset mix",
  ],
};

// Generated from the same array the page renders: Google drops FAQ rich results
// when the marked-up answer is not the answer on the page, and a second copy of
// the text is exactly how that drift happens.
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: RETIREMENT_CALCULATOR_FAQ.map((item) => ({
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
    { "@type": "ListItem", position: 3, name: "Retirement model", item: canonical },
  ],
};

export default async function RetirementCalculatorPage(
  { searchParams }: { searchParams: Promise<RetirementLandingParams> }
) {
  const age = readRetirementAge(await searchParams);

  return (
    <>
      <StructuredData data={applicationSchema} />
      <StructuredData data={faqSchema} />
      <StructuredData data={breadcrumbSchema} />
      <RetirementQuickPlan headline={retirementHeadline(age)} initialRetirementAge={age}>
        <RetirementCalculatorSeoContent />
      </RetirementQuickPlan>
    </>
  );
}
