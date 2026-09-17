"use client";

/**
 * "Save these results to your free account", under the model's answer.
 *
 * The ask is an account rather than an inbox copy. The email it sends carries
 * a link that lands on signup with this address already filled in, and
 * following it is what proves the address — so a password is all that is left,
 * and the run becomes the first decision in the new account. See
 * `docs/RETIREMENT_QUICKPLAN.md`.
 *
 * It appears only once a plan has actually been run and returned a verdict.
 * A `rates` run has no survival figure to send — the model will not invent a
 * portfolio or a spending level — so there is nothing to put in an inbox and
 * the form stays away.
 *
 * The six numbers are posted, never the computed result: the server re-runs
 * the model before it sends, so nothing this form does can put an arbitrary
 * figure in an email carrying our branding. The run the visitor just made is
 * still in the model's cache, so the re-run costs nothing.
 */

import { useRef, useState } from "react";
import { pushRetirementResultsEmailed } from "@/lib/dataLayer";
import { readCalculatorLeadAttribution } from "@/lib/calculator-lead-attribution";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type Status = "idle" | "sending" | "sent";

export interface RetirementEmailCaptureInputs {
  currentAge: number;
  retirementAge: number;
  investableAssets: number;
  annualSpending: number;
  annualContributions: number;
  socialSecurityAnnual: number;
  socialSecurityStartAge: number;
  /** Passed through so the server's re-run matches this one exactly. */
  lifeExpectancy: number;
  allocation: string;
}

export function RetirementEmailCapture({
  inputs,
  survivalRate,
}: {
  inputs: RetirementEmailCaptureInputs;
  survivalRate: number;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  /** One conversion event per visitor, however many times they resend. */
  const reported = useRef(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/retirement-quickplan/email-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          ...inputs,
          attribution: readCalculatorLeadAttribution(),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setError(body?.error || "We could not send that just now. Please try again.");
        setStatus("idle");
        return;
      }

      setStatus("sent");
      if (!reported.current) {
        reported.current = true;
        pushRetirementResultsEmailed(survivalRate);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div className="qp-email-capture is-sent" role="status" aria-live="polite">
        <p className="section-kicker">CHECK YOUR INBOX</p>
        <h3>Your link is on its way.</h3>
        <p>
          We sent it to <strong>{email.trim()}</strong>, along with the verdict and the figures
          behind it. Open the link, pick a password, and this run will be waiting as your first
          decision. It can take a minute to arrive.
        </p>
        <button
          className="qp-email-again"
          type="button"
          onClick={() => {
            setStatus("idle");
            setEmail("");
          }}
        >
          Send to a different address
        </button>
      </div>
    );
  }

  return (
    <form className="qp-email-capture" onSubmit={handleSubmit} aria-busy={status === "sending"}>
      <div className="qp-email-copy">
        <p className="section-kicker">KEEP THIS ANSWER</p>
        <h3>Save this to a free account</h3>
        <p className="qp-email-lead">
          We will email you a link. Pick a password and this run is waiting as your first
          decision — the verdict, the figures behind it, and the scenarios, ready to pick up and
          ask questions about.
        </p>

      </div>

      <div className="qp-email-fields">
        <label className="qp-email-label" htmlFor="retirement-email">
          Email address
        </label>
        <div className="qp-email-row">
          <input
            id="retirement-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            data-cs-mask
          />
          <button
            className="button button-primary"
            type="submit"
            disabled={status === "sending"}
            data-cs-override-id="quickplan-email-results"
          >
            {status === "sending" ? "Sending…" : "Save these results to your free account"}
          </button>
      </div>

      {error && <p className="qp-email-error" role="alert">{error}</p>}

      </div>
    </form>
  );
}
