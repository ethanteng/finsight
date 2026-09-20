import Link from "next/link";
import { ArrowRight, Check, ChartNoAxesCombined, Landmark, Wallet } from "lucide-react";

export { ConnectedLifeVisual, AnalysisVisual } from "./PlanningScenes";

export function PlanningFlow() {
  return (
    <figure className="planning-flow" aria-label="Connect, ask, Linc does the work, explore your plan">
      <ol>
        <li className="flow-connect"><span className="flow-step">01 / CONNECT</span><div className="flow-account-stack"><span><Landmark size={17} aria-hidden="true" /> Bank accounts</span><span><ChartNoAxesCombined size={17} aria-hidden="true" /> Investments</span><span><Wallet size={17} aria-hidden="true" /> Spending & debt</span></div><strong className="flow-caption">Your financial life.</strong><ArrowRight className="flow-arrow" aria-hidden="true" /></li>
        <li className="flow-ask"><span className="flow-step">02 / ASK</span><p className="flow-question">“Could we retire<br />at 55?”</p><strong className="flow-caption">Your question.</strong><ArrowRight className="flow-arrow" aria-hidden="true" /></li>
        <li className="flow-work"><span className="flow-step">03 / LINC DOES THE WORK</span><div className="flow-work-mark"><span className="brand-mark" aria-hidden="true">L</span><span className="flow-work-lines"><span><Check size={14} aria-hidden="true" /> Pulls it together</span><span><Check size={14} aria-hidden="true" /> Runs the numbers</span><span><Check size={14} aria-hidden="true" /> Tests the what-ifs</span></span></div><strong className="flow-caption">Linc runs the analysis.</strong><ArrowRight className="flow-arrow" aria-hidden="true" /></li>
        <li className="flow-result"><span className="flow-step">04 / EXPLORE THE RESULT</span><div className="flow-plan"><span className="flow-plan-check"><Check size={19} aria-hidden="true" /></span><strong>Your retirement plan</strong><span>What works. What could change.</span><div aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></div><strong className="flow-caption">A clearer next step.</strong></li>
      </ol>
      <figcaption>See how a question becomes a plan. <Link href="/demo" data-cs-override-id="homepage-full-product-demo">Explore the full demo <span aria-hidden="true">↗</span></Link></figcaption>
    </figure>
  );
}
