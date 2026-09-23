"use client";

/**
 * "Save these results to your free account", under the model's answer.
 *
 * The ask is an account rather than an inbox copy. Submitting sends the email,
 * whose link lands on signup with this address already filled in, and takes
 * the visitor there itself rather than asking them to go and find it. Either
 * route makes the run the first decision in the new account. See
 * `docs/RETIREMENT_QUICKPLAN.md`.
 *
 * Only the emailed route proves the address. Following a link sent to an inbox
 * demonstrates reading it, which is what lets registration skip the
 * verification code; a token handed to this page demonstrates nothing, since
 * whoever typed the address received it. The server marks a disclosed token
 * and withholds the skip, so going straight there saves the run and still
 * verifies by code.
 *
 * It appears only once a plan has actually been run and returned a verdict.
 * A `rates` run has no survival figure to send — the model will not invent a
 * portfolio or a spending level — so there is nothing to put in an inbox and
 * the form stays away.
 *
 * As the gate (`gate`), it comes before the result instead of after it. The
 * page holds the answer back until an address is given. Submitting sends the
 * same email and creates the same lead, then reveals the result and stays on
 * the page. Going to signup becomes a button beside the answer rather than
 * the next thing that happens. See `lib/calculator-results-gate`.
 *
 * The six numbers are posted, never the computed result: the server re-runs
 * the model before it sends, so nothing this form does can put an arbitrary
 * figure in an email carrying our branding. The run the visitor just made is
 * still in the model's cache, so the re-run costs nothing.
 */

import { useRef, useState } from "react";
import { pushRetirementResultsEmailed } from "@/lib/dataLayer";
import { readUnlockedEmail, rememberUnlock } from "@/lib/calculator-results-gate";
import { readCalculatorLeadAttribution } from "@/lib/calculator-lead-attribution";
import {
  isHandoverToken,
  leaveForSignup,
  resultsPageSignupHref,
  writeHandoverToken,
} from "@/lib/calculator-handover";
import {
  RETIREMENT_REF_COOKIE,
  RETIREMENT_SIGNUP_HREF,
  storeRetirementSignupContext,
  type RetirementSignupInputs,
} from "@/lib/retirement-signup-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type Status = "idle" | "sending" | "sent" | "unlocked" | "leaving";

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
  /**
   * The preset id, not any string. The page only ever holds one of the three,
   * and carrying them under the same type as the signup context means this run
   * can be handed to signup without a cast that would hide a real mismatch.
   */
  allocation: RetirementSignupInputs['allocation'];
}

export function RetirementEmailCapture({
  inputs,
  survivalRate,
  compact = false,
  gate = false,
  onUnlock,
}: {
  inputs: RetirementEmailCaptureInputs;
  survivalRate: number;
  compact?: boolean;
  /** Stand between the visitor and the result rather than under it. */
  gate?: boolean;
  /** Called once the address is accepted, so the page can reveal the result. */
  onUnlock?: () => void;
}) {
  // Prefilled from an earlier unlock in this tab, so a later run's save does
  // not ask for an address the visitor already gave.
  const [email, setEmail] = useState(() => readUnlockedEmail() ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  /** The lead token from a gated send, spent when the visitor asks to sign up. */
  const [ref, setRef] = useState<string | null>(null);
  /** One conversion event per visitor, however many times they resend. */
  const reported = useRef(false);

  /**
   * Carry this run to signup.
   *
   * Both carriers, because they fail differently. The cookie is what
   * /getstarted exchanges, and it cannot be read back from here to know it
   * took. The stored context carries the same token and the figures, so a
   * browser refusing the cookie costs the address prefill, not the run.
   *
   * No `emailedOutcome`: that field exists because a link opened days later
   * may disagree with the figures its message quoted. Nothing has drifted
   * between this result and this click.
   */
  async function leave(token: string | null, tracking?: Promise<void>) {
    if (token) writeHandoverToken(RETIREMENT_REF_COOKIE, token);
    storeRetirementSignupContext(inputs, {
      email: email.trim(),
      ...(token ? { sourceToken: token } : {}),
    });
    setStatus("leaving");
    await tracking;
    leaveForSignup(resultsPageSignupHref(RETIREMENT_SIGNUP_HREF));
  }

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

      let tracking: Promise<void> | undefined;
      if (!reported.current) {
        reported.current = true;
        tracking = pushRetirementResultsEmailed(survivalRate);
      }

      const body = await response.json().catch(() => null) as { ref?: unknown } | null;
      const token = isHandoverToken(body?.ref) ? body.ref : null;
      rememberUnlock(email);

      if (gate) {
        // The email went out, which is what the gate asked for, whether or not
        // a token came back. Without one, signup still works; it just starts
        // from the stored figures rather than the lead.
        setRef(token);
        setStatus("unlocked");
        onUnlock?.();
        return;
      }

      if (!token) {
        // The lead did not store, or its disclosure did not. Nothing to carry,
        // so this stays what it was before: the results are in their inbox.
        setStatus("sent");
        return;
      }

      await leave(token, tracking);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "leaving") {
    return (
      <div className="qp-email-capture is-sent" role="status" aria-live="polite">
        <p className="section-kicker">SAVING THIS RUN</p>
        <h3>Taking you to your account…</h3>
        <p>
          We’re also emailing your result to <strong>{email.trim()}</strong>, so you can finish
          creating your account later.
        </p>
      </div>
    );
  }

  if (status === "unlocked") {
    return (
      <div className="qp-email-capture is-sent calculator-signup-cta" role="status" aria-live="polite">
        <p className="qp-email-lead">
          We emailed a copy to <strong>{email.trim()}</strong>. Save it to a free account to keep
          exploring and add your connected accounts.
        </p>
        <button
          className="button button-primary"
          type="button"
          onClick={() => { void leave(ref); }}
          data-cs-override-id="quickplan-unlocked-signup"
        >
          Save these results to your free account
        </button>
      </div>
    );
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
    <form className={`qp-email-capture${compact ? " is-compact" : ""}`} onSubmit={handleSubmit} aria-busy={status === "sending"}>
      <div className="qp-email-copy">
        <p className="section-kicker">{gate ? "YOUR RESULT IS READY" : "KEEP THIS ANSWER"}</p>
        <h3>{gate ? "See your retirement result" : "Save this to a free account"}</h3>
        {gate ? <p className="qp-email-lead">Enter your email to see how your plan held up. We’ll send you a copy too.</p> : compact ? <p className="qp-email-lead">Keep this result and get an email copy.</p> : (
        <p className="qp-email-lead">
          Create a password on the next screen to save your result, assumptions, and scenarios.
          We’ll also email you a copy.
        </p>
        )}

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
            {status === "sending" ? "Sending…" : gate ? "Show my results" : "Save these results to your free account"}
          </button>
      </div>

      {error && <p className="qp-email-error" role="alert">{error}</p>}

      </div>
    </form>
  );
}
