"use client";
import { useEffect, useState, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { pushViewMoreExamples } from '@/lib/dataLayer';

interface RealExamplesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EXAMPLES = [
  {
    prompt: "Analyze my current portfolio and show me how likely I will be able to retire by 50, 55, 60, and 62. Explain in detail why a scenario(s) is or not likely.",
    response: "Based on detailed analysis, retirement at age 50 is not feasible (shortfall of $991K), age 55 is marginally feasible (45-55% likelihood) but risky, age 60 is highly feasible (75-85% likelihood) with $1.7M surplus, and age 62 is very feasible (85-95% likelihood) with $3M surplus. The primary obstacle is your $444,299 debt, which must be eliminated for early retirement success. Target age 60 retirement as the optimal balance of earlier freedom and financial security.",
    keyNumbers: [
      { label: "Current Portfolio", value: "$2,190,695" },
      { label: "Age 50 Shortfall", value: "-$991,738" },
      { label: "Age 55 Surplus", value: "$184,774" },
      { label: "Age 60 Surplus", value: "$1,701,240" },
      { label: "Age 62 Surplus", value: "$3,022,870" },
      { label: "Debt To Eliminate", value: "$444,299" },
    ],
    insights: [
      "Your $81,000 annual surplus provides strong savings momentum, enabling portfolio growth from $2.2M today to $6.3M by age 60",
      "The $444,299 debt reduces your feasible retirement age by approximately 5 years; eliminating it by age 53 makes age 55 retirement viable",
      "Age 60 offers the best risk-reward balance with 37% surplus after meeting $140K spending needs, plus only 5-year healthcare gap before Medicare",
      "Current 2.5% fixed income allocation is too aggressive for someone 12 years from retirement; increase to 25-30% to reduce sequence-of-returns risk",
    ],
    suggestedActions: [
      "Immediately clarify the $444,299 debt type and interest rate, then create aggressive payoff plan targeting elimination by age 53 using annual surplus",
      "Shift asset allocation from current 97.5% growth assets to 75/25 equity/fixed income split, then follow glide path to 60/40 by age 58",
      "Build healthcare cost analysis for ages 60-65 and research ACA marketplace subsidies based on retirement income levels",
      "Establish 2-year spending reserve ($280K) in stable assets by age 58 to protect against sequence-of-returns risk in early retirement years",
      "Calculate Social Security claiming strategies comparing age 62 vs. 67 vs. 70 to optimize lifetime benefits given your strong portfolio position",
    ],
  },
  {
    prompt: "Dive deeper into my investment and retirement portfolio. Assess how well balanced it is (or isn't) based on my target retirement age -- assume 62. Recommend any adjustments that would be beneficial.",
    response: "Your retirement portfolio is extremely aggressive with 92.1% equity allocation—appropriate for someone decades from retirement, not 14 years away from age 62. While projected to reach $7.2M (exceeding your $3.5-4.5M needs), you face severe sequence-of-returns risk. A market crash near retirement could force significant delays. Immediate action needed: implement a glide path reducing equity to 70% now, then to 60% by age 62, while building a substantial bond allocation of 35%. Your strong $81K annual surplus can fund this transition entirely through new contributions over 3-4 years without selling equities.",
    keyNumbers: [
      { label: "Current Equity Allocation Pct", value: "92.1%" },
      { label: "Recommended Equity Allocation Pct", value: "70%" },
      { label: "Years To Target Retirement", value: "14" },
      { label: "Projected Portfolio At 62", value: "$7,242,330" },
      { label: "Minimum Portfolio Needed", value: "$3,500,000" },
      { label: "Current Fixed Income Pct", value: "2.5%" },
      { label: "Target Fixed Income Pct", value: "35%" },
      { label: "Equity Overweight Percentage Points", value: "40.1%" },
    ],
    insights: [
      "Portfolio is positioned 40 percentage points too aggressive for age 48 with 14-year retirement horizon—comparable risk profile to someone in their 20s",
      "Strong surplus of $81K annually provides opportunity to rebalance entirely through new contributions without triggering capital gains",
      "Projected $7.2M portfolio at age 62 provides 2x cushion above minimum needs, enabling flexible retirement timing or higher spending",
      "Critical vulnerability: 30% market decline at age 60-61 could reduce portfolio below safe withdrawal thresholds for $180K drawdown target",
    ],
    suggestedActions: [
      "Immediately reduce equity allocation from 92.1% to 70% by redirecting all new contributions to bonds and rebalancing retirement accounts tax-free",
      "Establish 14-year glide path decreasing equity 2% annually, reaching 60% equity / 35% bonds / 5% cash by age 62",
      "Build diversified fixed income allocation: 40% TIPS for inflation protection, 30% intermediate Treasuries for safety, 30% investment-grade corporates for yield",
      "Create quarterly rebalancing schedule with annual equity reduction targets and stress-test portfolio against bear market scenarios at ages 60-62",
      "Accelerate paydown of $444K credit liability using portion of monthly surplus to reduce interest costs and improve retirement cash flow",
    ],
  },
  {
    prompt: "Re-evaluate my entire portfolio. Stress test it and give me a probability assessment on how long I'll likely be able to sustain my revised monthly drawdown, given that I'm currently 77 years old. Be detailed about what's working well, and what could be improved.",
    response: "Your portfolio demonstrates exceptional strength and longevity. At age 77 with $1.53M in net worth and a conservative 2.90% withdrawal rate, your assets will sustain your $144,000 annual lifestyle for 40+ years even with zero growth. Stress tests confirm 100% probability of success for 20+ years. Your 19.2% cash allocation provides extraordinary stability with 8.2 years of coverage. Key opportunities: verify RMD compliance, consider modest reallocation from excess cash to inflation-protected securities, and conduct an annual fee review. Your financial position is extremely secure.",
    keyNumbers: [
      { label: "Net Worth", value: "$1,533,829" },
      { label: "Years Cash Reserves", value: "8.19" },
      { label: "Withdrawal Rate Percent", value: "2.9%" },
      { label: "Income Coverage Percent", value: "75%" },
      { label: "Years Sustainable Zero Growth", value: "42.6" },
      { label: "Survival Rate Stress Test Percent", value: "100%" },
    ],
    insights: [
      "Your 2.90% withdrawal rate is well below the 4% historical sustainability threshold, indicating very low risk of portfolio depletion",
      "Cash reserves of $294,762 provide 8.2 years of expense coverage, far exceeding typical recommendations",
      "Even in a severe 30% market correction, your portfolio would last 32+ years with a 4.15% withdrawal rate",
      "Income from Social Security, investments, and annuities covers 75% of expenses, requiring only $36,000 annual drawdown",
      "At current withdrawal rates and realistic return assumptions of 2-3%, your portfolio could sustain indefinitely",
    ],
    suggestedActions: [
      "Verify your retirement account withdrawals meet IRS Required Minimum Distribution requirements (estimated $21,454 annually at age 77)",
      "Consider reallocating $50,000-$75,000 from cash to VTIP or short-term bonds to enhance inflation protection while maintaining liquidity",
      "Conduct comprehensive fee review across all accounts, targeting total portfolio costs below 0.75% annually",
      "Maintain your current conservative withdrawal strategy as it provides exceptional sustainability",
      "Schedule annual portfolio reviews to adjust for any changes in health, expenses, or market conditions",
    ],
  },
];

const SWIPE_THRESHOLD = 50;

function ExampleCard({ example }: { example: typeof EXAMPLES[0] }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prompt</div>
        <div className="bg-muted/50 rounded-lg p-4 border border-border/50 text-foreground leading-relaxed">
          {example.prompt}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Response</div>
        <div className="space-y-4">
          <p className="text-foreground/90 leading-relaxed">{example.response}</p>
          <div>
            <div className="text-sm font-semibold text-foreground mb-2">Key Numbers</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {example.keyNumbers.map((item, i) => (
                <div key={i} className="flex justify-between items-baseline gap-4 py-1.5 px-3 bg-muted/30 rounded text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium text-foreground tabular-nums">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground mb-2">Insights</div>
            <ul className="list-disc list-inside space-y-1.5 text-foreground/90 text-sm leading-relaxed">
              {example.insights.map((insight, i) => (
                <li key={i}>{insight}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground mb-2">Suggested Actions</div>
            <ul className="list-disc list-inside space-y-1.5 text-foreground/90 text-sm leading-relaxed">
              {example.suggestedActions.map((action, i) => (
                <li key={i}>{action}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RealExamplesModal({ isOpen, onClose }: RealExamplesModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setCurrentIndex(0);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const goPrev = () => {
    pushViewMoreExamples();
    setCurrentIndex((i) => Math.max(0, i - 1));
  };
  const goNext = () => {
    pushViewMoreExamples();
    setCurrentIndex((i) => Math.min(EXAMPLES.length - 1, i + 1));
  };
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < EXAMPLES.length - 1;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchStartX.current - touchEndX;
    touchStartX.current = null;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
    if (deltaX > 0 && canGoNext) goNext();
    else if (deltaX < 0 && canGoPrev) goPrev();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-3 items-center p-6 border-b border-border/50 shrink-0">
          <div />
          <div className="flex items-center justify-center gap-2 sm:gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={goPrev}
              disabled={!canGoPrev}
              className="shrink-0"
              aria-label="Previous example"
            >
              <ChevronLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <span className="text-sm text-primary shrink-0 min-w-[6rem] text-center">
              Example {currentIndex + 1} of {EXAMPLES.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={goNext}
              disabled={!canGoNext}
              className="shrink-0"
              aria-label="Next example"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4 sm:ml-1" />
            </Button>
          </div>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg transition-colors hover:bg-muted/50"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div
          className="flex-1 overflow-y-auto p-6 touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <ExampleCard example={EXAMPLES[currentIndex]} />
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
