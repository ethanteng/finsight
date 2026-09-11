import type { Metadata } from "next";
import StructuredData from "@/components/StructuredData";
import { CoastFireLanding } from "@/components/marketing/CoastFireLanding";
import "@/components/marketing/coast-fire.css";

const canonical = "https://asklinc.com/coast-fire";
const description =
  "Turn your Coast FIRE number into real choices about work, saving, spending, and time—with a plan built from your actual finances.";

export const metadata: Metadata = {
  title: "Coast FIRE Planning: Know What You Can Change | Ask Linc",
  description,
  keywords: [
    "Coast FIRE",
    "Coast FIRE planning",
    "financial independence",
    "stop contributing to retirement",
    "career change financial planning",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Know What Your Money Lets You Do Next | Ask Linc",
    description,
    type: "website",
    url: canonical,
    siteName: "Ask Linc",
    images: [{ url: "https://asklinc.com/og-image.jpg", width: 1200, height: 630, alt: "Ask Linc Coast FIRE planning" }],
  },
  twitter: { card: "summary_large_image", title: "Know What Your Money Lets You Do Next", description, images: ["https://asklinc.com/og-image.jpg"] },
  robots: { index: true, follow: true },
};

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Coast FIRE Planning",
  url: canonical,
  description,
  isPartOf: { "@type": "WebSite", name: "Ask Linc", url: "https://asklinc.com" },
};

export default function CoastFirePage() {
  return (
    <>
      <StructuredData data={webPageSchema} />
      <CoastFireLanding />
    </>
  );
}
