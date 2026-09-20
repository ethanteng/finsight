import { HOME_BUYING_EXAMPLE } from "@/lib/promptExamples";
import Link from "next/link";

const answerLayers = [
  ["Your numbers", "The facts Linc used"],
  ["Assumptions", "What had to be estimated"],
  ["Math", "How the answer was worked out"],
  ["Checks", "What was verified"],
  ["Sources", "Where the information came from"],
] as const;

/** A compact overview using the same visual language as the trust page. */
export function ShowTheMathPreview() {
  return (
    <article className="trust-audit-card comparison-math-preview" aria-label="Illustrative Show the Math overview">
      <div className="trust-audit-top"><div><span className="brand-mark small" aria-hidden="true">L</span><b>SHOW THE MATH</b></div><span>EXAMPLE</span></div>
      <div className="trust-audit-question"><small>YOUR QUESTION</small><p>{HOME_BUYING_EXAMPLE.prompt}</p></div>
      <div className="trust-audit-verdict"><span aria-hidden="true">✓</span><div><small>LINC’S ANSWER</small><strong>{HOME_BUYING_EXAMPLE.response}</strong></div></div>
      <div className="trust-audit-layers">
        {answerLayers.map(([label, description]) => <div key={label}><span aria-hidden="true">✓</span><b>{label}</b><small>{description}</small></div>)}
      </div>
      <Link className="trust-audit-footer comparison-math-link" href="/trust"><b>See how Show the Math works</b><span aria-hidden="true">→</span></Link>
    </article>
  );
}
