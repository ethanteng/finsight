"use client";

/**
 * Buy Me a Coffee's floating button, on the two free calculators while their
 * form is showing. A run's result replaces the form on the same page, so the
 * button comes down with the form and goes back up with "Edit inputs".
 *
 * The vendor's script is written to sit in a page's HTML: it builds the button
 * in a `DOMContentLoaded` listener on window, and in a client-rendered page
 * that event has fired long before the script arrives. The usual fix, firing
 * a fake `DOMContentLoaded` at window, would also re-run every other listener
 * registered there, tags GTM loads included. So the one listener this script
 * registers is kept instead, and called whenever the button should appear.
 *
 * It appends its nodes straight to body, so each showing removes exactly the
 * nodes it added.
 *
 * Opening the panel is reported for the admin Visitors tab. The button only
 * ever opens it (the overlay closes it), so a click counts only when the
 * panel was not already showing.
 */

import { useEffect } from "react";
import { pushBuyMeACoffeeOpened } from "@/lib/dataLayer";

const SCRIPT_SRC = "https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js";

/**
 * The site's primary CTA (`.button-primary` in marketing.css): lime with a
 * darker green edge, which is what keeps lime visible on the page's paper.
 * The script takes only a background color, so the edge is added after it
 * builds the button.
 */
const CTA_LIME = "#d9ff6f";
const CTA_EDGE = "#a1bc60";

/** The script reads its settings from its own tag's data attributes. */
const SETTINGS: Record<string, string> = {
  "data-name": "BMC-Widget",
  "data-cfasync": "false",
  "data-id": "ethanteng",
  "data-description": "Support me on Buy me a coffee!",
  "data-message": "Found this calculator useful? Consider donating $5 to help cover my costs & keep it free for everyone! ☕",
  "data-color": CTA_LIME,
  "data-position": "Right",
  "data-x_margin": "18",
  "data-y_margin": "18",
};

type BuildWidget = () => void;

let loading: Promise<BuildWidget | null> | null = null;

/** Loads the script once per page load and resolves to its builder, or null if it failed. */
function loadWidget(): Promise<BuildWidget | null> {
  loading ??= new Promise((resolve) => {
    const script = document.createElement("script");
    let build: BuildWidget | null = null;

    const hadOwnListener = Object.prototype.hasOwnProperty.call(window, "addEventListener");
    const addEventListener = window.addEventListener;
    // Only the listener registered while this script itself is executing is
    // kept; every other registration passes straight through.
    window.addEventListener = function (this: Window, ...args: Parameters<Window["addEventListener"]>) {
      const [type, listener] = args;
      if (type === "DOMContentLoaded" && document.currentScript === script && typeof listener === "function") {
        build = () => listener.call(window, new Event("DOMContentLoaded"));
        return;
      }
      return addEventListener.apply(this, args);
    } as Window["addEventListener"];
    const restore = () => {
      if (hadOwnListener) window.addEventListener = addEventListener;
      else delete (window as { addEventListener?: unknown }).addEventListener;
    };

    script.onload = () => {
      restore();
      resolve(build);
    };
    script.onerror = () => {
      restore();
      // A failed load is retried the next time the form shows.
      loading = null;
      resolve(null);
    };
    for (const [name, value] of Object.entries(SETTINGS)) script.setAttribute(name, value);
    script.async = true;
    script.src = SCRIPT_SRC;
    document.body.appendChild(script);
  });
  return loading;
}

export function BuyMeACoffeeWidget({ visible }: { visible: boolean }) {
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let added: Element[] = [];
    let button: HTMLElement | undefined;

    // Capturing on the document runs before the widget's own click handler,
    // while the panel still shows its state from before the click.
    const reportOpening = (event: MouseEvent) => {
      if (!button || !(event.target instanceof Node) || !button.contains(event.target)) return;
      if (document.getElementById("bmc-iframe")?.style.opacity !== "1") pushBuyMeACoffeeOpened();
    };

    loadWidget().then((build) => {
      if (cancelled || !build) return;
      const before = new Set(Array.from(document.body.children));
      build();
      added = Array.from(document.body.children).filter((node) => !before.has(node));
      button = added.find((node): node is HTMLElement => node.id === "bmc-wbtn");
      if (button) button.style.border = `1px solid ${CTA_EDGE}`;
      document.addEventListener("click", reportOpening, true);
    });

    return () => {
      cancelled = true;
      document.removeEventListener("click", reportOpening, true);
      for (const node of added) node.remove();
    };
  }, [visible]);

  return null;
}
