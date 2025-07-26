import { Button } from "@/components/ui/button";

export const Pricing = () => {
  const plans = [
    {
      name: "Free Tier",
      price: "$0",
      description: "Perfect for light users or early exploration",
      features: [
        "Link up to 3 accounts",
        "Ask 5 GPT-powered questions/month",
        "No market data or scenario modeling"
      ],
      popular: false
    },
    {
      name: "Standard",
      price: "$9.99/mo",
      description: "Full access to your data across accounts",
      features: [
        "Unlimited accounts",
        "Unlimited financial questions",
        "Full access to your data across accounts",
        "No real-time economic context"
      ],
      popular: true
    },
    {
      name: "Premium",
      price: "$29.99/mo", 
      description: "Everything + live market context",
      features: [
        "Everything in Standard",
        "Live market context: CD rates, Treasury yields, mortgage trends",
        "Smart 'what-if' analysis and planning",
        "More powerful GPT answers with real-world inputs"
      ],
      popular: false
    }
  ];

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-navy">
              Pricing & Plans
            </h2>
            <p className="text-xl text-muted-foreground">
              Simple plans. Real value. Upgrade only if you need more.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan, index) => (
              <div 
                key={index} 
                className={`relative bg-card p-6 rounded-lg border ${plan.popular ? 'border-green shadow-lg scale-105' : 'border-border'} hover:shadow-lg transition-all duration-300`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-green text-white px-4 py-1 rounded-full text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}
                
                <div className="text-center space-y-4">
                  <h3 className="text-2xl font-bold text-navy">{plan.name}</h3>
                  <div className="space-y-2">
                    <div className="text-4xl font-bold text-navy">{plan.price}</div>
                    <p className="text-muted-foreground">
                      {plan.description}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-6 mt-6">
                  <ul className="space-y-3">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start space-x-3">
                        <div className="w-5 h-5 text-green mt-0.5 flex-shrink-0">✓</div>
                        <span className="text-card-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    className={`w-full ${plan.popular ? 'bg-green hover:bg-green-light' : 'bg-navy hover:bg-navy-light'} text-white`}
                    size="lg"
                  >
                    {plan.price === "$0" ? "Get Started" : "Join Waitlist"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}; 