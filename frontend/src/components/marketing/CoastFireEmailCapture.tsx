"use client";

/**
 * "Save these results to your free account", under the result the visitor just
 * ran.
 *
 * It appears only after a submitted calculation. The page opens with empty
 * personal figures and no result, so there is nothing to email until the
 * visitor asks for an answer — and collecting an address against figures they
 * have not entered would attach their address to our assumptions, not theirs.
 *
 * The seven inputs are posted, never the computed result: the server
 * recalculates before it sends, so nothing this form does can put an arbitrary
 * figure in an email carrying our branding.
 *
 * Submitting does two things. An email goes out carrying a link into signup,
 * which is what someone who wanders off can come back to; and this page takes
 * them there itself, straight away, rather than asking them to go and find it.
 * Either route restores the same run as the first decision in a new account.
 *
 * The two are not equivalent in one respect, and deliberately so. Registration
 * skips the emailed verification code for a token that only ever left this
 * system inside a message to the address it names — holding one is evidence of
 * reading that inbox. The token this page is handed proves no such thing:
 * whoever typed the address got it. The server marks a disclosed token and
 * withholds the skip, so this route saves the run and still verifies the
 * address. See `services/calculator-first-decision` and `auth/routes`.
 */

import { useRef, useState } from "react";
import type { CoastFireResult } from "@/lib/coast-fire";
import { pushCoastFireResultsEmailed } from "@/lib/dataLayer";
import { readCalculatorLeadAttribution } from "@/lib/calculator-lead-attribution";
import {
  isHandoverToken,
  leaveForSignup,
  resultsPageSignupHref,
  writeHandoverToken,
} from "@/lib/calculator-handover";
import {
  COAST_FIRE_REF_COOKIE,
  COAST_FIRE_SIGNUP_HREF,
  storeCoastFireSignupContext,
} from "@/lib/coast-fire-signup-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type Status = "idle" | "sending" | "sent" | "leaving";

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
          attribution: readCalculatorLeadAttribution(),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setError(body?.error || "We could not send that just now. Please try again.");
        setStatus("idle");
        return;
      }

      if (!reported.current) {
        reported.current = true;
        pushCoastFireResultsEmailed(result.hasReachedCoastFire ? "reached" : "not_yet");
      }

      const body = await response.json().catch(() => null) as { ref?: unknown } | null;
      const ref = isHandoverToken(body?.ref) ? body.ref : null;
      if (!ref) {
        // The lead did not store, or its disclosure did not. Nothing to carry,
        // so this stays what it was before: the results are in their inbox.
        setStatus("sent");
        return;
      }

      // Both, because they fail differently. The cookie is what /getstarted
      // exchanges, and it cannot be read back from here to know it took; the
      // stored context carries the same token and the figures, so a browser
      // refusing the cookie costs the address prefill rather than the run.
      writeHandoverToken(COAST_FIRE_REF_COOKIE, ref);
      // No `emailedOutcome`: that field exists because a link opened days
      // later may disagree with the figures its message quoted. Nothing has
      // drifted between this result and this click.
      storeCoastFireSignupContext(
        {
          currentAge: result.currentAge,
          retirementAge: result.retirementAge,
          currentSavings: result.currentSavings,
          annualRetirementSpending: result.annualRetirementSpending,
          annualRetirementIncome: result.annualRetirementIncome,
          realReturnRate: result.realReturnRate,
          withdrawalRate: result.withdrawalRate,
        },
        { email: email.trim(), sourceToken: ref },
      );

      setStatus("leaving");
      leaveForSignup(resultsPageSignupHref(COAST_FIRE_SIGNUP_HREF));
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "leaving") {
    return (
      <div className="cf-email-capture is-sent" role="status" aria-live="polite">
        <p className="section-kicker">SAVING THIS RUN</p>
        <h3>Taking you to your account…</h3>
        <p>
          Your Coast FIRE number and the assumptions behind it are on their way to{" "}
          <strong>{email.trim()}</strong> as well, so you can pick this up later if you would
          rather not finish now.
        </p>
      </div>
    );
  }

  if (status === "sent") {
    return (
      <div className="cf-email-capture is-sent" role="status" aria-live="polite">
        <p className="section-kicker">CHECK YOUR INBOX</p>
        <h3>Your link is on its way.</h3>
        <p>
          We sent it to <strong>{email.trim()}</strong>, along with your Coast FIRE number, the
          assumptions behind it, and the return comparison. Open the link, pick a password, and
          this run will be waiting as your first decision. It can take a minute to arrive.
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
        <h3>Save this to a free account</h3>
        <p className="cf-email-lead">
          We will email you a link. Pick a password and this run is waiting as your first
          decision — your number, every assumption behind it, and what it would look like if
          returns come in a point lower, ready to pick up and ask questions about.
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
            {status === "sending" ? "Sending…" : "Save these results to your free account"}
          </button>
      </div>

      {error && <p className="cf-email-error" role="alert">{error}</p>}

      </div>
    </form>
  );
}
