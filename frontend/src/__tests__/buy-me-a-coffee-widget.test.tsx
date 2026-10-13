import { render, waitFor } from "@testing-library/react";
import { BuyMeACoffeeWidget } from "@/components/marketing/BuyMeACoffeeWidget";

/*
 * The widget loads its script once per page load, so these tests run in order
 * against one page: the first leaves the script loaded for the second.
 *
 * jsdom never fetches the script, so each test plays the vendor's part: while
 * the script "executes" it registers the DOMContentLoaded listener that builds
 * the button, then fires load.
 */

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
      document.body.appendChild(node);
    });
    delete (document as { currentScript?: unknown }).currentScript;
  }
  script.dispatchEvent(new Event(outcome));
}

describe("BuyMeACoffeeWidget", () => {
  it("loads the script with the widget's settings, and tries again after a failed load", async () => {
    const { rerender } = render(<BuyMeACoffeeWidget visible />);

    const [first] = vendorScripts();
    expect(first.src).toBe("https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js");
    expect(first.dataset.id).toBe("ethanteng");
    expect(first.dataset.color).toBe("#d9ff6f");
    expect(first.getAttribute("data-x_margin")).toBe("18");
    expect(first.getAttribute("data-y_margin")).toBe("18");

    execute(first, "error");
    await waitFor(() => expect(window.addEventListener).toBe(nativeAddEventListener));
    expect(button()).toBeNull();

    rerender(<BuyMeACoffeeWidget visible={false} />);
    rerender(<BuyMeACoffeeWidget visible />);
    expect(vendorScripts()).toHaveLength(2);

    // Anything else registering on window while the script loads is registered as usual.
    const other = jest.fn();
    window.addEventListener("DOMContentLoaded", other);
    window.dispatchEvent(new Event("DOMContentLoaded"));
    expect(other).toHaveBeenCalledTimes(1);
    window.removeEventListener("DOMContentLoaded", other);

    execute(vendorScripts()[1]);
    await waitFor(() => expect(button()).not.toBeNull());
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
    const { rerender, unmount } = render(<BuyMeACoffeeWidget visible />);
    await waitFor(() => expect(button()).not.toBeNull());

    rerender(<BuyMeACoffeeWidget visible={false} />);
    expect(button()).toBeNull();

    rerender(<BuyMeACoffeeWidget visible />);
    await waitFor(() => expect(button()).not.toBeNull());
    expect(document.querySelectorAll("#bmc-wbtn")).toHaveLength(1);
    expect(vendorScripts()).toHaveLength(2);

    // Leaving the page takes it down too.
    unmount();
    expect(button()).toBeNull();
  });
});
