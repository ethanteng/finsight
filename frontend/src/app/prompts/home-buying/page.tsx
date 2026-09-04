import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";
import { buildMarketingMetadata } from "@/lib/seo";

const config = PROMPT_PAGES.find((p) => p.slug === "home-buying")!;

export const metadata: Metadata = buildMarketingMetadata({
  title: "How Much House Can We Afford? — Example | Ask Linc",
  description:
    "See an illustrative home-buying answer that includes the down payment, emergency fund, monthly cost, and retirement savings.",
  path: "/prompts/home-buying",
  imageAlt: "Ask Linc home affordability example",
});

export default function HomeBuyingPromptPage() {
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
