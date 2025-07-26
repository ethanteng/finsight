export const TrustSecurity = () => {
  const features = [
    {
      icon: "🛡️",
      title: "Powered by Plaid",
      description: "The same secure tech used by Venmo, AmEx, and thousands of banks"
    },
    {
      icon: "👁️",
      title: "Read-only access",
      description: "We can't move your money — ever"
    },
    {
      icon: "🔒",
      title: "Data protection",
      description: "Your account data is not stored, sold, or shared"
    },
    {
      icon: "🤖",
      title: "Privacy-protected AI",
      description: "Your questions and data are processed by ChatGPT in a privacy-protected environment"
    },
    {
      icon: "⚡",
      title: "Always in control",
      description: "Disconnect anytime with one click"
    }
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-navy">
              Trust & Security
            </h2>
            <p className="text-2xl font-semibold text-green">
              Your data, your rules.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div key={index} className="bg-card p-6 rounded-lg border border-border space-y-4">
                <div className="w-12 h-12 bg-green/10 rounded-lg flex items-center justify-center text-2xl">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-navy">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}; 