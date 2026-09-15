import Link from "next/link";
import { COAST_FIRE_FAQ } from "@/lib/coast-fire";

export function CoastFireCalculatorSeoContent() {
  return (
    <>
      <section className="shell cf-faq">
        <div className="cf-section-heading">
          <p className="section-kicker">COAST FIRE, PLAINLY</p>
          <h2>Questions behind the number.</h2>
        </div>
        <div className="cf-faq-list">
          {COAST_FIRE_FAQ.map((item) => (
            <details key={item.question}>
              <summary><h3>{item.question}</h3><span aria-hidden="true">+</span></summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="shell cf-guides" aria-labelledby="coast-fire-guides-title">
        <div>
          <p className="section-kicker">CONTINUE WITH THE CONCEPT</p>
          <h2 id="coast-fire-guides-title">Coast FIRE guides for the next question.</h2>
        </div>
        <ul>
          <li><Link href="/blog/coast-fire"><strong>What is Coast FIRE?</strong><span>The number, the formula, and what coasting really means.</span></Link></li>
          <li><Link href="/blog/coast-fire-by-age"><strong>Coast FIRE by age</strong><span>Why the target changes so much in your 30s, 40s, and 50s.</span></Link></li>
          <li><Link href="/blog/coast-fire-vs-fire-vs-barista-fire"><strong>Coast FIRE vs FIRE vs Barista FIRE</strong><span>Compare the paths before choosing the milestone that fits.</span></Link></li>
          <li><Link href="/blog/after-coast-fire-stop-contributing"><strong>Can you stop contributing?</strong><span>What has to be true before easing off retirement savings.</span></Link></li>
        </ul>
      </section>
    </>
  );
}
