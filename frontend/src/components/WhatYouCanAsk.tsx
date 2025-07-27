export const WhatYouCanAsk = () => {
  const freeQuestions = [
    "What's my actual asset allocation across all accounts?",
    "Are we overpaying in fees?",
    "How much cash is just sitting in low-yield savings?",
    "How much do I save each month on average?",
    "Where is most of my money sitting right now?"
  ];

  const standardQuestions = [
    "Which of our CDs mature next month?",
    "How does inflation affect our savings goals?",
    "What's the average credit card APR vs. ours?",
    "Should we move excess cash into something higher-yield?",
    "How far are we from our house down payment target?"
  ];

  const premiumQuestions = [
    "Should we refinance based on current mortgage rates?",
    "Are Treasuries a better option than CDs right now?",
    "What happens to our spending power if rates go to 6%?",
    "What asset mix gives us the right balance of safety and growth?",
    "How long can we last without touching our emergency fund if the market drops?"
  ];

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center space-y-12">
          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-navy">
              What You Can Ask
            </h2>
            <p className="text-xl text-muted-foreground">
              Choose the plan that fits your current financial journey.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Free Tier */}
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <span className="inline-block px-6 py-3 rounded-full text-lg font-semibold bg-green/10 text-green">
                  Free Tier
                </span>
                <p className="text-sm text-muted-foreground">
                  For people with checking, savings, and maybe a 401(k). You&apos;re focused on saving more and getting clarity, not complexity.
                </p>
              </div>
              {freeQuestions.map((question, index) => (
                <div 
                  key={index}
                  className="bg-card p-4 rounded-lg border border-border hover:shadow-lg transition-all duration-300"
                >
                  <p className="text-navy font-medium text-left text-base">
                    &ldquo;{question}&rdquo;
                  </p>
                </div>
              ))}
              <div className="bg-green/5 p-4 rounded-lg border border-green/20">
                <p className="text-sm text-green-700 font-semibold mb-3">You get:</p>
                <div className="text-sm text-green-600 space-y-2">
                  <p>You get a clear view of your own data — no charts, no spreadsheets, no budgeting guilt.</p>
                </div>
              </div>
            </div>

            {/* Standard Tier */}
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <span className="inline-block px-6 py-3 rounded-full text-lg font-semibold bg-blue-500/10 text-blue-500">
                  Standard Tier
                </span>
                <p className="text-sm text-muted-foreground">
                  You&apos;ve gone beyond the basics. You&apos;re exploring CDs, investing a bit, maybe thinking about buying a home. You want smarter context to grow your money.
                </p>
              </div>
              {standardQuestions.map((question, index) => (
                <div 
                  key={index}
                  className="bg-card p-4 rounded-lg border border-border hover:shadow-lg transition-all duration-300"
                >
                  <p className="text-navy font-medium text-left text-base">
                    &ldquo;{question}&rdquo;
                  </p>
                </div>
              ))}
              <div className="bg-blue-500/5 p-4 rounded-lg border border-blue-500/20">
                <p className="text-sm text-blue-700 font-semibold mb-3">You also get:</p>
                <div className="text-sm text-blue-600 space-y-2">
                  <p>Answers are based on your data, plus real-world context like CPI, average rates, and economic trends — so you&apos;re not flying blind.</p>
                </div>
              </div>
            </div>

            {/* Premium Tier */}
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <span className="inline-block px-6 py-3 rounded-full text-lg font-semibold bg-purple-500/10 text-purple-500">
                  Premium Tier
                </span>
                <p className="text-sm text-muted-foreground">
                  You have more complex finances: a mortgage, long-term goals, maybe retirement on the horizon. You&apos;ve worked with advisors before, but want smarter, faster answers without the fees.
                </p>
              </div>
              {premiumQuestions.map((question, index) => (
                <div 
                  key={index}
                  className="bg-card p-4 rounded-lg border border-border hover:shadow-lg transition-all duration-300"
                >
                  <p className="text-navy font-medium text-left text-base">
                    &ldquo;{question}&rdquo;
                  </p>
                </div>
              ))}
              <div className="bg-purple-500/5 p-4 rounded-lg border border-purple-500/20">
                <p className="text-sm text-purple-700 font-semibold mb-3">You unlock:</p>
                <div className="text-sm text-purple-600 space-y-2">
                  <p>Premium includes live market data and forward-looking planning tools — so you can stress-test decisions and understand the tradeoffs.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}; 