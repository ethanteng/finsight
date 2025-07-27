export const WhatYouCanAsk = () => {
  const questions = [
    {
      question: "What's our actual asset allocation across all accounts?",
      tier: "Free"
    },
    {
      question: "Are we overpaying in fees?",
      tier: "Free"
    },
    {
      question: "How much cash is just sitting in low-yield savings?",
      tier: "Free"
    },
    {
      question: "Which of our CDs mature next month?",
      tier: "Standard"
    },
    {
      question: "Are Treasuries a better move than CDs right now?",
      tier: "Premium"
    },
    {
      question: "Should we refinance with today's mortgage rates?",
      tier: "Premium"
    },
    {
      question: "What happens to my spending power if rates go to 6%?",
      tier: "Premium"
    }
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
          
          <div className="grid md:grid-cols-2 gap-6">
            {questions.map((item, index) => (
              <div 
                key={index}
                className="bg-card p-6 rounded-lg border border-border hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green rounded-full mt-3 flex-shrink-0"></div>
                  <div className="flex-1">
                    <p className="text-navy font-medium text-left">
                      &ldquo;{item.question}&rdquo;
                    </p>
                    <div className="mt-2">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        item.tier === 'Free' ? 'bg-green/10 text-green' :
                        item.tier === 'Standard' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-purple-500/10 text-purple-500'
                      }`}>
                        {item.tier}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}; 