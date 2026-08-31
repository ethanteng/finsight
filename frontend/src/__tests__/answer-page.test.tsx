import { render, screen, within } from "@testing-library/react";
import AnswerPage from "@/components/marketing/AnswerPage";
import { FALLBACK_PRICING } from "@/config/pricing";
import { buildAnswerPageSchemas, canIRetireAt55, canIRetireAt60, canIRetireWithOneMillion, canIRetireWithThreeMillion, canIRetireWithTwoMillion } from "@/lib/answer-pages";

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
    expect(screen.getAllByRole("link", { name: "Retirement" }).every(
      (link) => link.getAttribute("href") === "/retirement-answers",
    )).toBe(true);
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

  it("renders the $1 million page with its own assumptions and cross-links", () => {
    render(<AnswerPage page={canIRetireWithOneMillion} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Can I retire with $1 million?Focus on the gap your savings must cover.",
    );
    expect(screen.getByLabelText("Example $1 million withdrawal amounts")).toBeInTheDocument();

    const withdrawalTable = screen.getByRole("table", {
      name: "First-year withdrawals from a $1 million portfolio",
    });
    expect(within(withdrawalTable).getByRole("row", { name: /4\.0% \$40,000 \$3,333/i })).toBeInTheDocument();
    expect(screen.getByText(/same \$1 million starting portfolio/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Can I retire with \$2 million/i })).toHaveAttribute(
      "href",
      "/can-i-retire-with-2-million",
    );

    const schemas = buildAnswerPageSchemas(canIRetireWithOneMillion);
    expect(schemas.article).toMatchObject({
      url: "https://asklinc.com/can-i-retire-with-1-million",
      headline: "Can I retire with $1 million?",
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
    // The price line comes from the live subscription price, not the page data.
    expect(screen.getByText(FALLBACK_PRICING.trialLine)).toBeInTheDocument();
  });

  it("renders the age-55 timeline, planning scenarios, and official sources", () => {
    render(<AnswerPage page={canIRetireAt55} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Can I retire at 55?Build a bridge to the benefits that start later.",
    );
    const timeline = screen.getByRole("list", {
      name: "Retirement planning milestones from age 55",
    });
    expect(within(timeline).getByText("59½")).toBeInTheDocument();
    expect(within(timeline).getByText("Earliest claiming age")).toBeInTheDocument();
    expect(within(timeline).getByText("Typical Medicare eligibility")).toBeInTheDocument();

    const portfolioTable = screen.getByRole("table", {
      name: "Illustrative portfolio needed before tax and other income",
    });
    expect(within(portfolioTable).getByRole("columnheader", { name: "$60K annual spending" })).toBeInTheDocument();
    expect(within(portfolioTable).getByRole("row", { name: /4\.0% \$1,500,000 \$2,000,000/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Topic No\. 558/i })).toHaveAttribute(
      "href",
      "https://www.irs.gov/taxtopics/tc558",
    );
    expect(screen.getAllByRole("link", { name: "Retirement" }).every(
      (link) => link.getAttribute("href") === "/retirement-answers",
    )).toBe(true);

    const schemas = buildAnswerPageSchemas(canIRetireAt55);
    expect(schemas.article).toMatchObject({
      url: "https://asklinc.com/can-i-retire-at-55",
      headline: "Can I retire at 55?",
    });
  });

  it("renders the age-60 benefit bridge and cross-links", () => {
    render(<AnswerPage page={canIRetireAt60} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Can I retire at 60?Plan the five years before Medicare—and every year after.",
    );
    const timeline = screen.getByRole("list", {
      name: "Retirement planning milestones from age 60",
    });
    expect(within(timeline).getByText("60")).toBeInTheDocument();
    expect(within(timeline).getByText("Earliest claiming age")).toBeInTheDocument();
    expect(within(timeline).getByText("Delayed credits stop")).toBeInTheDocument();

    const phaseTable = screen.getByRole("table", {
      name: "Illustrative income phases for a $1.5 million starting portfolio",
    });
    expect(within(phaseTable).getByRole("row", { name: /Age 60–61 \$70,000 \$0 \$70,000 4\.7%/i })).toBeInTheDocument();
    expect(within(phaseTable).getByRole("row", { name: /Age 62\+ with \$30K benefit \$70,000 \$30,000 \$40,000 2\.7%/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Receiving benefits before full retirement age/i })).toHaveAttribute(
      "href",
      "https://www.ssa.gov/benefits/retirement/planner/applying2.html",
    );
    expect(screen.getAllByRole("link", { name: "Retirement" }).every(
      (link) => link.getAttribute("href") === "/retirement-answers",
    )).toBe(true);

    const schemas = buildAnswerPageSchemas(canIRetireAt60);
    expect(schemas.article).toMatchObject({
      url: "https://asklinc.com/can-i-retire-at-60",
      headline: "Can I retire at 60?",
    });
  });

  it("renders the $3 million page with after-tax planning assumptions", () => {
    render(<AnswerPage page={canIRetireWithThreeMillion} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Can I retire with $3 million?Translate the balance into after-tax spending.",
    );
    expect(screen.getByLabelText("Example $3 million withdrawal amounts")).toBeInTheDocument();

    const withdrawalTable = screen.getByRole("table", {
      name: "First-year withdrawals from a $3 million portfolio",
    });
    expect(within(withdrawalTable).getByRole("row", { name: /4\.0% \$120,000 \$10,000/i })).toBeInTheDocument();
    expect(screen.getByText(/same \$3 million starting portfolio/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Medicare premiums for higher-income beneficiaries/i })).toHaveAttribute(
      "href",
      "https://www.ssa.gov/benefits/medicare/medicare-premiums.html",
    );
    expect(screen.getAllByRole("link", { name: "Retirement" }).every(
      (link) => link.getAttribute("href") === "/retirement-answers",
    )).toBe(true);

    const schemas = buildAnswerPageSchemas(canIRetireWithThreeMillion);
    expect(schemas.article).toMatchObject({
      url: "https://asklinc.com/can-i-retire-with-3-million",
      headline: "Can I retire with $3 million?",
    });
  });
});
