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
      title: "Data anonymization",
      description: "All sensitive data is anonymized before AI analysis"
    },
    {
      icon: "🤖",
      title: "Privacy-protected AI",
      description: "Your data is never used to train AI models"
    },
    {
      icon: "⚡",
      title: "Complete control",
      description: "View, export, or delete all your data anytime"
    },
    {
      icon: "📊",
      title: "Transparency",
      description: "See exactly what data we have about you"
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
              We never store sensitive information, never train on your data, and give you full control over what&apos;s connected or deleted.
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
          
          <div className="text-center space-y-4">
            <a 
              href="/privacy" 
              className="inline-flex items-center px-6 py-3 bg-navy text-white rounded-lg hover:bg-navy/90 transition-colors"
            >
              Privacy Dashboard
            </a>
            <a 
              href="/privacy-policy" 
              className="inline-flex items-center px-6 py-3 border border-navy text-navy rounded-lg hover:bg-navy hover:text-white transition-colors ml-4"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}; 