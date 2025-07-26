import { Button } from "@/components/ui/button";

export const FinalCTA = () => {
  return (
    <section className="py-24 bg-navy text-white">
      <div className="container mx-auto px-4 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          <h2 className="text-4xl md:text-6xl font-bold">
            You've got financial questions.
          </h2>
          <h3 className="text-2xl md:text-4xl text-green-light font-light">
            FinSight has answers — based on your real data and the real world.
          </h3>
          
          <div className="pt-8">
            <Button size="lg" className="bg-green hover:bg-green-light text-white px-12 py-6 text-xl font-semibold rounded-lg transition-all hover:scale-105">
              Join the Waitlist
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}; 