import type { Metadata } from "next";
import MarketingSubpage from "../../components/marketing/MarketingSubpage";

export const metadata: Metadata = {
  title: "How Much House Can You Afford? | Ask Linc",
  description:
    "Test a home price against your down payment, emergency fund, monthly costs, and retirement savings before you commit.",
  alternates: {
    canonical: "https://asklinc.com/buying-a-house",
  },
  robots: { index: true, follow: true },
};

export default function BuyingAHousePageRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ["use-cases", "home-buying"] })} />;
}
