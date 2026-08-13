import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";

const config = PROMPT_PAGES.find((p) => p.slug === "home-buying")!;

export const metadata: Metadata = {
  title: "How Much House Can We Afford? — Example | Ask Linc",
  description:
    "See an illustrative home-buying answer that includes the down payment, emergency fund, monthly cost, and retirement savings.",
  alternates: {
    canonical: "https://asklinc.com/prompts/home-buying",
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
