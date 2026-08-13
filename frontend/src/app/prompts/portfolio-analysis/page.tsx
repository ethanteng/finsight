import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";

const config = PROMPT_PAGES.find((p) => p.slug === "portfolio-analysis")!;

export const metadata: Metadata = {
  title: "Are Our Investments Taking Too Much Risk? | Ask Linc",
  description:
    "See an illustrative example that connects investment risk to a household retirement goal.",
  alternates: {
    canonical: "https://asklinc.com/prompts/portfolio-analysis",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PortfolioAnalysisPromptPage() {
  return (
    <PromptExamplePage
      title={config.title}
      description={config.description}
      cta={config.cta}
      example={config.example}
      useCaseHref={config.useCaseHref}
    />
  );
}
