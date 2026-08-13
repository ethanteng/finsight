import { render, screen, within } from "@testing-library/react";
import AnswerPage from "@/components/marketing/AnswerPage";
import { buildAnswerPageSchemas, canIRetireWithTwoMillion } from "@/lib/answer-pages";

describe("evergreen answer page", () => {
  it("renders a structured retirement answer with reusable scenarios and sources", () => {
    render(<AnswerPage page={canIRetireWithTwoMillion} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Can I retire with $2 million?Start with what it needs to support.",
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
      "Home/Retirement/Can I retire with $2 million?",
    );

    const withdrawalTable = screen.getByRole("table", {
      name: "First-year withdrawals from a $2 million portfolio",
    });
    expect(within(withdrawalTable).getByRole("row", { name: /4\.0% \$80,000 \$6,667/i })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Six things that can change the answer." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What people ask next." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Get a benefits estimate/i })).toHaveAttribute(
      "href",
      "https://www.ssa.gov/prepare/get-benefits-estimate",
    );
    expect(screen.getByRole("link", { name: "Retirement Answers" })).toHaveAttribute(
      "href",
      "/can-i-retire-with-2-million",
    );
  });

  it("builds Article, breadcrumb, and FAQ structured data for the canonical route", () => {
    const schemas = buildAnswerPageSchemas(canIRetireWithTwoMillion);

    expect(schemas.article).toMatchObject({
      "@type": "Article",
      url: "https://asklinc.com/can-i-retire-with-2-million",
      dateModified: "2026-08-13",
    });
    expect(schemas.breadcrumbs.itemListElement).toHaveLength(3);
    expect(schemas.faq.mainEntity).toHaveLength(canIRetireWithTwoMillion.faqs.length);
    expect(schemas.faq.mainEntity[0]).toMatchObject({
      "@type": "Question",
      acceptedAnswer: { "@type": "Answer" },
    });
  });
});
