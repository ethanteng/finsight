export const WhyItsDifferent = () => {
  const differentiators = [
    "Not a tracker. Not a robo-advisor. Not a static dashboard.",
    "This is on-demand financial analysis, powered by ChatGPT + real-time market awareness.", 
    "You ask the questions. FinSight finds the answers — in your data and in the world."
  ];

  return (
    <section className="py-24 bg-navy text-white">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center space-y-12">
          <h2 className="text-4xl md:text-5xl font-bold">
            Why It&apos;s Different
          </h2>
          
          <div className="space-y-8">
            {differentiators.map((point, index) => (
              <div key={index} className="text-xl md:text-2xl leading-relaxed">
                {index === 1 ? (
                  <p className="text-green-light font-semibold">{point}</p>
                ) : (
                  <p className="text-white/90">{point}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}; 