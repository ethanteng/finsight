import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check } from "lucide-react";

type CalculatorInterpretation = {
  headline: string;
  paragraphs: string[];
  watchOuts: string[];
};

export function CalculatorAnswer({ question, interpretation, isLoading, compact = false }: {
  question: string;
  interpretation: CalculatorInterpretation | null;
  isLoading: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`calculator-answer${compact ? " is-compact" : ""}`} data-cs-mask>
      <header className="calculator-answer-author">
        <span className="brand-mark" aria-hidden="true">L</span>
        <div><strong>A CONVERSATION WITH LINC</strong><span>Based on your calculator inputs</span></div>
      </header>
      <span className="sr-only">What this result means</span>
      <ol className="calculator-conversation" aria-label="Your calculator question and Linc’s answer">
        <li className="calculator-chat-turn calculator-chat-you">
          <span className="calculator-chat-speaker">YOU</span>
          <p className="calculator-chat-bubble">{question}</p>
        </li>
        <li className="calculator-chat-turn calculator-chat-linc">
          <span className="calculator-chat-speaker">LINC</span>
          {isLoading || !interpretation ? (
            <div className="calculator-chat-bubble calculator-chat-loading" role="status">
              <span className="chat-typing" aria-hidden="true"><i /><i /><i /></span>
              Linc is reading your result&hellip;
            </div>
          ) : (
            <div className="calculator-chat-replies">
              <div className="calculator-chat-bubble"><h3>{interpretation.headline}</h3></div>
              {interpretation.paragraphs.map((paragraph) => (
                <p className="calculator-chat-bubble" key={paragraph}>{paragraph}</p>
              ))}
              <CalculatorCaveats items={interpretation.watchOuts} />
            </div>
          )}
        </li>
      </ol>
      {!compact && <p className="calculator-answer-caption">Change your inputs to explore another scenario with Linc.</p>}
    </div>
  );
}

function CalculatorCaveats({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div className="calculator-chat-bubble calculator-chat-caveats"><strong>Keep in mind</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

export function CalculatorRunAgain({ locked, onEdit }: { locked: boolean; onEdit: () => void }) {
  return locked
    ? <p className="calculator-run-limit" role="status">You’ve used your free runs. Save these results to keep exploring in your account.</p>
    : <button type="button" className="calculator-run-again" onClick={onEdit}><span>Edit inputs &amp; run again</span><ArrowUpRight size={17} aria-hidden="true" /></button>;
}

export function CalculatorSteps() {
  return <ol className="calculator-steps" aria-label="How the calculator works"><li><span>01</span>Add your numbers</li><li><span>02</span>Linc runs the math</li><li><span>03</span>See what changes</li></ol>;
}

export function CalculatorPreview({ coast = false }: { coast?: boolean }) {
  return (
    <aside className="calculator-preview" aria-label="What your calculator result will show">
      <span className="brand-mark" aria-hidden="true">L</span>
      <p className="section-kicker light">YOU BRING THE QUESTION</p>
      <h2>{coast ? "Could your savings take it from here?" : "Could your money last as long as you need?"}</h2>
      <div className="calculator-preview-path"><span>{coast ? "Your savings today" : "Your retirement plan"}</span><ArrowDown size={19} aria-hidden="true" /><span>{coast ? "Time + growth" : "Real market history"}</span><ArrowDown size={19} aria-hidden="true" /><strong>{coast ? "Your Coast FIRE number" : "A result you can explore"}</strong></div>
      <ul>{(coast ? ["The amount you need invested today", "How your savings compare", "What a different return changes"] : ["How past retirements held up", "How spending and timing matter", "The assumptions behind the answer"]).map((item) => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul>
      <p className="calculator-preview-note">{coast ? "A projection based on your assumptions, not a guarantee or permission to stop saving." : "Historical results help you explore risk. They do not predict your future."}</p>
    </aside>
  );
}

export function CalculatorNextQuestion({ coast = false }: { coast?: boolean }) {
  return <section className="calculator-next-question shell"><div><p className="section-kicker">KEEP EXPLORING</p><h2>Change the assumption,<br /><em>not the spreadsheet.</em></h2></div><div><p>{coast ? "Try another retirement age, spending level, or return. Recalculate to see how your target changes." : "Try another retirement date or spending level. Run the model again to see how the same plan holds up under different assumptions."}</p><Link className="text-link" href={coast ? "/retirement-calculator" : "/coast-fire-calculator"}>{coast ? "Stress-test retirement against market history" : "Explore your Coast FIRE number"} <span aria-hidden="true">→</span></Link></div></section>;
}
