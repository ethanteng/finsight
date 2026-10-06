"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { pushCashFlowSampleRequested } from "@/lib/dataLayer";
import { loginUrlFor } from "@/lib/post-login-redirect";
import "./cash-flow-sample.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type Status = "idle" | "sending" | "sent" | "existing";

/**
 * "Email me a sample forecast": the cash-flow forecast page's way to stay in
 * touch with a visitor who is not ready to connect a bank account.
 *
 * The page has no calculator, so this used to be missing entirely and nobody
 * could ever enter its no-trial email sequence. The address joins the
 * MailerLite cash-flow group; that sequence's first email is the sample.
 * Nothing financial is asked for or sent.
 */
export default function CashFlowSampleCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/cash-flow-forecast/sample-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        existingAccount?: unknown;
      };

      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }
      if (body.existingAccount === true) {
        setStatus("existing");
        return;
      }
      pushCashFlowSampleRequested();
      setStatus("sent");
    } catch {
      setError("We could not reach Ask Linc. Check your connection and try again.");
      setStatus("idle");
    }
  }

  /*
   * The address is shown back as text once the input is gone, so it carries
   * the same `data-cs-mask` the input did: session replay records page text.
   */
  if (status === "sent") {
    return (
      <div className="cash-flow-sample is-sent" role="status" aria-live="polite">
        <p className="section-kicker">CHECK YOUR INBOX</p>
        <h3>Your sample forecast is on its way</h3>
        <p>
          It should reach <strong data-cs-mask>{email.trim()}</strong> within a few minutes, from ethan@asklinc.com.
          Reply to it with any question; it goes straight to Ethan, who built Ask Linc.
        </p>
      </div>
    );
  }

  if (status === "existing") {
    return (
      <div className="cash-flow-sample is-sent" role="status" aria-live="polite">
        <p className="section-kicker">YOU ALREADY HAVE AN ACCOUNT</p>
        <h3>Build your forecast in Ask Linc</h3>
        <p>
          <strong data-cs-mask>{email.trim()}</strong> already has an Ask Linc account, so there is no need for a sample.{" "}
          <Link href={loginUrlFor("/cash-flow")}>Sign in to see your own forecast</Link>.
        </p>
      </div>
    );
  }

  return (
    <form className="cash-flow-sample" onSubmit={handleSubmit} aria-busy={status === "sending"}>
      <div className="cfs-copy">
        <p className="section-kicker">NOT READY TO CONNECT AN ACCOUNT?</p>
        <h3>Get a sample forecast by email</h3>
        <p className="cfs-lead">
          See what a forecast shows, including the low point a budget misses, before you connect anything.
        </p>
      </div>

      <div className="cfs-fields">
        <label className="cfs-label" htmlFor="cash-flow-sample-email">
          Email address
        </label>
        <div className="cfs-row">
          <input
            id="cash-flow-sample-email"
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
            data-cs-override-id="cash-flow-sample-request"
          >
            {status === "sending" ? "Sending…" : "Email me a sample forecast"}
          </button>
        </div>

        {error && <p className="cfs-error" role="alert">{error}</p>}
      </div>
    </form>
  );
}
