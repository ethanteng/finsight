import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";
import { buildMarketingMetadata } from "@/lib/seo";

const config = PROMPT_PAGES.find((p) => p.slug === "retirement")!;

export const metadata: Metadata = buildMarketingMetadata({
  title: "Are We Saving Enough to Retire? — Example | Ask Linc",
  description:
    "See an illustrative retirement answer that compares a target date, monthly saving, and lifestyle.",
  path: "/prompts/retirement",
  imageAlt: "Ask Linc retirement planning example",
});

export default function RetirementPromptPage() {
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
