import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DemoPage, { metadata } from "@/app/demo/page";
import StaticProductDemo from "@/components/marketing/StaticProductDemo";
import { DEMO_FAQS } from "@/lib/demo-content";

type AnalyticsWindow = Window & typeof globalThis & {
  dataLayer?: Array<Record<string, unknown>>;
};

describe("interactive demo landing page", () => {
  const analyticsWindow = window as AnalyticsWindow;

  beforeEach(() => {
    window.history.replaceState({}, "", "/demo?utm_source=email&utm_medium=nurture");
    analyticsWindow.dataLayer = [];
  });

  it("publishes indexable product-demo metadata", () => {
    expect(metadata).toMatchObject({
      title: "Interactive AI Financial Planning Software Demo | Ask Linc",
      alternates: { canonical: "https://asklinc.com/demo" },
      openGraph: { url: "https://asklinc.com/demo" },
      robots: { index: true, follow: true },
    });
    expect(String(metadata.description).length).toBeLessThanOrEqual(160);
  });

  it("renders the product experience, supporting content, and schema", () => {
    const { container } = render(<DemoPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Explore an interactive AI financial planning software demo.",
    );
    const demo = screen.getByLabelText("Interactive Ask Linc product demo");
    expect(demo.closest("details")).toBeNull();
    expect(within(demo).getByRole("button", { name: "Decisions" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Explore accounts and data" })).toHaveAttribute("href", "/integrations");
    expect(screen.getAllByRole("link", { name: "Try it with my finances" })).toHaveLength(3);
    DEMO_FAQS.forEach(({ question }) => expect(screen.getByText(question)).toBeInTheDocument());

    const schemas = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
      (script) => JSON.parse(script.textContent || "{}"),
    );
    expect(schemas).toEqual(expect.arrayContaining([
      expect.objectContaining({ "@type": "WebApplication", url: "https://asklinc.com/demo" }),
      expect.objectContaining({ "@type": "FAQPage" }),
      expect.objectContaining({ "@type": "BreadcrumbList" }),
    ]));
  });

  it("tracks active exploration without treating automatic tab rotation as engagement", async () => {
    const user = userEvent.setup();
    render(<DemoPage />);
    const demo = screen.getByLabelText("Interactive Ask Linc product demo");

    await user.click(within(demo).getByRole("tab", { name: "math" }));
    await user.click(within(demo).getByRole("button", { name: "Finances" }));
    await user.click(within(demo).getByRole("button", { name: "Accounts & context" }));

    expect(analyticsWindow.dataLayer).toEqual([
      {
        event: "product_demo_started",
        source_page: "/demo",
        content_type: "product_demo",
      },
      {
        event: "product_demo_detail_viewed",
        source_page: "/demo",
        content_type: "product_demo",
        demo_detail: "math",
      },
      {
        event: "product_demo_section_viewed",
        source_page: "/demo",
        content_type: "product_demo",
        demo_section: "finances",
      },
      {
        event: "product_demo_section_viewed",
        source_page: "/demo",
        content_type: "product_demo",
        demo_section: "accounts",
      },
      {
        event: "product_demo_completed",
        source_page: "/demo",
        content_type: "product_demo",
      },
    ]);
  });

  it("does not treat keyboard focus navigation as demo engagement", () => {
    render(<DemoPage />);
    const demo = screen.getByLabelText("Interactive Ask Linc product demo");

    fireEvent.keyDown(within(demo).getByRole("button", { name: "Decisions" }), { key: "Tab" });

    expect(analyticsWindow.dataLayer).toEqual([]);
  });

  it("keeps shared demo embeds outside the dedicated demo funnel by default", async () => {
    const user = userEvent.setup();
    render(<StaticProductDemo anchorId={null} />);
    const demo = screen.getByLabelText("Interactive Ask Linc product demo");

    await user.click(within(demo).getByRole("tab", { name: "math" }));
    await user.click(within(demo).getByRole("button", { name: "Finances" }));

    expect(analyticsWindow.dataLayer).toEqual([]);
  });
});
