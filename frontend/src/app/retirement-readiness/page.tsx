import type { Metadata } from "next";
import MarketingSubpage from "../../components/marketing/MarketingSubpage";

export const metadata: Metadata = {
  title: "Are You Saving Enough to Retire? | Ask Linc",
  description:
    "Check how your savings rate, spending, retirement date, and market stress affect the same retirement plan.",
  alternates: {
    canonical: "https://asklinc.com/retirement-readiness",
  },
  robots: { index: true, follow: true },
};

export default function RetirementReadinessPageRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ["use-cases", "retirement"] })} />;
}
