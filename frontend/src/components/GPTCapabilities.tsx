export const GPTCapabilities = () => {
  const knows = [
    "Financial theory (e.g. asset allocation, tax optimization)",
    "Best practices for budgeting and investing",
    "How to reason through questions with logic"
  ];
  const doesntKnow = [
    "Today&#39;s CD or Treasury rates",
    "Current economic headlines or Fed moves",
    "Anything that&#39;s happened since late 2023"
  ];
  
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-navy">What GPT Knows</h2>
            <p className="text-xl text-muted-foreground">
              Most people don&#39;t realize this, but GPT doesn&#39;t come with live market knowledge.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-green flex items-center space-x-3">
                <span className="text-2xl">✓</span>
                <span>Knows:</span>
              </h3>
              <ul className="space-y-4">
                {knows.map((item, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <span className="text-green mt-1 flex-shrink-0">✓</span>
                    <span className="text-navy">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-destructive flex items-center space-x-3">
                <span className="text-2xl">✗</span>
                <span>Doesn&#39;t know:</span>
              </h3>
              <ul className="space-y-4">
                {doesntKnow.map((item, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <span className="text-destructive mt-1 flex-shrink-0">✗</span>
                    <span className="text-navy" dangerouslySetInnerHTML={{ __html: item }} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="bg-green/5 border border-green/20 rounded-lg p-8 space-y-4">
            <h3 className="text-2xl font-bold text-navy">That&#39;s where Linc makes a real difference.</h3>
            <p className="text-lg text-muted-foreground leading-relaxed">
              We feed trusted real-time data into ChatGPT behind the scenes — so when you ask, 
              <span className="font-semibold text-navy"> &ldquo;Should I roll over this CD?&rdquo;</span>, 
              you get an answer based on <span className="font-semibold text-green">today&#39;s best rates</span> and 
              <span className="font-semibold text-green"> your actual accounts.</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}; 