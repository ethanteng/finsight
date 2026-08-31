import { render, screen, within } from "@testing-library/react";
import RetirementAnswersPage, { metadata } from "@/app/retirement-answers/page";

describe("retirement answer library", () => {
  it("organizes every published answer by balance and retirement age", () => {
    const { container } = render(<RetirementAnswersPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Start with the math. Then test the whole plan.",
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
      "Home/Retirement",
    );

    [
      ["Read Can I retire with $1 million?", "/can-i-retire-with-1-million"],
      ["Read Can I retire with $2 million?", "/can-i-retire-with-2-million"],
      ["Read Can I retire with $3 million?", "/can-i-retire-with-3-million"],
      ["Read Can I retire at 55?", "/can-i-retire-at-55"],
      ["Read Can I retire at 60?", "/can-i-retire-at-60"],
    ].forEach(([name, href]) => {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    });

    const comparison = screen.getByRole("table", {
      name: "First-year portfolio withdrawals at three illustrative starting rates",
    });
    expect(within(comparison).getByRole("row", { name: /\$2M portfolio \$60K \/ year \$70K \/ year \$80K \/ year/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /retirement starts with the decisions before it/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /explore the decision/i }).map((link) => link.getAttribute("href"))).toEqual([
      "/use-cases/home-buying",
      "/use-cases/family-planning",
      "/use-cases/financial-stress-testing",
    ]);

    const schemas = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
      (script) => JSON.parse(script.textContent || "{}"),
    );
    expect(schemas[0]).toMatchObject({
      "@type": "CollectionPage",
      url: "https://asklinc.com/retirement-answers",
      mainEntity: { "@type": "ItemList", numberOfItems: 5 },
    });
    expect(schemas[0].mainEntity.itemListElement).toHaveLength(5);
    expect(schemas[1]).toMatchObject({ "@type": "BreadcrumbList" });
  });

  it("publishes canonical and social metadata", () => {
    expect(metadata).toMatchObject({
      title: "Retirement: Can I Retire? | Ask Linc",
      alternates: { canonical: "https://asklinc.com/retirement-answers" },
      openGraph: { url: "https://asklinc.com/retirement-answers" },
      robots: { index: true, follow: true },
    });
  });
});
