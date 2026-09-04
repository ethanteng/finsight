import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";
import { buildMarketingMetadata } from "@/lib/seo";

const config = PROMPT_PAGES.find((p) => p.slug === "portfolio-analysis")!;

export const metadata: Metadata = buildMarketingMetadata({
  title: "Are Our Investments Taking Too Much Risk? | Ask Linc",
  description:
    "See an illustrative example that connects investment risk to a household retirement goal.",
  path: "/prompts/portfolio-analysis",
  imageAlt: "Ask Linc portfolio risk example",
});

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
