export const WhatYouCanAsk = () => {
  const freeQuestions = [
    "What's our actual asset allocation across all accounts?",
    "Are we overpaying in fees?",
    "How much cash is just sitting in low-yield savings?"
  ];

  const standardQuestions = [
    "Which of our CDs mature next month?",
    "How does inflation affect our savings goals?",
    "What's the average credit card APR vs our current rates?"
  ];

  const premiumQuestions = [
    "Are Treasuries a better move than CDs right now?",
    "Should we refinance with today's mortgage rates?",
    "What happens to my spending power if rates go to 6%?"
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
              Real-world examples of financial questions — from basic analysis to advanced planning with market data.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {/* Free Tier */}
            <div className="space-y-4">
              <div className="text-center">
                <span className="inline-block px-4 py-2 rounded-full text-sm font-semibold bg-green/10 text-green">
                  Free
                </span>
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
            </div>

            {/* Standard Tier */}
            <div className="space-y-4">
              <div className="text-center">
                <span className="inline-block px-4 py-2 rounded-full text-sm font-semibold bg-blue-500/10 text-blue-500">
                  Standard
                </span>
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
            </div>

            {/* Premium Tier */}
            <div className="space-y-4">
              <div className="text-center">
                <span className="inline-block px-4 py-2 rounded-full text-sm font-semibold bg-purple-500/10 text-purple-500">
                  Premium
                </span>
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
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}; 