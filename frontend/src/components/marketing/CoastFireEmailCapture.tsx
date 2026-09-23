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
 * As the gate (`gate`), it comes before the result instead of after it. The
 * page holds the answer back until an address is given. Submitting sends the
 * same email and creates the same lead, then reveals the result and stays on
 * the page. Going to signup becomes a button beside the answer rather than
 * the next thing that happens. See `lib/calculator-results-gate`.
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
import { readUnlockedEmail, rememberUnlock } from "@/lib/calculator-results-gate";
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

type Status = "idle" | "sending" | "sent" | "unlocked" | "leaving";

export function CoastFireEmailCapture({
  result,
  compact = false,
  gate = false,
  onUnlock,
}: {
  result: CoastFireResult;
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
  async function leave(token: string, tracking?: Promise<void>) {
    writeHandoverToken(COAST_FIRE_REF_COOKIE, token);
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
      { email: email.trim(), sourceToken: token },
    );
    setStatus("leaving");
    await tracking;
    leaveForSignup(resultsPageSignupHref(COAST_FIRE_SIGNUP_HREF));
  }

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

      let tracking: Promise<void> | undefined;
      if (!reported.current) {
        reported.current = true;
        tracking = pushCoastFireResultsEmailed(result.hasReachedCoastFire ? "reached" : "not_yet");
      }

      const body = await response.json().catch(() => null) as { ref?: unknown } | null;
      const token = isHandoverToken(body?.ref) ? body.ref : null;
      rememberUnlock(email);

      if (gate) {
        // The email went out, which is what the gate asked for, whether or not
        // a token came back. Without one there is no save to offer: the first
        // decision is seeded from the stored lead and nothing else, so a
        // signup would arrive at an empty account.
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
      <div className="cf-email-capture is-sent" role="status" aria-live="polite">
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
      <div className="cf-email-capture is-sent calculator-signup-cta" role="status" aria-live="polite">
        <p className="cf-email-lead">
          We emailed a copy to <strong>{email.trim()}</strong>.
          {ref && " Save it to a free account to keep exploring and add your connected accounts."}
        </p>
        {ref && <button
          className="button button-primary"
          type="button"
          onClick={() => { void leave(ref); }}
          data-cs-override-id="coast-fire-unlocked-signup"
        >
          Save these results to your free account
        </button>}
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
    <form className={`cf-email-capture${compact ? " is-compact" : ""}`} onSubmit={handleSubmit} aria-busy={status === "sending"}>
      <div className="cf-email-copy">
        <p className="section-kicker">{gate ? "YOUR RESULT IS READY" : "KEEP THIS RESULT"}</p>
        <h3>{gate ? "See your Coast FIRE number" : "Save this to a free account"}</h3>
        {gate ? <p className="cf-email-lead">Enter your email to see your Coast FIRE number. We’ll send you a copy too.</p> : compact ? <p className="cf-email-lead">Keep this result and get an email copy.</p> : (
        <p className="cf-email-lead">
          Create a password on the next screen to save your Coast FIRE number, assumptions,
          and return comparison. We’ll also email you a copy.
        </p>
        )}

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
            {status === "sending" ? "Sending…" : gate ? "Show my results" : "Save these results to your free account"}
          </button>
      </div>

      {error && <p className="cf-email-error" role="alert">{error}</p>}

      </div>
    </form>
  );
}
