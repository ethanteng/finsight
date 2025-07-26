"use client";
import { useState } from 'react';

export const FAQ = () => {
  const faqs = [
    {
      question: "I don't want to give ChatGPT all my financial data...",
      answer: "Totally fair. That's why we use Plaid, not your login info — and your data is read-only, never stored, and never used to train models."
    },
    {
      question: "How does GPT know what's going on in the market?",
      answer: "On its own, it doesn't. That's why FinSight pulls in real-time data — like CD rates, bond yields, and current news — and feeds it into ChatGPT as context for your questions."
    }
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto space-y-12">
          <h2 className="text-4xl md:text-5xl font-bold text-navy text-center">
            FAQ
          </h2>
          
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div 
                key={index} 
                className="bg-card border border-border rounded-lg px-6 py-4"
              >
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full text-left text-lg font-semibold text-navy hover:text-green flex justify-between items-center"
                >
                  {faq.question}
                  <span className="text-2xl transition-transform duration-200">
                    {openIndex === index ? '−' : '+'}
                  </span>
                </button>
                {openIndex === index && (
                  <div className="mt-4 text-muted-foreground text-base leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}; 