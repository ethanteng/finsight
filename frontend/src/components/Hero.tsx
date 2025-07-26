import { Button } from "@/components/ui/button";

export const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 bg-gradient-to-br from-navy via-navy-light to-navy">
        <div className="absolute inset-0 bg-navy/80"></div>
      </div>
      
      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center text-white">
        <div className="max-w-4xl mx-auto space-y-8">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
            Ask Linc
          </h1>
          
          <h2 className="text-xl md:text-3xl font-light text-green-light">
            ChatGPT + your financial life + current market data.
          </h2>
          
          <p className="text-lg md:text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
            No dashboards. No spreadsheets. Just connect your accounts and ask a question — Linc analyzes your actual data, plus what&apos;s happening in the market, to give you smart answers.
          </p>
          
          <div className="pt-4">
            <Button size="lg" className="bg-green hover:bg-green-light text-white px-8 py-4 text-lg font-semibold rounded-lg transition-all hover:scale-105">
              Join the Waitlist
            </Button>
          </div>
        </div>
      </div>
      
      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-white/50 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-white/50 rounded-full mt-2"></div>
        </div>
      </div>
    </section>
  );
}; 