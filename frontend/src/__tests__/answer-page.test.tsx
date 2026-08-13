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

  it("takes page-specific assumptions and labels from the page model", () => {
    const customPage = {
      ...canIRetireWithTwoMillion,
      readTime: "6 min read",
      numberStripLabel: "Example custom portfolio withdrawals",
      withdrawalSection: {
        ...canIRetireWithTwoMillion.withdrawalSection,
        tocLabel: "What the custom balance supports",
        heading: "What can the custom balance support?",
        tableCaption: "First-year withdrawals from a custom portfolio",
        noteTitle: "Custom note title",
        noteBody: "Custom note body",
      },
      scenarioTableCaption: "Custom income scenario caption",
      scenarioTableFootnote: "Custom income scenario footnote",
      productBridge: {
        heading: "Custom product bridge heading",
        body: "Custom product bridge body",
        priceNote: "Custom price note",
      },
    };

    render(<AnswerPage page={customPage} />);

    expect(screen.getByText(/Reviewed August 13, 2026 · 6 min read/)).toBeInTheDocument();
    expect(screen.getByLabelText("Example custom portfolio withdrawals")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "What the custom balance supports" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What can the custom balance support?" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "First-year withdrawals from a custom portfolio" })).toBeInTheDocument();
    expect(screen.getByText("Custom note body")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Custom income scenario caption" })).toBeInTheDocument();
    expect(screen.getByText("Custom income scenario footnote")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Custom product bridge heading" })).toBeInTheDocument();
    expect(screen.getByText("Custom price note")).toBeInTheDocument();
  });
});
