import { COAST_FIRE_FAQ } from "@/lib/coast-fire";

export function CoastFireCalculatorSeoContent() {
  return (
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
  );
}
