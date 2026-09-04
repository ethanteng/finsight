import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";
import { buildMarketingMetadata } from "@/lib/seo";

const config = PROMPT_PAGES.find((p) => p.slug === "financial-stress-testing")!;

export const metadata: Metadata = buildMarketingMetadata({
  title: "Could We Live on One Income? — Example | Ask Linc",
  description:
    "See an illustrative example that tests one income against childcare, housing, cash reserves, and retirement saving.",
  path: "/prompts/financial-stress-testing",
  imageAlt: "Ask Linc one-income financial stress test",
});

export default function FinancialStressTestingPromptPage() {
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
