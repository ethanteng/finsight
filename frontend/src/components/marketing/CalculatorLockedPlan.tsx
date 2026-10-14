import { useId, type ReactNode } from "react";
import { Lock } from "lucide-react";
import type { LockedPlanField, LockedPlanGroup } from "@/lib/calculator-locked-plan";

/**
 * Beside a calculator's result: the details Ask Linc also plans with, greyed
 * out under one lock, and the email form that unlocks them.
 *
 * The fields are never filled in and cannot be focused or edited; nothing
 * here is the visitor's, and nothing they could type here would reach the
 * calculation. They show what the account adds, in Your numbers' own words,
 * so the visitor recognises them when the run opens in Ask Linc with the
 * same details as a form under the answer.
 *
 * `children` is the calculator's own email capture, in a bar under the
 * heading rather than on the fields: a form laid over them hid the very
 * thing it was offering. Only the lock sits on the fields, and the bar stays
 * above the fold beside the result.
 */
export function CalculatorLockedPlan({
  groups,
  children,
}: {
  groups: LockedPlanGroup[];
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <aside className="calculator-locked-plan" aria-labelledby={titleId}>
      <div className="calculator-locked-plan-head">
        <p className="section-kicker">CREATE AN ACCOUNT</p>
        <h2 id={titleId}>Sanity-check your plan.</h2>
        <p>This result only uses the basic numbers you entered. Create an account to sanity check your plan with the additional numbers below.</p>
      </div>
      <div className="calculator-locked-unlock">{children}</div>
      <div className="calculator-locked-plan-stack">
        <fieldset className="calculator-locked-fields" disabled>
          <legend className="sr-only">Locked until you continue in Ask Linc</legend>
          {groups.map((group) => (
            <div className="calculator-locked-group" key={group.title}>
              <p className="calculator-locked-group-title">{group.title}</p>
              <div className="calculator-locked-grid">
                {group.fields.map((field) => <LockedField key={field.id} field={field} />)}
              </div>
            </div>
          ))}
        </fieldset>
        <span className="calculator-locked-icon" aria-hidden="true"><Lock size={20} /></span>
      </div>
    </aside>
  );
}

function LockedField({ field }: { field: LockedPlanField }) {
  const id = useId();
  const money = field.kind === "usd" || field.kind === "usd_per_year";
  return (
    <div className="calculator-locked-field">
      <label htmlFor={id}>{field.label}</label>
      {field.kind === "choice" ? (
        <select id={id} tabIndex={-1} defaultValue="">
          <option value="">Not set</option>
        </select>
      ) : (
        <span className="calculator-locked-input">
          {money && <i aria-hidden="true">$</i>}
          <input id={id} tabIndex={-1} readOnly value="" />
          {field.kind === "percent" && <i aria-hidden="true">%</i>}
          {field.kind === "age" && <i aria-hidden="true">years</i>}
        </span>
      )}
    </div>
  );
}
