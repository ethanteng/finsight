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
              <div className="text-center space-y-2">
                <span className="inline-block px-4 py-2 rounded-full text-sm font-semibold bg-green/10 text-green">
                  🟢 Free Tier
                </span>
                <p className="text-xs text-muted-foreground">
                  For curious explorers who want a better view of their own data
                </p>
              </div>
              {freeQuestions.map((question, index) => (
                <div 
                  key={index}
                  className="bg-card p-4 rounded-lg border border-border hover:shadow-lg transition-all duration-300"
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-green rounded-full mt-3 flex-shrink-0"></div>
                    <p className="text-navy font-medium text-left text-sm">
                      &ldquo;{question}&rdquo;
                    </p>
                  </div>
                </div>
              ))}
              <div className="bg-green/5 p-4 rounded-lg border border-green/20">
                <p className="text-xs text-green-700 font-medium mb-2">💡 You get:</p>
                <ul className="text-xs text-green-600 space-y-1">
                  <li>• Clear answers about your own account data</li>
                  <li>• No guesswork — see what's really happening</li>
                  <li>• Great for users just beyond spreadsheets</li>
                </ul>
              </div>
            </div>

            {/* Standard Tier */}
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <span className="inline-block px-4 py-2 rounded-full text-sm font-semibold bg-blue-500/10 text-blue-500">
                  🔵 Standard Tier
                </span>
                <p className="text-xs text-muted-foreground">
                  For users who want economic context with their analysis
                </p>
              </div>
              {standardQuestions.map((question, index) => (
                <div 
                  key={index}
                  className="bg-card p-4 rounded-lg border border-border hover:shadow-lg transition-all duration-300"
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-3 flex-shrink-0"></div>
                    <p className="text-navy font-medium text-left text-sm">
                      &ldquo;{question}&rdquo;
                    </p>
                  </div>
                </div>
              ))}
              <div className="bg-blue-500/5 p-4 rounded-lg border border-blue-500/20">
                <p className="text-xs text-blue-700 font-medium mb-2">💡 You also get:</p>
                <ul className="text-xs text-blue-600 space-y-1">
                  <li>• Trusted public benchmarks like CPI and Fed rates</li>
                  <li>• Economic framing without the noise</li>
                  <li>• Helps answer "should we adjust?"</li>
                </ul>
              </div>
            </div>

            {/* Premium Tier */}
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <span className="inline-block px-4 py-2 rounded-full text-sm font-semibold bg-purple-500/10 text-purple-500">
                  🟣 Premium Tier
                </span>
                <p className="text-xs text-muted-foreground">
                  For financially-savvy users who want smarter answers, faster
                </p>
              </div>
              {premiumQuestions.map((question, index) => (
                <div 
                  key={index}
                  className="bg-card p-4 rounded-lg border border-border hover:shadow-lg transition-all duration-300"
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mt-3 flex-shrink-0"></div>
                    <p className="text-navy font-medium text-left text-sm">
                      &ldquo;{question}&rdquo;
                    </p>
                  </div>
                </div>
              ))}
              <div className="bg-purple-500/5 p-4 rounded-lg border border-purple-500/20">
                <p className="text-xs text-purple-700 font-medium mb-2">💡 You unlock:</p>
                <ul className="text-xs text-purple-600 space-y-1">
                  <li>• Real-time market feeds: CD rates, Treasury yields</li>
                  <li>• Smart "what-if" scenario planning</li>
                  <li>• GPT answers enriched with live data</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}; 