"use client";

/**
 * "Email me my Coast FIRE results", under the result the visitor just ran.
 *
 * It appears only after a submitted calculation. The page opens with a default
 * scenario already on screen, and asking for an address before anyone has put
 * their own numbers in would collect addresses attached to our figures, not
 * theirs.
 *
 * The seven inputs are posted, never the computed result: the server
 * recalculates before it sends, so nothing this form does can put an arbitrary
 * figure in an email carrying our branding.
 */

import { useRef, useState } from "react";
import type { CoastFireResult } from "@/lib/coast-fire";
import { pushCoastFireResultsEmailed } from "@/lib/dataLayer";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type Status = "idle" | "sending" | "sent";

export function CoastFireEmailCapture({ result }: { result: CoastFireResult }) {
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
      const response = await fetch(`${API_URL}/api/coast-fire/email-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          currentAge: result.currentAge,
          retirementAge: result.retirementAge,
          currentSavings: result.currentSavings,
          annualRetirementSpending: result.annualRetirementSpending,
          annualRetirementIncome: result.annualRetirementIncome,
          realReturnRate: result.realReturnRate,
          withdrawalRate: result.withdrawalRate,
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
        pushCoastFireResultsEmailed(result.hasReachedCoastFire ? "reached" : "not_yet");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div className="cf-email-capture is-sent" role="status" aria-live="polite">
        <p className="section-kicker">CHECK YOUR INBOX</p>
        <h3>Your results are on their way.</h3>
        <p>
          We sent your Coast FIRE number, the assumptions behind it, and the return
          comparison to <strong>{email.trim()}</strong>. It can take a minute to arrive.
        </p>
        <button
          className="cf-email-again"
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
    <form className="cf-email-capture" onSubmit={handleSubmit} aria-busy={status === "sending"}>
      <div className="cf-email-copy">
        <p className="section-kicker">KEEP THIS RESULT</p>
        <h3>Want these numbers in your inbox?</h3>
        <p className="cf-email-lead">
          We will send this result, every assumption behind it, and what it would look like
          if returns come in a point lower.
        </p>

      </div>

      <div className="cf-email-fields">
        <label className="cf-email-label" htmlFor="coast-fire-email">
          Email address
        </label>
        <div className="cf-email-row">
          <input
            id="coast-fire-email"
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
            data-cs-override-id="coast-fire-email-results"
          >
            {status === "sending" ? "Sending…" : "Email me my Coast FIRE results"}
          </button>
      </div>

      {error && <p className="cf-email-error" role="alert">{error}</p>}

      <p className="cf-email-note">
        One email with your results, plus occasional Ask Linc updates. Unsubscribe anytime.
      </p>
      </div>
    </form>
  );
}
