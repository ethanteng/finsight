export const WhatYouCanAsk = () => {
  const questions = [
    "What's our actual asset allocation across all accounts?",
    "Are we overpaying in fees?",
    "Which of our CDs mature next month?",
    "How much cash is just sitting in low-yield savings?",
    "Can we realistically retire at 62? If not, what would need to change?",
    "Are Treasuries a better move than CDs right now?",
    "Should we refinance with today's mortgage rates?"
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
              Real-world examples of simple and complex financial questions — with emphasis on how 
              Linc answers based on <span className="font-semibold text-navy">your</span> data and the 
              <span className="font-semibold text-navy"> current</span> financial landscape.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {questions.map((question, index) => (
              <div 
                key={index}
                className="bg-card p-6 rounded-lg border border-border hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green rounded-full mt-3 flex-shrink-0"></div>
                  <p className="text-navy font-medium text-left">
                    &ldquo;{question}&rdquo;
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}; 