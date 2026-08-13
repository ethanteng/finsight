import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";

const config = PROMPT_PAGES.find((p) => p.slug === "financial-stress-testing")!;

export const metadata: Metadata = {
  title: "Could We Live on One Income? — Example | Ask Linc",
  description:
    "See an illustrative example that tests one income against childcare, housing, cash reserves, and retirement saving.",
  alternates: {
    canonical: "https://asklinc.com/prompts/financial-stress-testing",
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
