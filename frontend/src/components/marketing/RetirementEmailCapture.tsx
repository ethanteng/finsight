"use client";

/**
 * "See your result in Ask Linc": the form that stands where the verdict would.
 *
 * Neither calculator shows its answer on its own page, in any case. The
 * visitor gives an address and the run opens in Ask Linc as a decision in
 * their account, which is the point of the page. Where it goes depends on who
 * they are (`chooseCalculatorHandoff`):
 *
 * - Already signed in: the run is attached to that account and `/app` opens.
 * - An address with an account: sign-in, which attaches the run.
 * - Anyone else: signup with the address prefilled, where a password is all
 *   that stands between them and the run as their first decision.
 *
 * See `auth/routes` and `docs/COAST_FIRE_EMAIL_CAPTURE.md`.
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
 * The server answers without a lead token only when it could not store the
 * run. There is then nothing any account could open, so the form says so and
 * stays ready to retry, rather than showing the answer here.
 */

import { useEffect, useRef, useState } from "react";
import { pushRetirementResultsEmailed } from "@/lib/dataLayer";
import { readRememberedEmail, rememberEmail } from "@/lib/calculator-email-memory";
import { readCalculatorLeadAttribution } from "@/lib/calculator-lead-attribution";
import {
  chooseCalculatorHandoff,
  readSignedInEmail,
  RETIREMENT_SIGN_IN_HREF,
  type CalculatorHandoff,
} from "@/lib/calculator-lead-attach";
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

type Status = "idle" | "sending" | "leaving";

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
}: {
  inputs: RetirementEmailCaptureInputs;
  survivalRate: number;
  compact?: boolean;
}) {
  // Prefilled from an earlier run in this tab, so the visitor is not asked
  // for an address they already gave.
  const [email, setEmail] = useState(() => readRememberedEmail() ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState<CalculatorHandoff>("signup");
  /** One conversion event per visitor, however many times they resend. */
  const reported = useRef(false);
  /*
   * The page remounts this form for every run. A send still in flight for
   * the previous run must not carry the run now on screen anywhere.
   */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /*
   * A signed-in visitor's own address, unless they already have one in the
   * box. The run attaches to the session's account only when the lead names
   * it, so starting from the right address is what keeps them on that path.
   */
  useEffect(() => {
    let cancelled = false;
    void readSignedInEmail().then((address) => {
      if (!cancelled && address) setEmail((current) => current || address);
    });
    return () => {
      cancelled = true;
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
        setError(body?.error || "We could not save that just now. Please try again.");
        setStatus("idle");
        return;
      }

      const body = await response.json().catch(() => null) as { ref?: unknown; existingAccount?: unknown } | null;
      const token = isHandoverToken(body?.ref) ? body.ref : null;
      if (!mounted.current) return;
      if (!token) {
        // Nothing stored, so no account could open it. Not shown here either:
        // the result belongs in Ask Linc, and a retry usually stores it.
        setError("We could not save your result just now. Please try again in a moment.");
        setStatus("idle");
        return;
      }

      let tracking: Promise<void> | undefined;
      if (!reported.current) {
        reported.current = true;
        tracking = pushRetirementResultsEmailed(survivalRate);
      }
      rememberEmail(email);

      // The run and the address, for whichever page opens it: signup and
      // sign-in both read this. The cookie is what /getstarted exchanges; a
      // browser refusing it costs the address prefill there, not the run.
      storeRetirementSignupContext(inputs, { email: email.trim(), sourceToken: token });

      const handoff = await chooseCalculatorHandoff(token, body?.existingAccount === true);
      if (!mounted.current) return;
      setDestination(handoff);
      setStatus("leaving");
      await tracking;

      // Whole loads rather than client navigations: /getstarted reads a
      // cookie set just now, and /app and /login read their session on mount.
      if (handoff === "app") {
        leaveForSignup("/app");
      } else if (handoff === "sign-in") {
        leaveForSignup(RETIREMENT_SIGN_IN_HREF);
      } else {
        writeHandoverToken(RETIREMENT_REF_COOKIE, token);
        leaveForSignup(resultsPageSignupHref(RETIREMENT_SIGNUP_HREF));
      }
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
        {destination === "app" ? (
          <p>Your retirement result is saved in your account. Opening it…</p>
        ) : destination === "sign-in" ? (
          <p>
            You already have an Ask Linc account. Sign in and your retirement result opens as a new
            decision in it.
          </p>
        ) : (
          <p>
            Choose a password and your retirement result opens as your first decision. We’ve also
            emailed <strong>{email.trim()}</strong> a link back, in case you finish later.
          </p>
        )}
      </div>
    );
  }

  return (
    <form className={`qp-email-capture${compact ? " is-compact" : ""}`} onSubmit={handleSubmit} aria-busy={status === "sending"}>
      <div className="qp-email-copy">
        <p className="section-kicker">YOUR RESULT IS READY</p>
        <h3>See your retirement result in Ask Linc</h3>
        <p className="qp-email-lead">
          Enter your email to see how your plan held up, in Ask Linc. New here? Just choose a password, with no code to enter and no credit card.
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
            {status === "sending" ? "Saving…" : "See my result in Ask Linc"}
          </button>
        </div>

        {error && <p className="qp-email-error" role="alert">{error}</p>}
      </div>
    </form>
  );
}
