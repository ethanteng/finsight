import { Button } from "@/components/ui/button";

export const Pricing = () => {
  const plans = [
    {
      name: "Free Tier",
      price: "$0",
      description: "Perfect for light users or early exploration",
      features: [
        "Unlimited financial questions",
        "Link up to 3 accounts",
        "Great way to try it all risk-free",
        "No external data or forecasting"
      ],
      popular: false
    },
    {
      name: "Standard",
      price: "$9.99/mo",
      description: "Full access to your data across accounts + economic context",
      features: [
        "Unlimited accounts",
        "Unlimited GPT questions",
        "Basic market context: inflation, average rates",
        "No smart modeling or real-time inputs"
      ],
      popular: true
    },
    {
      name: "Premium",
      price: "$29.99/mo", 
      description: "Everything + live market intelligence + planning tools",
      features: [
        "Everything in Standard",
        "Live CD, Treasury, mortgage rates",
        "Advanced 'what-if' scenario planning",
        "Smarter GPT insights with real-world data"
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
              Start free, upgrade when you need more accounts or smarter insights.
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