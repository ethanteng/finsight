import { render, screen, within } from "@testing-library/react";
import FeaturesPageRoute from "@/app/features/page";
import { metadata } from "@/app/trust/page";
import MarketingHome from "@/components/marketing/MarketingHome";
import TrustPage, { TRUST_FAQS } from "@/components/marketing/TrustPage";

describe("trust page", () => {
  it("publishes indexable metadata for the evergreen route", () => {
    expect(metadata).toMatchObject({
      title: "See the Math Behind Every Answer | Ask Linc",
      alternates: { canonical: "https://asklinc.com/trust" },
      openGraph: { url: "https://asklinc.com/trust" },
      robots: { index: true, follow: true },
    });
  });

  it("explains the verifiable financial reasoning pipeline and Show the Math", () => {
    render(<TrustPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Don't trust the answer. Check it.",
    );
    expect(screen.getByRole("heading", { name: /here’s how linc does the work/i })).toBeInTheDocument();
    expect(screen.getByText(/no product is perfect/i)).toBeInTheDocument();
    expect(screen.getByText(/purpose-built tools handle supported math/i)).toBeInTheDocument();

    const answerCheck = screen.getByLabelText("Illustrative Ask Linc answer with checks");
    ["Your numbers", "Assumptions", "Math", "Checks", "Sources"].forEach((label) => {
      expect(within(answerCheck).getByText(label)).toBeInTheDocument();
    });
  });

  it("includes the approved FAQ and supporting trust content", () => {
    render(<TrustPage />);

    TRUST_FAQS.forEach(({ question }) => {
      expect(screen.getByText(question)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /see how your data is protected/i })).toHaveAttribute(
      "href",
      "/how-we-protect-your-data",
    );

  });

  it("links existing trust and verification copy back to the evergreen page", async () => {
    const { unmount } = render(<MarketingHome />);
    expect(screen.getByRole("link", { name: /see how answers are checked/i })).toHaveAttribute("href", "/trust");
    unmount();

    render(<FeaturesPageRoute />);
    const coverageSection = screen
      .getByRole("heading", { name: /the right numbers.*a plan you can check/i })
      .closest("section");
    expect(coverageSection).not.toBeNull();
    expect(within(coverageSection as HTMLElement).getByRole("link", { name: /show the math/i })).toHaveAttribute(
      "href",
      "/trust",
    );
  });
});
