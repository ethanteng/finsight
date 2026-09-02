import { pushBeginCheckout, pushViewExamples, pushViewMoreExamples } from "@/lib/dataLayer";

type AnalyticsWindow = Window & typeof globalThis & {
  dataLayer?: Array<Record<string, unknown> | unknown[]>;
  gtag?: jest.Mock;
};

describe("begin_checkout analytics", () => {
  const analyticsWindow = window as AnalyticsWindow;

  beforeEach(() => {
    window.history.replaceState({}, "", "/can-i-retire-with-2-million");
    analyticsWindow.dataLayer = [];
    analyticsWindow.gtag = jest.fn();
  });

  afterEach(() => {
    delete analyticsWindow.gtag;
  });

  it("attributes answer-page CTA intent once through the GTM data layer", () => {
    pushBeginCheckout("answer_product_bridge");

    const event = {
      event: "begin_checkout",
      source_page: "/can-i-retire-with-2-million",
      cta_location: "answer_product_bridge",
      content_type: "retirement_answer",
    };
    expect(analyticsWindow.dataLayer).toContainEqual(event);
    expect(analyticsWindow.dataLayer).toHaveLength(1);
    expect(analyticsWindow.gtag).not.toHaveBeenCalled();
  });

  it("classifies the library separately from individual answers", () => {
    window.history.replaceState({}, "", "/retirement-answers");

    pushBeginCheckout("page_cta");

    expect(analyticsWindow.dataLayer).toContainEqual(expect.objectContaining({
      source_page: "/retirement-answers",
      cta_location: "page_cta",
      content_type: "retirement_answers_hub",
    }));
  });
});

describe("example-view analytics", () => {
  const analyticsWindow = window as AnalyticsWindow;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    analyticsWindow.dataLayer = [];
    analyticsWindow.gtag = jest.fn();
  });

  afterEach(() => {
    delete analyticsWindow.gtag;
  });

  // Same duplicate-emission shape begin_checkout had: these pushed to the data
  // layer and then called gtag directly, so a GA4 tag in GTM plus a directly
  // loaded gtag would each count the same interaction.
  it.each([
    ["view_examples", pushViewExamples],
    ["view_more_examples", pushViewMoreExamples],
  ])("sends %s once, through the data layer only", (event, push) => {
    push();

    expect(analyticsWindow.dataLayer).toEqual([{ event, source_page: "/" }]);
    expect(analyticsWindow.gtag).not.toHaveBeenCalled();
  });
});
