export const HowItWorks = () => {
  const steps = [
    {
      number: "1",
      title: "Connect your accounts",
      description: "Link your financial accounts securely via Plaid"
    },
    {
      number: "2", 
      title: "Ask a question in plain English",
      description: "No complex setup or navigation required"
    },
    {
      number: "3",
      title: "Get actionable answers",
      description: "Linc uses your data + live market info to provide smart insights"
    }
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center space-y-12">
          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-navy">
              How It Works
            </h2>
            <p className="text-xl text-muted-foreground">
              No dashboards. No spreadsheets. No setup required.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="space-y-4">
                <div className="w-16 h-16 bg-green rounded-full flex items-center justify-center mx-auto">
                  <span className="text-2xl font-bold text-white">{step.number}</span>
                </div>
                <h3 className="text-xl font-semibold text-navy">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
                
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-green/30 transform translate-x-4"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}; 