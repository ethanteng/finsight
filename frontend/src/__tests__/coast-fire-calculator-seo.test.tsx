import { render, screen } from "@testing-library/react";
import { CoastFireCalculatorSeoContent } from "@/components/marketing/CoastFireCalculatorSeoContent";
import { COAST_FIRE_FAQ } from "@/lib/coast-fire";

describe("Coast FIRE calculator SEO", () => {
  it("renders the FAQ and links to the supporting Coast FIRE cluster", () => {
    render(<CoastFireCalculatorSeoContent />);

    for (const item of COAST_FIRE_FAQ) {
      expect(screen.getByRole("heading", { name: item.question })).toBeInTheDocument();
      expect(screen.getByText(item.answer)).toBeInTheDocument();
    }

    for (const href of [
      "/blog/coast-fire",
      "/blog/coast-fire-by-age",
      "/blog/coast-fire-vs-fire-vs-barista-fire",
      "/blog/after-coast-fire-stop-contributing",
    ]) {
      expect(document.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });
});
