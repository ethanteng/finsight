"use client";

/**
 * Testimonial wall shell for D3.2.
 * Real first-name + role + photo + outcome quotes must be collected with
 * permission before this section is populated — do not invent quotes.
 */
export default function TestimonialWall() {
  return (
    <section id="testimonials" className="py-20 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-10">
          <h2 className="text-3xl md:text-4xl font-bold">
            What early users are <span className="gradient-text">asking</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Named stories from real households will live here once we have
            permission to publish them. Until then, try the demo and see a full
            reasoning answer yourself.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((slot) => (
            <div
              key={slot}
              className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 min-h-[160px] flex flex-col justify-between"
            >
              <p className="text-sm text-muted-foreground italic">
                &ldquo;Quote from a consenting beta tester — first name, role,
                and outcome — pending.&rdquo;
              </p>
              <div className="mt-6 flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full bg-muted border border-border"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    First name · Role
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    Outcome pending
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
