export const WhatYouCanAsk = () => {
  const freeQuestions = [
    "What's our actual asset allocation across all accounts?",
    "Are we overpaying in fees anywhere?",
    "How much cash is sitting in low-yield savings?"
  ];

  const standardQuestions = [
    "Which of our CDs mature next month?",
    "How does inflation affect our savings goals?",
    "What's the average credit card APR vs. our current rates?"
  ];

  const premiumQuestions = [
    "Are Treasuries a better move than CDs right now?",
    "Should we refinance given today's mortgage rates?",
    "What happens to our spending power if rates hit 6%?"
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
              Real examples of what Linc can help with — from understanding your money to planning ahead with market insights.
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
                  For curious explorers who want a better view of their own data
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
                  <p>Clear answers about your own account data</p>
                  <p>No guesswork — see what's really happening</p>
                  <p>Great for users just beyond spreadsheets</p>
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
                  For users who want economic context with their analysis
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
                  <p>Trusted public benchmarks like CPI and Fed rates</p>
                  <p>Economic framing without the noise</p>
                  <p>Helps answer "should we adjust?"</p>
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
                  For financially-savvy users who want smarter answers, faster
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
                  <p>Real-time market feeds: CD rates, Treasury yields</p>
                  <p>Smart "what-if" scenario planning</p>
                  <p>GPT answers enriched with live data</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}; 