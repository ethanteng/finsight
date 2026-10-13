"use client";

import "./cash-flow-quick-check.css";
import { pushCashFlowCheckClick } from "@/lib/dataLayer";

const TRYCOAST_CASH_FLOW_URL = "https://trycoast.me/#cash";

/**
 * "Try a quick cash flow check": the cash-flow forecast page's offer to a
 * visitor who is not ready to connect a bank account.
 *
 * It opens TryCoast's cash flow check, a separate site, in a new tab rather
 * than building a second manual forecast here. The link keeps the referrer so
 * TryCoast's own reports can tell these visits from its ad traffic, and the
 * note under the button says the visitor is leaving Ask Linc. The click is
 * reported so the admin Visitors tab can count who took the offer.
 */
export default function CashFlowQuickCheck() {
  return (
    <div className="cash-flow-quick-check">
      <div className="cfq-copy">
        <p className="section-kicker">NOT READY TO CONNECT AN ACCOUNT?</p>
        <h3>Try a quick cash flow check</h3>
        <p className="cfq-lead">
          Enter your cash, take-home pay, and monthly costs to see the next 12 months, and what a smaller paycheck
          would change. Nothing to connect, no signup.
        </p>
      </div>

      <div className="cfq-action">
        <a
          className="button button-primary"
          href={TRYCOAST_CASH_FLOW_URL}
          target="_blank"
          rel="noopener"
          data-cs-override-id="cash-flow-trycoast"
          onClick={() => pushCashFlowCheckClick()}
        >
          Open the cash flow check <span aria-hidden="true">↗</span>
        </a>
        <p className="cfq-note">Opens TryCoast in a new tab.</p>
      </div>
    </div>
  );
}
