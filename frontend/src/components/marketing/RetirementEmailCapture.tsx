"use client";

/**
 * "See your result in Ask Linc": the form that stands where the verdict would.
 *
 * The page runs the model but does not show its answer. Giving an address
 * sends the visitor to signup with it prefilled, and the run opens in Ask Linc
 * as the account's first decision. Registration skips the verification code
 * for a calculator lead, so a password is all that stands between this form
 * and the answer. See `auth/routes` and `docs/RETIREMENT_QUICKPLAN.md`.
 *
 * It appears only once a plan has actually been run and returned a verdict.
 * A `rates` run has no survival figure — the model will not invent a
 * portfolio or a spending level — so there is no run to save and the form
 * stays away.
 *
 * The six numbers are posted, never the computed result: the server re-runs
 * the model before it stores the lead, so nothing this form does can put an
 * arbitrary figure into an account or an email carrying our branding. The run
 * the visitor just made is still in the model's cache, so the re-run costs
 * nothing.
 *
 * When no token comes back (the lead did not store, or its disclosure mark
 * did not), there is no run to seed an account from. The page shows the
 * verdict itself instead, through `onReveal`, rather than sending the visitor
 * to an account that would open empty.
 */

import { useEffect, useRef, useState } from "react";
import { pushRetirementResultsEmailed } from "@/lib/dataLayer";
import { readRememberedEmail, rememberEmail } from "@/lib/calculator-email-memory";
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

type Status = "idle" | "sending" | "revealed" | "leaving";

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
  onReveal,
}: {
  inputs: RetirementEmailCaptureInputs;
  survivalRate: number;
  compact?: boolean;
  /** Show the verdict on the page: the fallback when there is no run to carry. */
  onReveal: () => void;
}) {
  // Prefilled from an earlier run in this tab, so the visitor is not asked
  // for an address they already gave.
  const [email, setEmail] = useState(() => readRememberedEmail() ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  /** One conversion event per visitor, however many times they resend. */
  const reported = useRef(false);
  /*
   * The page remounts this form for every run. A send still in flight for
   * the previous run must not reveal, or carry to signup, the run now on
   * screen.
   */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
      rememberEmail(email);
      if (!mounted.current) return;

      if (!token) {
        // Nothing to seed an account from, so the verdict is shown here.
        setStatus("revealed");
        onReveal();
        await tracking;
        return;
      }

      // Both carriers, because they fail differently. The cookie is what
      // /getstarted exchanges, and it cannot be read back from here to know it
      // took. The stored context carries the same token and the inputs, so a
      // browser refusing the cookie costs the address prefill, not the run.
      writeHandoverToken(RETIREMENT_REF_COOKIE, token);
      storeRetirementSignupContext(inputs, { email: email.trim(), sourceToken: token });
      setStatus("leaving");
      await tracking;
      leaveForSignup(resultsPageSignupHref(RETIREMENT_SIGNUP_HREF));
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "leaving") {
    return (
      <div className="qp-email-capture is-sent" role="status" aria-live="polite">
        <p className="section-kicker">OPENING ASK LINC</p>
        <h3>Taking you to your result…</h3>
        <p>
          Choose a password and your retirement result opens as your first decision. We’ve also
          emailed <strong>{email.trim()}</strong> a link back, in case you finish later.
        </p>
      </div>
    );
  }

  if (status === "revealed") {
    return (
      <div className="qp-email-capture is-sent" role="status" aria-live="polite">
        <p className="qp-email-lead">
          We couldn’t set up your account link just now, so here is your result. We’ve also
          emailed <strong>{email.trim()}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form className={`qp-email-capture${compact ? " is-compact" : ""}`} onSubmit={handleSubmit} aria-busy={status === "sending"}>
      <div className="qp-email-copy">
        <p className="section-kicker">YOUR RESULT IS READY</p>
        <h3>See your retirement result in Ask Linc</h3>
        <p className="qp-email-lead">
          Enter your email, then choose a password to see how your plan held up, in Ask Linc. No
          code to enter, no credit card.
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
            {status === "sending" ? "Sending…" : "See my result in Ask Linc"}
          </button>
        </div>

        {error && <p className="qp-email-error" role="alert">{error}</p>}
      </div>
    </form>
  );
}
