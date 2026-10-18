import { fireEvent, render, waitFor } from "@testing-library/react";
import { BuyMeACoffeeWidget } from "@/components/marketing/BuyMeACoffeeWidget";

/*
 * The widget loads its script once per page load, so these tests run in order
 * against one page: the first leaves the script loaded for the second.
 *
 * jsdom never fetches the script, so each test plays the vendor's part: while
 * the script "executes" it registers the DOMContentLoaded listener that builds
 * the button, then fires load. Like the vendor's, the listener reads the
 * message off the tag each time it builds.
 */

const CALCULATOR_MESSAGE = "Found this calculator helpful? Chip in $5 to help keep it free for everyone. ❤️";
const BLOG_MESSAGE = "Found this helpful? Buy me a coffee to help keep the posts coming. ☕❤️";

const nativeAddEventListener = window.addEventListener;

function vendorScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('script[data-name="BMC-Widget"]'));
}

function button(): HTMLElement | null {
  return document.getElementById("bmc-wbtn");
}

function execute(script: HTMLScriptElement, outcome: "load" | "error" = "load") {
  if (outcome === "load") {
    Object.defineProperty(document, "currentScript", { configurable: true, get: () => script });
    window.addEventListener("DOMContentLoaded", () => {
      const node = document.createElement("div");
      node.id = "bmc-wbtn";
      node.textContent = script.dataset.message ?? "";
      document.body.appendChild(node);
    });
    delete (document as { currentScript?: unknown }).currentScript;
  }
  script.dispatchEvent(new Event(outcome));
}

describe("BuyMeACoffeeWidget", () => {
  it("loads the script with the widget's settings, and tries again after a failed load", async () => {
    const { rerender } = render(<BuyMeACoffeeWidget placement="calculator" visible />);

    const [first] = vendorScripts();
    expect(first.src).toBe("https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js");
    expect(first.dataset.id).toBe("ethanteng");
    expect(first.dataset.color).toBe("#d9ff6f");
    expect(first.getAttribute("data-x_margin")).toBe("18");
    expect(first.getAttribute("data-y_margin")).toBe("18");
    // Written per placement, at each build.
    expect(first.hasAttribute("data-message")).toBe(false);

    execute(first, "error");
    await waitFor(() => expect(window.addEventListener).toBe(nativeAddEventListener));
    expect(button()).toBeNull();

    rerender(<BuyMeACoffeeWidget placement="calculator" visible={false} />);
    rerender(<BuyMeACoffeeWidget placement="calculator" visible />);
    // A new tag, and the dead one gone: the script reads the first tag with its name.
    const [second] = vendorScripts();
    expect(vendorScripts()).toHaveLength(1);
    expect(second).not.toBe(first);

    // Anything else registering on window while the script loads is registered as usual.
    const other = jest.fn();
    window.addEventListener("DOMContentLoaded", other);
    window.dispatchEvent(new Event("DOMContentLoaded"));
    expect(other).toHaveBeenCalledTimes(1);
    window.removeEventListener("DOMContentLoaded", other);

    execute(second);
    await waitFor(() => expect(button()).not.toBeNull());
    expect(button()?.textContent).toBe(CALCULATOR_MESSAGE);
    expect(window.addEventListener).toBe(nativeAddEventListener);
    // The primary CTA's edge, which the script has no setting for.
    expect(button()?.style.border).toBe("1px solid rgb(161, 188, 96)"); // #a1bc60

    // The vendor's own listener was kept, not registered on window.
    window.dispatchEvent(new Event("DOMContentLoaded"));
    expect(document.querySelectorAll("#bmc-wbtn")).toHaveLength(1);
  });

  it("comes down with the form and goes back up without loading the script again", async () => {
    // The previous test's button went with its unmount.
    expect(button()).toBeNull();
    const { rerender, unmount } = render(<BuyMeACoffeeWidget placement="calculator" visible />);
    await waitFor(() => expect(button()).not.toBeNull());

    rerender(<BuyMeACoffeeWidget placement="calculator" visible={false} />);
    expect(button()).toBeNull();

    rerender(<BuyMeACoffeeWidget placement="calculator" visible />);
    await waitFor(() => expect(button()).not.toBeNull());
    expect(document.querySelectorAll("#bmc-wbtn")).toHaveLength(1);
    expect(vendorScripts()).toHaveLength(1);

    // Leaving the page takes it down too.
    unmount();
    expect(button()).toBeNull();
  });

  it("builds each placement with its own message", async () => {
    const { rerender, unmount } = render(<BuyMeACoffeeWidget placement="blog" />);
    await waitFor(() => expect(button()?.textContent).toBe(BLOG_MESSAGE));

    // Moving from the blog to a calculator rebuilds the button with its message.
    rerender(<BuyMeACoffeeWidget placement="calculator" />);
    await waitFor(() => expect(button()?.textContent).toBe(CALCULATOR_MESSAGE));
    expect(document.querySelectorAll("#bmc-wbtn")).toHaveLength(1);
    expect(vendorScripts()).toHaveLength(1);

    unmount();
    expect(button()).toBeNull();
  });

  it("reports opening the panel, not clicks while it is already open", async () => {
    const analyticsWindow = window as Window & typeof globalThis & { dataLayer?: unknown[] };
    analyticsWindow.dataLayer = [];
    const { unmount } = render(<BuyMeACoffeeWidget placement="calculator" visible />);
    await waitFor(() => expect(button()).not.toBeNull());

    fireEvent.click(button() as HTMLElement);
    expect(analyticsWindow.dataLayer).toEqual([expect.objectContaining({ event: "bmc_widget_opened" })]);

    // The widget's frame shows while its panel is open; the button only ever opens it.
    const frame = document.createElement("iframe");
    frame.id = "bmc-iframe";
    frame.style.opacity = "1";
    document.body.appendChild(frame);
    fireEvent.click(button() as HTMLElement);
    expect(analyticsWindow.dataLayer).toHaveLength(1);

    // Closed again, the next click opens it.
    frame.style.opacity = "0";
    fireEvent.click(button() as HTMLElement);
    expect(analyticsWindow.dataLayer).toHaveLength(2);
    frame.remove();

    // Clicks elsewhere are not the widget's.
    fireEvent.click(document.body);
    unmount();
    fireEvent.click(document.body);
    expect(analyticsWindow.dataLayer).toHaveLength(2);
  });
});
